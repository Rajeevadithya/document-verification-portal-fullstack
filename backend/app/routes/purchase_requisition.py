"""
Purchase Requisition Routes
=============================
GET  /api/pr/                                    – list all PRs (summary)
GET  /api/pr/<pr_number>                         – get full PR details
POST /api/pr/<pr_number>/documents/upload        – upload multiple PR documents at once
PUT  /api/pr/<pr_number>/documents/<doc_id>/change – replace a PR document
GET  /api/pr/<pr_number>/documents               – view all active documents for a PR
GET  /api/pr/documents/<doc_id>/download         – download a specific document
GET  /api/pr/<pr_number>/documents/audit-logs    – full audit log for all PR documents
GET  /api/pr/documents/<doc_id>/audit-logs       – audit log for one specific document
"""
import os
from collections import OrderedDict
from flask import Blueprint, request, send_file
from app import mongo
from datetime import datetime
from app.utils.helpers import (
    serialize_doc, success_response, error_response, allowed_file
)
from app.services.document_service import (
    save_document, change_document, delete_document, get_active_documents,
    get_document_by_id, get_document_audit_logs
)

pr_bp = Blueprint("purchase_requisition", __name__)


@pr_bp.route("/ingest", methods=["POST"])
def ingest_pr():
    data = request.json
    if not data:
        return error_response("No data received", 400)

    def build_pr_doc(pr):
        """
        Header Data  : pr_number, document_type
        Item Data    : item_number, material, unit_of_measure, quantity,
                       valuation_price, delivery_date, plant,
                       storage_location, purchase_group
        """
        items = []
        for item in pr.get("items", []):
            items.append({
                "item_number":      item.get("item_number"),
                "material":         item.get("material"),
                "unit_of_measure":  item.get("unit_of_measure"),
                "quantity":         item.get("quantity"),
                "valuation_price":  item.get("valuation_price"),
                "delivery_date":    item.get("delivery_date"),
                "plant":            item.get("plant"),
                "storage_location": item.get("storage_location"),
                "purchase_group":   item.get("purchase_group"),
            })

        return {
            # ── Header ──────────────────────────────────────────────────────
            "pr_number":     pr.get("pr_number"),
            "document_type": pr.get("document_type", "NB"),
            "status":        pr.get("status", "Open"),
            # ── Item Data ───────────────────────────────────────────────────
            "items":      items,
            "created_at": datetime.utcnow(),
        }

    # ── Multiple PRs ──────────────────────────────────────────────────────────
    if isinstance(data, list):
        inserted = []
        for pr in data:
            pr_doc = build_pr_doc(pr)
            if not pr_doc["pr_number"]:
                continue
            mongo.db.purchase_requisitions.update_one(
                {"pr_number": pr_doc["pr_number"]},
                {"$set": pr_doc},
                upsert=True
            )
            inserted.append(pr_doc["pr_number"])
        return success_response(inserted, "PRs ingested")

    # ── Single PR ─────────────────────────────────────────────────────────────
    pr_doc = build_pr_doc(data)
    if not pr_doc["pr_number"]:
        return error_response("pr_number required", 400)

    mongo.db.purchase_requisitions.update_one(
        {"pr_number": pr_doc["pr_number"]},
        {"$set": pr_doc},
        upsert=True
    )
    return success_response(pr_doc, "PR ingested")


# ── List all PRs ──────────────────────────────────────────────────────────────
@pr_bp.route("/", methods=["GET"])
def list_prs():
    cursor = mongo.db.purchase_requisitions.find(
        {},
        {
            "pr_number":     1,
            "document_type": 1,
            "status":        1,
            "created_at":    1,
            "items":         1,
            "_id":           1,
        }
    ).sort("pr_number", 1)

    # Header: pr_number, document_type
    # Items : item_number, material, unit_of_measure, quantity,
    #         valuation_price, delivery_date, plant, storage_location, purchase_group
    KEY_ORDER = [
        "_id", "pr_number", "document_type",
        "status", "created_at", "items",
    ]

    ITEM_ORDER = [
        "item_number", "material", "unit_of_measure", "quantity",
        "valuation_price", "delivery_date", "plant",
        "storage_location", "purchase_group",
    ]

    def reorder_item(item):
        ordered = OrderedDict()
        for k in ITEM_ORDER:
            if k in item:
                ordered[k] = item[k]
        for k, v in item.items():
            if k not in ordered:
                ordered[k] = v
        return ordered

    def reorder(doc):
        # Re-order fields inside each item
        doc["items"] = [reorder_item(item) for item in doc.get("items", [])]

        ordered = OrderedDict()
        for k in KEY_ORDER:
            if k in doc:
                ordered[k] = doc[k]
        for k, v in doc.items():
            if k not in ordered:
                ordered[k] = v
        return ordered

    raw = serialize_doc(list(cursor))
    data = [reorder(pr) for pr in raw]
    return success_response(data, "Purchase Requisitions fetched")


# ── Get PR details ────────────────────────────────────────────────────────────
@pr_bp.route("/<pr_number>", methods=["GET"])
def get_pr(pr_number):
    pr = mongo.db.purchase_requisitions.find_one({"pr_number": pr_number})
    if not pr:
        return error_response(f"PR '{pr_number}' not found", 404)

    data = serialize_doc(pr)
    docs = get_active_documents("PR", pr_number)
    data["uploaded_documents_count"] = len(docs)
    data["has_documents"] = len(docs) > 0
    return success_response(data, "PR details fetched")


# ── Upload multiple documents ─────────────────────────────────────────────────
@pr_bp.route("/<pr_number>/documents/upload", methods=["POST"])
def upload_pr_document(pr_number):
    pr = mongo.db.purchase_requisitions.find_one({"pr_number": pr_number})
    if not pr:
        return error_response(f"PR '{pr_number}' not found", 404)

    files = request.files.getlist("files")
    if not files:
        single = request.files.get("file")
        if single:
            files = [single]

    if not files or all(f.filename == "" for f in files):
        return error_response(
            "No file(s) provided. "
            "Send one or more files under the form key 'files' "
            "(or 'file' for a single file).",
            400
        )

    uploaded = []
    errors = []
    seen_hashes_this_batch = {}

    for f in files:
        if not f or f.filename == "":
            continue

        if not allowed_file(f.filename):
            errors.append({
                "filename": f.filename,
                "reason":   "INVALID_TYPE",
                "error":    "File type not allowed. Accepted: pdf, png, jpg, jpeg, tiff, bmp",
            })
            continue

        from app.services.document_service import _compute_hash
        batch_hash = _compute_hash(f)
        if batch_hash in seen_hashes_this_batch:
            errors.append({
                "filename": f.filename,
                "reason":   "DUPLICATE_IN_BATCH",
                "error": (
                    f"This file has identical content to "
                    f"'{seen_hashes_this_batch[batch_hash]}' "
                    f"which was already included in this upload batch."
                ),
            })
            continue

        seen_hashes_this_batch[batch_hash] = f.filename

        try:
            doc = save_document(f, "PR", pr_number)
            uploaded.append({
                "document_id":          doc["_id"],
                "original_filename":    doc["original_filename"],
                "stored_filename":      doc["filename"],
                "file_size_bytes":      doc["file_size"],
                "mime_type":            doc["mime_type"],
                "ocr_status":           doc["ocr_status"],
                "ocr_rejection_detail": doc.get("ocr_rejection_detail"),
                "version":              doc["version"],
                "uploaded_by":          doc["uploaded_by"],
                "uploaded_at":          doc["uploaded_at"],
            })
        except ValueError as dup_exc:
            errors.append({"filename": f.filename, "reason": "DUPLICATE_FILE", "error": str(dup_exc)})
        except Exception as exc:
            errors.append({"filename": f.filename, "reason": "UPLOAD_ERROR", "error": str(exc)})

    if uploaded:
        mongo.db.notifications.update_many(
            {"type": "MISSING_DOCUMENT", "stage": "PR", "reference_number": pr_number},
            {"$set": {"is_read": True}}
        )

    response_data = {
        "pr_number":      pr_number,
        "uploaded":       uploaded,
        "uploaded_count": len(uploaded),
        "errors":         errors,
        "error_count":    len(errors),
    }

    if not uploaded:
        return error_response("No files were uploaded successfully", 400, errors)

    return success_response(
        response_data,
        f"{len(uploaded)} document(s) uploaded successfully"
        + (f"; {len(errors)} rejected" if errors else ""),
        201,
    )


# ── Change (replace) a specific document ─────────────────────────────────────
@pr_bp.route("/<pr_number>/documents/<doc_id>/change", methods=["PUT"])
def change_pr_document(pr_number, doc_id):
    pr = mongo.db.purchase_requisitions.find_one({"pr_number": pr_number})
    if not pr:
        return error_response(f"PR '{pr_number}' not found", 404)

    if "file" not in request.files:
        return error_response("No replacement file provided. Use key 'file'.", 400)

    f = request.files["file"]
    if f.filename == "":
        return error_response("No file selected", 400)
    if not allowed_file(f.filename):
        return error_response("File type not allowed", 400)

    try:
        updated_doc = change_document(doc_id, f, "PR", pr_number)
    except ValueError as dup_exc:
        return error_response(str(dup_exc), 409)

    if not updated_doc:
        return error_response(f"Document '{doc_id}' not found", 404)

    return success_response(updated_doc, "Document replaced successfully")


# ── View all active documents ─────────────────────────────────────────────────
@pr_bp.route("/<pr_number>/documents", methods=["GET"])
def view_pr_documents(pr_number):
    pr = mongo.db.purchase_requisitions.find_one({"pr_number": pr_number})
    if not pr:
        return error_response(f"PR '{pr_number}' not found", 404)

    docs = get_active_documents("PR", pr_number)
    return success_response(
        {"pr_number": pr_number, "documents": docs, "count": len(docs)},
        "Documents fetched",
    )


# ── Delete a document ─────────────────────────────────────────────────────────
@pr_bp.route("/documents/<doc_id>", methods=["DELETE"])
def delete_pr_document(doc_id):
    doc = get_document_by_id(doc_id)
    if not doc or doc.get("stage") != "PR":
        return error_response("Document not found", 404)

    deleted = delete_document(doc_id, stage="PR", reference_number=doc.get("reference_number"))
    if not deleted:
        return error_response("Document not found", 404)

    return success_response(deleted, "Document deleted successfully")


# ── Download document ─────────────────────────────────────────────────────────
@pr_bp.route("/documents/<doc_id>/download", methods=["GET"])
def download_pr_document(doc_id):
    doc = get_document_by_id(doc_id)
    if not doc:
        return error_response("Document not found", 404)
    if not os.path.exists(doc["file_path"]):
        return error_response("File not found on server", 404)
    inline = request.args.get("inline", "false").lower() == "true"
    return send_file(
        doc["file_path"],
        mimetype=doc.get("mime_type", "application/octet-stream"),
        as_attachment=not inline,
        download_name=doc["original_filename"],
    )


# ── Audit logs for all documents under a PR ───────────────────────────────────
@pr_bp.route("/<pr_number>/documents/audit-logs", methods=["GET"])
def pr_document_audit_logs(pr_number):
    pr = mongo.db.purchase_requisitions.find_one({"pr_number": pr_number})
    if not pr:
        return error_response(f"PR '{pr_number}' not found", 404)

    logs = get_document_audit_logs(stage="PR", reference_number=pr_number)
    return success_response(
        {"pr_number": pr_number, "audit_logs": logs, "count": len(logs)},
        "Audit logs fetched",
    )


# ── Audit log for one specific document ──────────────────────────────────────
@pr_bp.route("/documents/<doc_id>/audit-logs", methods=["GET"])
def document_audit_log(doc_id):
    doc = get_document_by_id(doc_id)
    if not doc:
        return error_response("Document not found", 404)

    logs = get_document_audit_logs(document_id=doc_id)
    return success_response(
        {"document_id": doc_id, "audit_logs": logs, "count": len(logs)},
        "Document audit logs fetched",
    )