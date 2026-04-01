"""
Purchase Requisition Routes
=============================
GET  /api/pr/                                    – list all PRs (summary)
GET  /api/pr/<pr_number>                         – get full PR details
POST /api/pr/<pr_number>/documents/upload        – upload multiple PR documents
PUT  /api/pr/<pr_number>/documents/<doc_id>/change – replace a PR document
GET  /api/pr/<pr_number>/documents               – view all active documents
GET  /api/pr/documents/<doc_id>/download         – download a specific document
GET  /api/pr/<pr_number>/documents/audit-logs    – audit log for all PR docs
GET  /api/pr/documents/<doc_id>/audit-logs       – audit log for one document

Field order (image spec + real Excel data):
    Header : pr_number, document_type, total_value
    Items  : item_number, material, material_description, plant,
             quantity, price, amount, purchase_organization
"""
import os
from collections import OrderedDict
from flask import Blueprint, request, send_file
from backend.app import mongo
from datetime import datetime
from backend.app.utils.helpers import (
    serialize_doc, success_response, error_response, allowed_file
)
from backend.app.services.document_service import (
    save_document, change_document, delete_document, get_active_documents,
    get_document_by_id, get_document_audit_logs
)

pr_bp = Blueprint("purchase_requisition", __name__)

# ── Field order (image spec) ──────────────────────────────────────────────────
PR_KEY_ORDER = [
    "purchaseRequisitionNumber",  # Header 1
    "purchaseDocumentType",       # Header 2
    "totalValue",                 # Header 3
    "items",
]

PR_ITEM_ORDER = [
    "itemNumber",           # Item 1
    "material",             # Item 2
    "materialDescription",  # Item 3
    "plant",                # Item 4
    "quantity",             # Item 5
    "price",                # Item 6
    "amount",               # Item 7
    "purchaseOrganization", # Item 8
]


def _calc_total_value(items):
    try:
        return round(sum(float(i.get("amount", 0) or 0) for i in items), 2)
    except (TypeError, ValueError):
        return 0.0


def _format_pr_response(pr_doc):
    serialized = serialize_doc(pr_doc)

    def reorder_item(item):
        ordered = OrderedDict()
        ordered["itemNumber"]          = item.get("itemNumber", "")
        ordered["material"]            = item.get("material", "")
        ordered["materialDescription"] = item.get("materialDescription", "")
        ordered["plant"]               = item.get("plant", "")
        ordered["quantity"]            = item.get("quantity", "")
        ordered["price"]               = item.get("price", "")
        ordered["amount"]              = item.get("amount", "")
        ordered["purchaseOrganization"]= item.get("purchaseOrganization", "")
        return ordered

    items = [reorder_item(i) for i in serialized.get("items", [])]

    total_value = serialized.get("totalValue")
    if total_value is None:
        total_value = _calc_total_value(serialized.get("items", []))

    data = OrderedDict()
    data["purchaseRequisitionNumber"] = serialized.get("purchaseRequisitionNumber", "")
    data["purchaseDocumentType"]      = serialized.get("purchaseDocumentType", "")
    data["totalValue"]                = total_value
    data["items"]                     = items
    return data


# ── Ingest ────────────────────────────────────────────────────────────────────
@pr_bp.route("/ingest", methods=["POST"])
def ingest_pr():
    """
    POST body (single PR or list of PRs):
    {
        "purchaseRequisitionNumber":     "10000010",
        "purchaseDocumentType": "ZSER",
        "totalValue":   100.0,          <- optional, auto-calculated if omitted
        "items": [
            {
                "itemNumber":           "00010",
                "material":              "MWDTSTWI04",
                "materialDescription":  "Steel Wire Rope 4.9mm Alpes",
                "plant":                 "MCMK",
                "quantity":              1,
                "price":                 100.0,
                "amount":                100.0,
                "purchaseOrganization": ""
            }
        ]
    }
    """
    data = request.json
    if not data:
        return error_response("No data received", 400)

    def build_pr_doc(pr):
        items = []
        for item in pr.get("items", []):
            qty   = float(item.get("quantity") or 0)
            price = float(item.get("price") or 0)
            items.append({
                "itemNumber":           item.get("itemNumber", ""),
                "material":              item.get("material", ""),
                "materialDescription":  item.get("materialDescription", ""),
                "plant":                 item.get("plant", ""),
                "quantity":              qty,
                "price":                 price,
                "amount":                round(float(item.get("amount") or qty * price), 2),
                "purchaseOrganization": item.get("purchaseOrganization", ""),
            })

        total_value = pr.get("totalValue")
        if total_value is None:
            total_value = _calc_total_value(items)

        return {
            "purchaseRequisitionNumber":     pr.get("purchaseRequisitionNumber"),
            "purchaseDocumentType": pr.get("purchaseDocumentType", ""),
            "totalValue":   round(float(total_value), 2),
            "items":         items,
            "created_at":    datetime.utcnow(),
            "updated_at":    datetime.utcnow(),
        }

    if isinstance(data, list):
        inserted = []
        for pr in data:
            pr_doc = build_pr_doc(pr)
            if not pr_doc["purchaseRequisitionNumber"]:
                continue
            mongo.db.purchase_requisitions.update_one(
                {"purchaseRequisitionNumber": pr_doc["purchaseRequisitionNumber"]},
                {"$set": pr_doc},
                upsert=True
            )
            inserted.append(pr_doc["purchaseRequisitionNumber"])
        return success_response(inserted, "PRs ingested")

    pr_doc = build_pr_doc(data)
    if not pr_doc["purchaseRequisitionNumber"]:
        return error_response("pr_number required", 400)

    mongo.db.purchase_requisitions.update_one(
        {"purchaseRequisitionNumber": pr_doc["purchaseRequisitionNumber"]},
        {"$set": pr_doc},
        upsert=True
    )
    return success_response(_format_pr_response(pr_doc), "PR ingested")


# ── List all PRs ──────────────────────────────────────────────────────────────
@pr_bp.route("/", methods=["GET"])
def list_prs():
    cursor = mongo.db.purchase_requisitions.find(
        {},
        {"purchaseRequisitionNumber": 1, "purchaseDocumentType": 1, "totalValue": 1, "items": 1}
    ).sort("purchaseRequisitionNumber", 1)

    raw  = serialize_doc(list(cursor))
    data = [_format_pr_response(pr) for pr in raw]
    return success_response(data, "Purchase Requisitions fetched")


# ── Get PR details ────────────────────────────────────────────────────────────
@pr_bp.route("/<pr_number>", methods=["GET"])
def get_pr(pr_number):
    pr = mongo.db.purchase_requisitions.find_one({"purchaseRequisitionNumber": pr_number})
    if not pr:
        return error_response(f"PR '{pr_number}' not found", 404)
    return success_response(_format_pr_response(pr), "PR details fetched")


# ── Upload multiple documents ─────────────────────────────────────────────────
@pr_bp.route("/<pr_number>/documents/upload", methods=["POST"])
def upload_pr_document(pr_number):
    pr = mongo.db.purchase_requisitions.find_one({"purchaseRequisitionNumber": pr_number})
    if not pr:
        return error_response(f"PR '{pr_number}' not found", 404)

    files = request.files.getlist("files")
    if not files:
        single = request.files.get("file")
        if single:
            files = [single]

    if not files or all(f.filename == "" for f in files):
        return error_response(
            "No file(s) provided. Use key 'files' (or 'file' for single).", 400
        )

    uploaded, errors = [], []
    seen_hashes = {}

    for f in files:
        if not f or f.filename == "":
            continue
        if not allowed_file(f.filename):
            errors.append({"filename": f.filename, "reason": "INVALID_TYPE",
                           "error": "Accepted: pdf, png, jpg, jpeg, tiff, bmp"})
            continue

        from backend.app.services.document_service import _compute_hash
        h = _compute_hash(f)
        if h in seen_hashes:
            errors.append({"filename": f.filename, "reason": "DUPLICATE_IN_BATCH",
                           "error": f"Identical content as '{seen_hashes[h]}' in this batch."})
            continue
        seen_hashes[h] = f.filename

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
        except ValueError as e:
            errors.append({"filename": f.filename, "reason": "DUPLICATE_FILE", "error": str(e)})
        except Exception as e:
            errors.append({"filename": f.filename, "reason": "UPLOAD_ERROR", "error": str(e)})

    if uploaded:
        mongo.db.notifications.update_many(
            {"type": "MISSING_DOCUMENT", "stage": "PR", "reference_number": pr_number},
            {"$set": {"is_read": True}}
        )

    if not uploaded:
        return error_response("No files were uploaded successfully", 400, errors)

    return success_response(
        {"purchaseRequisitionNumber": pr_number, "uploaded": uploaded,
         "uploaded_count": len(uploaded), "errors": errors, "error_count": len(errors)},
        f"{len(uploaded)} document(s) uploaded" + (f"; {len(errors)} rejected" if errors else ""),
        201,
    )


# ── Change (replace) a document ───────────────────────────────────────────────
@pr_bp.route("/<pr_number>/documents/<doc_id>/change", methods=["PUT"])
def change_pr_document(pr_number, doc_id):
    pr = mongo.db.purchase_requisitions.find_one({"purchaseRequisitionNumber": pr_number})
    if not pr:
        return error_response(f"PR '{pr_number}' not found", 404)
    if "file" not in request.files:
        return error_response("No replacement file provided. Use key 'file'.", 400)
    f = request.files["file"]
    if f.filename == "" or not allowed_file(f.filename):
        return error_response("Invalid or unsupported file", 400)
    try:
        updated_doc = change_document(doc_id, f, "PR", pr_number)
    except ValueError as e:
        return error_response(str(e), 409)
    if not updated_doc:
        return error_response(f"Document '{doc_id}' not found", 404)
    return success_response(updated_doc, "Document replaced successfully")


# ── View active documents ─────────────────────────────────────────────────────
@pr_bp.route("/<pr_number>/documents", methods=["GET"])
def view_pr_documents(pr_number):
    pr = mongo.db.purchase_requisitions.find_one({"purchaseRequisitionNumber": pr_number})
    if not pr:
        return error_response(f"PR '{pr_number}' not found", 404)
    docs = get_active_documents("PR", pr_number)
    return success_response(
        {"purchaseRequisitionNumber": pr_number, "documents": docs, "count": len(docs)},
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


# ── Audit logs – all docs under a PR ─────────────────────────────────────────
@pr_bp.route("/<pr_number>/documents/audit-logs", methods=["GET"])
def pr_document_audit_logs(pr_number):
    pr = mongo.db.purchase_requisitions.find_one({"purchaseRequisitionNumber": pr_number})
    if not pr:
        return error_response(f"PR '{pr_number}' not found", 404)
    logs = get_document_audit_logs(stage="PR", reference_number=pr_number)
    return success_response(
        {"purchaseRequisitionNumber": pr_number, "audit_logs": logs, "count": len(logs)},
        "Audit logs fetched",
    )


# ── Audit log – one document ──────────────────────────────────────────────────
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