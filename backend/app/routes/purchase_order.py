"""
Purchase Order Routes
=======================
GET  /api/po/                              – list all POs
GET  /api/po/<po_number>                   – get PO details
GET  /api/po/by-pr/<pr_number>             – get PO linked to a PR
POST /api/po/<po_number>/documents/upload  – upload PO document (single)
PUT  /api/po/<po_number>/documents/<doc_id>/change – replace PO document
GET  /api/po/<po_number>/documents         – view active PO document
GET  /api/po/documents/<doc_id>/download   – download PO document
"""
from collections import OrderedDict
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


@po_bp.route("/ingest", methods=["POST"])
def ingest_po():
    """
    Header Data : po_number, document_type, purchase_organization,
                  purchase_requisition_number, purchase_group, company_code
    Item Data   : vendor, item_number, material, quantity, net_price,
                  delivery_date, plant, storage_location
    """
    data = request.get_json()
    if not data:
        return error_response("No data received", 400)

    header_vendor = data.get("vendor", "")

    # purchase_requisition_number = explicit field OR fall back to pr_number
    pr_number = data.get("pr_number") or data.get("purchase_requisition_number") or ""

    items = []
    for item in data.get("items", []):
        items.append({
            "vendor":           item.get("vendor") or header_vendor,
            "item_number":      item.get("item_number"),
            "material":         item.get("material"),
            "quantity":         item.get("quantity"),
            "net_price":        item.get("net_price"),
            "delivery_date":    item.get("delivery_date"),
            "plant":            item.get("plant"),
            "storage_location": item.get("storage_location"),
        })

    po_doc = {
        # ── Header ────────────────────────────────────────────────────────────
        "po_number":                   data.get("po_number"),
        "document_type":               data.get("document_type", "Standard PO"),
        "purchase_organization":       data.get("purchase_organization"),
        "purchase_requisition_number": pr_number,
        "purchase_group":              data.get("purchase_group"),
        "company_code":                data.get("company_code"),
        "vendor":                      header_vendor,
        "status":                      data.get("status", "OPEN"),
        # ── Item Data ─────────────────────────────────────────────────────────
        "items":      items,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    if not po_doc["po_number"]:
        return error_response("po_number is required", 400)

    mongo.db.purchase_orders.update_one(
        {"po_number": po_doc["po_number"]},
        {"$set": po_doc},
        upsert=True
    )
    return success_response(po_doc, "PO ingested")


# ── List all POs ──────────────────────────────────────────────────────────────
@po_bp.route("/", methods=["GET"])
def list_pos():
    cursor = mongo.db.purchase_orders.find(
        {},
        {
            "po_number":                   1,
            "document_type":               1,
            "purchase_organization":       1,
            "purchase_requisition_number": 1,
            "purchase_group":              1,
            "company_code":                1,
            "vendor":                      1,
            "status":                      1,
            "created_at":                  1,
            "items":                       1,
            "_id":                         1,
        }
    ).sort("po_number", 1)

    # Header: po_number, document_type, purchase_organization,
    #         purchase_requisition_number, purchase_group, company_code
    # Items : vendor, item_number, material, quantity, net_price,
    #         delivery_date, plant, storage_location
    KEY_ORDER = [
        "_id", "po_number", "document_type", "purchase_organization",
        "purchase_requisition_number", "purchase_group", "company_code",
        "status", "created_at", "items",
    ]

    ITEM_ORDER = [
        "vendor", "item_number", "material", "quantity",
        "net_price", "delivery_date", "plant", "storage_location",
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
    data = [reorder(po) for po in raw]
    return success_response(data, "Purchase Orders fetched")


# ── Get PO details ────────────────────────────────────────────────────────────
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


# ── Get PO by PR ──────────────────────────────────────────────────────────────
@po_bp.route("/by-pr/<pr_number>", methods=["GET"])
def get_po_by_pr(pr_number):
    po = mongo.db.purchase_orders.find_one({
        "$or": [
            {"purchase_requisition_number": pr_number},
            {"pr_number": pr_number}
        ]
    })
    if not po:
        return error_response(f"No PO found for PR '{pr_number}'", 404)

    data = serialize_doc(po)
    docs = get_active_documents("PO", po["po_number"])
    data["uploaded_document"] = docs[0] if docs else None
    return success_response(data, "PO fetched for PR")


# ── Upload PO document (single) ───────────────────────────────────────────────
@po_bp.route("/<po_number>/documents/upload", methods=["POST"])
def upload_po_document(po_number):
    po = mongo.db.purchase_orders.find_one({"po_number": po_number})
    if not po:
        return error_response(f"PO '{po_number}' not found", 404)

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

    linked_pr = po.get("purchase_requisition_number") or po.get("pr_number")
    doc = save_document(f, "PO", po_number, linked_pr_number=linked_pr)

    if doc:
        mongo.db.notifications.update_many(
            {"type": "MISSING_DOCUMENT", "stage": "PO", "reference_number": po_number},
            {"$set": {"is_read": True}}
        )

    return success_response(doc, "PO document uploaded successfully", 201)


# ── Change (replace) PO document ─────────────────────────────────────────────
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

    linked_pr = po.get("purchase_requisition_number") or po.get("pr_number")
    updated = change_document(doc_id, f, "PO", po_number, linked_pr_number=linked_pr)
    if not updated:
        return error_response(f"Document '{doc_id}' not found", 404)

    return success_response(updated, "PO document replaced successfully")


# ── View active PO documents ──────────────────────────────────────────────────
@po_bp.route("/<po_number>/documents", methods=["GET"])
def view_po_documents(po_number):
    po = mongo.db.purchase_orders.find_one({"po_number": po_number})
    if not po:
        return error_response(f"PO '{po_number}' not found", 404)

    docs = get_active_documents("PO", po_number)
    return success_response(
        {"po_number": po_number, "document": docs[0] if docs else None, "count": len(docs)},
        "Documents fetched",
    )


# ── Delete PO document ────────────────────────────────────────────────────────
@po_bp.route("/documents/<doc_id>", methods=["DELETE"])
def delete_po_document(doc_id):
    doc = get_document_by_id(doc_id)
    if not doc or doc.get("stage") != "PO":
        return error_response("Document not found", 404)

    deleted = delete_document(doc_id, stage="PO", reference_number=doc.get("reference_number"))
    if not deleted:
        return error_response("Document not found", 404)

    return success_response(deleted, "PO document deleted successfully")


# ── Download PO document ──────────────────────────────────────────────────────
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
        download_name=doc["original_filename"],
    )