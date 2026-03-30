"""
Purchase Order Routes
=======================
GET  /api/po/                              – list all POs
GET  /api/po/<po_number>                   – get PO details (auto-fill)
GET  /api/po/by-pr/<pr_number>             – get PO linked to a PR
POST /api/po/<po_number>/documents/upload  – upload PO document (single)
PUT  /api/po/<po_number>/documents/<doc_id>/change – replace PO document
GET  /api/po/<po_number>/documents         – view active PO document
GET  /api/po/documents/<doc_id>/download   – download PO document
"""
from datetime import datetime
import os
from flask import Blueprint, request, send_file
from app import mongo
from app.utils.helpers import (
    serialize_doc, success_response, error_response, allowed_file
)
from app.services.document_service import (
    save_document, change_document, delete_document, get_active_documents, get_document_by_id
)

po_bp = Blueprint("purchase_order", __name__)


@po_bp.route("/", methods=["GET"])
def list_pos():
    cursor = mongo.db.purchase_orders.find(
        {}, {"po_number": 1, "pr_number": 1, "vendor": 1, "status": 1,
             "company_code": 1, "created_at": 1, "_id": 1}
    ).sort("po_number", 1)
    data = serialize_doc(list(cursor))
    return success_response(data, "Purchase Orders fetched")


@po_bp.route("/<po_number>", methods=["GET"])
def get_po(po_number):
    po = mongo.db.purchase_orders.find_one({"po_number": po_number})
    if not po:
        return error_response(f"PO '{po_number}' not found", 404)

    data = serialize_doc(po)
    docs = get_active_documents("PO", po_number)
    data["uploaded_document"] = docs[0] if docs else None
    data["has_document"] = len(docs) > 0
    return success_response(data, "PO details fetched")


@po_bp.route("/by-pr/<pr_number>", methods=["GET"])
def get_po_by_pr(pr_number):
    """Return the PO linked to a given PR number."""
    po = mongo.db.purchase_orders.find_one({"pr_number": pr_number})
    if not po:
        return error_response(f"No PO found for PR '{pr_number}'", 404)

    data = serialize_doc(po)
    docs = get_active_documents("PO", po["po_number"])
    data["uploaded_document"] = docs[0] if docs else None
    return success_response(data, "PO fetched for PR")


@po_bp.route("/<po_number>/documents/upload", methods=["POST"])
def upload_po_document(po_number):
    po = mongo.db.purchase_orders.find_one({"po_number": po_number})
    if not po:
        return error_response(f"PO '{po_number}' not found", 404)

    # Single document rule for PO
    existing = get_active_documents("PO", po_number)
    if existing:
        return error_response(
            "A document already exists for this PO. Use Change Document to replace it.", 400
        )

    if "file" not in request.files:
        return error_response("No file provided. Use key 'file'.", 400)

    f = request.files["file"]
    if f.filename == "":
        return error_response("No file selected", 400)
    if not allowed_file(f.filename):
        return error_response("File type not allowed", 400)

    # Pass linked PR number for cross-reference OCR validation
    linked_pr = po.get("pr_number")
    doc = save_document(f, "PO", po_number, linked_pr_number=linked_pr)

    if doc:
        mongo.db.notifications.update_many(
            {"type": "MISSING_DOCUMENT", "stage": "PO", "reference_number": po_number},
            {"$set": {"is_read": True}}
        )

    return success_response(doc, "PO document uploaded successfully", 201)


@po_bp.route("/<po_number>/documents/<doc_id>/change", methods=["PUT"])
def change_po_document(po_number, doc_id):
    po = mongo.db.purchase_orders.find_one({"po_number": po_number})
    if not po:
        return error_response(f"PO '{po_number}' not found", 404)

    if "file" not in request.files:
        return error_response("No replacement file provided. Use key 'file'.", 400)

    f = request.files["file"]
    if f.filename == "" or not allowed_file(f.filename):
        return error_response("Invalid file", 400)

    linked_pr = po.get("pr_number")
    updated = change_document(doc_id, f, "PO", po_number, linked_pr_number=linked_pr)
    if not updated:
        return error_response(f"Document '{doc_id}' not found", 404)

    return success_response(updated, "PO document replaced successfully")


@po_bp.route("/<po_number>/documents", methods=["GET"])
def view_po_documents(po_number):
    po = mongo.db.purchase_orders.find_one({"po_number": po_number})
    if not po:
        return error_response(f"PO '{po_number}' not found", 404)

    docs = get_active_documents("PO", po_number)
    return success_response(
        {"po_number": po_number, "document": docs[0] if docs else None, "count": len(docs)},
        "Documents fetched"
    )

@po_bp.route("/documents/<doc_id>", methods=["DELETE"])
def delete_po_document(doc_id):
    doc = get_document_by_id(doc_id)
    if not doc or doc.get("stage") != "PO":
        return error_response("Document not found", 404)

    deleted = delete_document(doc_id, stage="PO", reference_number=doc.get("reference_number"))
    if not deleted:
        return error_response("Document not found", 404)

    return success_response(deleted, "PO document deleted successfully")


@po_bp.route("/documents/<doc_id>/download", methods=["GET"])
def download_po_document(doc_id):
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
        download_name=doc["original_filename"]
    )

@po_bp.route("/ingest", methods=["POST"])
def ingest_po():
    data = request.get_json()

    if not data:
        return error_response("No data received", 400)

    po_doc = {
        "po_number": data.get("po_number"),
        "pr_number": data.get("pr_number"),
        "document_type": data.get("document_type", "Standard PO"),
        "purchase_organization": data.get("purchase_organization"),
        "purchase_group": data.get("purchase_group"),
        "company_code": data.get("company_code"),
        "vendor": data.get("vendor"),
        "status": data.get("status", "OPEN"),
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "items": data.get("items", [])
    }

    if not po_doc["po_number"]:
        return error_response("po_number is required", 400)

    mongo.db.purchase_orders.update_one(
        {"po_number": po_doc["po_number"]},
        {"$set": po_doc},
        upsert=True
    )

    return success_response(po_doc, "PO ingested")