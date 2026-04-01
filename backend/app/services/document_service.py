"""
Document Service
=================
Handles saving, retrieving, and managing uploaded documents for all stages.
"""
import os
import hashlib
from datetime import datetime
from bson import ObjectId
from flask import request as flask_request
from backend.app import mongo
from backend.app.utils.helpers import safe_filename, get_upload_path
from backend.app.services.ocr_service import validate_document, build_rejection_explanation


class OCRValidationError(ValueError):
    """Raised when OCR validation blocks a document upload or replacement."""

    def __init__(self, message: str, *, ocr_result: dict | None = None, ocr_rejection_detail: dict | None = None):
        super().__init__(message)
        self.ocr_result = ocr_result
        self.ocr_rejection_detail = ocr_rejection_detail


# ── duplicate detection ───────────────────────────────────────────────────────

def _compute_hash(file_obj) -> str:
    """Compute MD5 hash of file content. Rewinds the file pointer after reading."""
    hasher = hashlib.md5()
    file_obj.seek(0)
    for chunk in iter(lambda: file_obj.read(8192), b""):
        hasher.update(chunk)
    file_obj.seek(0)
    return hasher.hexdigest()


def is_duplicate(file_hash: str, stage: str, reference_number: str) -> dict | None:
    """
    Check if a file with the same MD5 hash already exists (is_active=True)
    for this stage + reference_number.
    Returns the existing document dict if duplicate, else None.
    """
    existing = mongo.db.documents.find_one({
        "stage": stage.upper(),
        "reference_number": reference_number,
        "file_hash": file_hash,
        "is_active": True
    })
    return _serialize_one(existing) if existing else None


def _build_ocr_failure_message(stage: str, reference_number: str, rejection_detail: dict | None, ocr_result: dict) -> str:
    stage_upper = stage.upper()
    reasons = rejection_detail.get("failure_reasons", []) if rejection_detail else []
    simple_reasons: list[str] = []

    for reason in reasons:
        check = (reason.get("check") or "").lower()
        found = reason.get("found") or ""

        if "reference number presence" in check:
            if stage_upper == "PR":
                simple_reasons.append("PR number doesn't match the uploaded document.")
            elif stage_upper == "PO":
                simple_reasons.append("PO number doesn't match the uploaded document.")
            elif stage_upper == "GRN":
                simple_reasons.append("GRN number doesn't match the uploaded document.")
            else:
                simple_reasons.append("Document number doesn't match the uploaded document.")
        elif "cross-reference validation" in check:
            simple_reasons.append("Linked PR number is missing from the PO document.")
        elif "document type detection" in check:
            if found and found != "Undetected":
                simple_reasons.append(f"Uploaded file looks like a {found} document, not a {stage_upper} document.")
            else:
                simple_reasons.append("OCR could not clearly identify the document type.")

    if not simple_reasons and ocr_result.get("issues"):
        for issue in ocr_result["issues"][:2]:
            issue_text = str(issue).strip()
            if issue_text:
                simple_reasons.append(issue_text)

    if not simple_reasons:
        simple_reasons.append(f"{stage_upper} document validation failed.")

    deduped_reasons = list(dict.fromkeys(simple_reasons))
    return f"Upload blocked. {' '.join(deduped_reasons[:3])}"


def _should_block_for_ocr(stage: str, ocr_result: dict) -> bool:
    return stage.upper() in {"PR", "PO", "GRN"} and ocr_result.get("ocr_status") != "VALID"


# ── public API ────────────────────────────────────────────────────────────────

def save_document(file_obj, stage: str, reference_number: str,
                  linked_pr_number: str = None,
                  uploaded_by: str = None) -> dict:
    """
    Save file to disk and create a document record in MongoDB.
    - Rejects exact duplicates (same file content already active for this PR/stage).
    - Triggers OCR validation automatically.
    - Writes an audit log entry with who uploaded, when, and all saved details.
    Returns the created document dict.
    Raises ValueError if the file is a duplicate.
    """
    original_filename = file_obj.filename

    # ── duplicate check ──
    file_hash = _compute_hash(file_obj)
    duplicate = is_duplicate(file_hash, stage, reference_number)
    if duplicate:
        raise ValueError(
            f"Duplicate file rejected: '{original_filename}' has identical content to "
            f"an already uploaded document (id: {duplicate['_id']}, "
            f"uploaded at: {duplicate.get('uploaded_at')}, "
            f"uploaded by: {duplicate.get('uploaded_by', 'unknown')}). "
            f"Use the replace endpoint if you intend to update this document."
        )

    stored_name = safe_filename(stage, reference_number, original_filename)
    upload_path = get_upload_path(stage)
    full_path = os.path.join(upload_path, stored_name)

    file_obj.save(full_path)
    file_size = os.path.getsize(full_path)
    mime = _guess_mime(original_filename)

    # Run OCR
    ocr_result = validate_document(full_path, stage, reference_number, linked_pr_number)

    # Build detailed OCR rejection explanation when status is not VALID
    ocr_rejection_detail = None
    if ocr_result["ocr_status"] in ("INVALID", "REVIEW"):
        ocr_rejection_detail = build_rejection_explanation(ocr_result, stage, reference_number)

    if _should_block_for_ocr(stage, ocr_result):
        try:
            if os.path.exists(full_path):
                os.remove(full_path)
        finally:
            raise OCRValidationError(
                _build_ocr_failure_message(stage, reference_number, ocr_rejection_detail, ocr_result),
                ocr_result=ocr_result,
                ocr_rejection_detail=ocr_rejection_detail,
            )

    # Resolve uploader identity (explicit arg > form field > header > fallback)
    uploader = uploaded_by or _resolve_uploader()

    now = datetime.utcnow()
    doc = {
        "stage": stage.upper(),
        "reference_number": reference_number,
        "filename": stored_name,
        "original_filename": original_filename,
        "file_path": full_path,
        "file_size": file_size,
        "file_hash": file_hash,                          # stored for future duplicate checks
        "mime_type": mime,
        "ocr_status": ocr_result["ocr_status"],
        "ocr_result": ocr_result,
        "ocr_rejection_detail": ocr_rejection_detail,
        "version": 1,
        "is_active": True,
        "uploaded_by": uploader,
        "uploaded_at": now,
        "updated_at": now
    }
    result = mongo.db.documents.insert_one(doc)
    inserted_id = str(result.inserted_id)
    doc["_id"] = inserted_id
    doc["uploaded_at"] = now.isoformat()
    doc["updated_at"] = now.isoformat()

    # Write audit log
    _write_audit_log(
        action="DOCUMENT_UPLOADED",
        document_id=inserted_id,
        stage=stage,
        reference_number=reference_number,
        performed_by=uploader,
        details={
            "original_filename": original_filename,
            "stored_filename": stored_name,
            "file_size_bytes": file_size,
            "file_hash": file_hash,
            "mime_type": mime,
            "ocr_status": ocr_result["ocr_status"],
            "ocr_confidence": ocr_result.get("confidence"),
            "ocr_issues": ocr_result.get("issues", []),
            "version": 1
        }
    )

    # Auto-create notification if OCR fails
    if ocr_result["ocr_status"] in ("INVALID", "REVIEW"):
        _create_ocr_notification(stage, reference_number, ocr_result)

    return doc


def change_document(document_id: str, file_obj, stage: str,
                    reference_number: str, linked_pr_number: str = None,
                    uploaded_by: str = None) -> dict:
    """
    Replace an existing document. Archives old record (is_active=False),
    saves new file, inserts new record with incremented version.
    - Rejects if the replacement file is identical to the current active file.
    - Writes an audit log entry for both archival and new upload.
    """
    existing = mongo.db.documents.find_one({"_id": ObjectId(document_id)})
    if not existing:
        return None

    # ── duplicate check against the document being replaced ──
    file_hash = _compute_hash(file_obj)
    if existing.get("file_hash") == file_hash:
        raise ValueError(
            f"Duplicate file rejected: the replacement file has identical content to "
            f"the current document (version {existing.get('version', 1)}). "
            f"No changes were made."
        )

    original_filename = file_obj.filename
    stored_name = safe_filename(stage, reference_number, original_filename)
    upload_path = get_upload_path(stage)
    full_path = os.path.join(upload_path, stored_name)
    file_obj.save(full_path)
    file_size = os.path.getsize(full_path)
    mime = _guess_mime(original_filename)

    ocr_result = validate_document(full_path, stage, reference_number, linked_pr_number)

    ocr_rejection_detail = None
    if ocr_result["ocr_status"] in ("INVALID", "REVIEW"):
        ocr_rejection_detail = build_rejection_explanation(ocr_result, stage, reference_number)

    if _should_block_for_ocr(stage, ocr_result):
        try:
            if os.path.exists(full_path):
                os.remove(full_path)
        finally:
            raise OCRValidationError(
                _build_ocr_failure_message(stage, reference_number, ocr_rejection_detail, ocr_result),
                ocr_result=ocr_result,
                ocr_rejection_detail=ocr_rejection_detail,
            )

    old_version = existing.get("version", 1)
    uploader = uploaded_by or _resolve_uploader()
    now = datetime.utcnow()

    # Archive old record only after the replacement passes OCR validation.
    mongo.db.documents.update_one(
        {"_id": ObjectId(document_id)},
        {"$set": {"is_active": False, "updated_at": now}}
    )

    _write_audit_log(
        action="DOCUMENT_ARCHIVED",
        document_id=document_id,
        stage=stage,
        reference_number=reference_number,
        performed_by=uploader,
        details={
            "archived_version": old_version,
            "reason": "Replaced by new document upload"
        }
    )

    new_version = old_version + 1
    doc = {
        "stage": stage.upper(),
        "reference_number": reference_number,
        "filename": stored_name,
        "original_filename": original_filename,
        "file_path": full_path,
        "file_size": file_size,
        "file_hash": file_hash,
        "mime_type": mime,
        "ocr_status": ocr_result["ocr_status"],
        "ocr_result": ocr_result,
        "ocr_rejection_detail": ocr_rejection_detail,
        "version": new_version,
        "is_active": True,
        "uploaded_by": uploader,
        "uploaded_at": now,
        "updated_at": now
    }
    result = mongo.db.documents.insert_one(doc)
    inserted_id = str(result.inserted_id)
    doc["_id"] = inserted_id
    doc["uploaded_at"] = now.isoformat()
    doc["updated_at"] = now.isoformat()

    # Audit log for new version
    _write_audit_log(
        action="DOCUMENT_REPLACED",
        document_id=inserted_id,
        stage=stage,
        reference_number=reference_number,
        performed_by=uploader,
        details={
            "original_filename": original_filename,
            "stored_filename": stored_name,
            "file_size_bytes": file_size,
            "file_hash": file_hash,
            "mime_type": mime,
            "ocr_status": ocr_result["ocr_status"],
            "ocr_confidence": ocr_result.get("confidence"),
            "ocr_issues": ocr_result.get("issues", []),
            "version": new_version,
            "replaced_document_id": document_id
        }
    )

    return doc


def get_active_documents(stage: str, reference_number: str) -> list:
    """Return all active documents for a given stage + reference."""
    cursor = mongo.db.documents.find({
        "stage": stage.upper(),
        "reference_number": reference_number,
        "is_active": True
    }).sort("uploaded_at", -1)
    return _serialize_cursor(cursor)


def get_document_by_id(document_id: str) -> dict | None:
    doc = mongo.db.documents.find_one({"_id": ObjectId(document_id)})
    return _serialize_one(doc)


def delete_document(document_id: str, stage: str = None, reference_number: str = None, deleted_by: str = None) -> dict | None:
    """Soft-delete an active document, remove its file if present, and write an audit log."""
    existing = mongo.db.documents.find_one({"_id": ObjectId(document_id), "is_active": True})
    if not existing:
        return None

    now = datetime.utcnow()
    deleter = deleted_by or _resolve_uploader()
    resolved_stage = (stage or existing.get("stage") or "").upper()
    resolved_reference = reference_number or existing.get("reference_number")

    mongo.db.documents.update_one(
        {"_id": ObjectId(document_id)},
        {"$set": {"is_active": False, "updated_at": now, "deleted_at": now, "deleted_by": deleter}}
    )

    file_removed = False
    file_path = existing.get("file_path")
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
            file_removed = True
        except OSError:
            file_removed = False

    _write_audit_log(
        action="DOCUMENT_DELETED",
        document_id=document_id,
        stage=resolved_stage,
        reference_number=resolved_reference,
        performed_by=deleter,
        details={
            "deleted_version": existing.get("version", 1),
            "original_filename": existing.get("original_filename"),
            "stored_filename": existing.get("filename"),
            "file_removed": file_removed
        }
    )

    active_remaining = mongo.db.documents.count_documents({
        "stage": resolved_stage,
        "reference_number": resolved_reference,
        "is_active": True
    })
    if active_remaining == 0:
        mongo.db.notifications.insert_one({
            "type": "MISSING_DOCUMENT",
            "stage": resolved_stage,
            "reference_number": resolved_reference,
            "message": f"Document missing for {resolved_stage} {resolved_reference}. Please upload a replacement.",
            "action_label": "Upload Document",
            "action_route": "/documents",
            "is_read": False,
            "created_at": now
        })

    deleted = existing
    deleted["is_active"] = False
    deleted["updated_at"] = now
    deleted["deleted_at"] = now
    deleted["deleted_by"] = deleter
    return _serialize_one(deleted)


def get_document_audit_logs(document_id: str = None, stage: str = None,
                             reference_number: str = None) -> list:
    """
    Fetch audit logs.
    - By document_id: logs for one specific document
    - By stage + reference_number: all logs for a PR/PO/GRN/INVOICE
    """
    query = {}
    if document_id:
        query["document_id"] = document_id
    if stage:
        query["stage"] = stage.upper()
    if reference_number:
        query["reference_number"] = reference_number

    cursor = mongo.db.document_audit_logs.find(query).sort("timestamp", -1)
    logs = []
    for entry in cursor:
        entry["_id"] = str(entry["_id"])
        if isinstance(entry.get("timestamp"), datetime):
            entry["timestamp"] = entry["timestamp"].isoformat()
        logs.append(entry)
    return logs


# ── internal helpers ──────────────────────────────────────────────────────────

def _resolve_uploader() -> str:
    try:
        json_body = flask_request.get_json(silent=True) or {}
        if json_body.get("uploaded_by"):
            return str(json_body["uploaded_by"])
        if flask_request.form.get("uploaded_by"):
            return str(flask_request.form.get("uploaded_by"))
        if flask_request.headers.get("X-User-ID"):
            return str(flask_request.headers.get("X-User-ID"))
    except RuntimeError:
        pass
    return "system"


def _write_audit_log(action: str, document_id: str, stage: str,
                     reference_number: str, performed_by: str,
                     details: dict):
    ip_address = None
    user_agent = None
    try:
        ip_address = flask_request.remote_addr
        user_agent = flask_request.headers.get("User-Agent")
    except RuntimeError:
        pass

    mongo.db.document_audit_logs.insert_one({
        "action": action,
        "document_id": document_id,
        "stage": stage.upper(),
        "reference_number": reference_number,
        "performed_by": performed_by,
        "timestamp": datetime.utcnow(),
        "ip_address": ip_address,
        "user_agent": user_agent,
        "details": details
    })


def _guess_mime(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    MAP = {
        "pdf": "application/pdf",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "tiff": "image/tiff",
        "bmp": "image/bmp"
    }
    return MAP.get(ext, "application/octet-stream")


def _create_ocr_notification(stage: str, reference_number: str, ocr_result: dict):
    stage_route_map = {
        "PR": f"/document-uploads/pr/upload?pr={reference_number}",
        "PO": f"/document-uploads/po/upload?po={reference_number}",
        "GRN": f"/document-uploads/grn/upload?grn={reference_number}",
        "INVOICE": f"/document-uploads/invoice/upload?inv={reference_number}"
    }
    issues_str = "; ".join(ocr_result.get("issues", []))
    mongo.db.notifications.insert_one({
        "type": "OCR_REVIEW" if ocr_result["ocr_status"] == "REVIEW" else "OCR_FAILED",
        "stage": stage.upper(),
        "reference_number": reference_number,
        "message": f"OCR {ocr_result['ocr_status']} for {stage.upper()} {reference_number}: {issues_str}",
        "action_label": "View Document",
        "action_route": stage_route_map.get(stage.upper(), "/document-uploads"),
        "is_read": False,
        "created_at": datetime.utcnow()
    })


def _serialize_one(doc) -> dict | None:
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    for key in ("uploaded_at", "updated_at"):
        if key in doc and isinstance(doc[key], datetime):
            doc[key] = doc[key].isoformat()
    return doc


def _serialize_cursor(cursor) -> list:
    return [_serialize_one(d) for d in cursor]
