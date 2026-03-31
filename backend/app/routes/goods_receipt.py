"""
Goods Receipt (GRN) Routes
============================
GET  /api/grn/                              – list all GRNs
GET  /api/grn/<grn_number>                  – get GRN details
GET  /api/grn/by-po/<po_number>             – get GRN linked to a PO
POST /api/grn/<grn_number>/documents/upload – upload GRN document (single)
PUT  /api/grn/<grn_number>/documents/<doc_id>/change – replace GRN doc
GET  /api/grn/<grn_number>/documents        – view active GRN document
GET  /api/grn/documents/<doc_id>/download   – download GRN document
"""
import os
from collections import OrderedDict
from flask import Blueprint, request, send_file
from datetime import datetime
from app import mongo
from app.utils.helpers import (
    serialize_doc, success_response, error_response, allowed_file
)
from app.services.document_service import (
    save_document, change_document, delete_document, get_active_documents, get_document_by_id
)

grn_bp = Blueprint("goods_receipt", __name__)


@grn_bp.route("/ingest", methods=["POST"])
def ingest_grn():
    """
    Header Data : grn_number (goods_receipt_number),
                  purchase_requisition_number
    Item Data   : document_date, posting_date, item, material,
                  unit_of_measure, quantity, plant, storage_location, price
    """
    data = request.get_json()
    if not data:
        return error_response("No data received", 400)

    po_number = data.get("po_number") or ""

    # Support both field name styles for GRN number
    grn_number = (
        data.get("grn_number")
        or data.get("goods_receipt_number")
        or ""
    )

    # purchase_requisition_number: explicit > pr_number field > look up from PO
    pr_number = (
        data.get("purchase_requisition_number")
        or data.get("pr_number")
        or ""
    )
    if not pr_number and po_number:
        po = mongo.db.purchase_orders.find_one(
            {"po_number": po_number},
            {"purchase_requisition_number": 1, "pr_number": 1}
        )
        if po:
            pr_number = (
                po.get("purchase_requisition_number")
                or po.get("pr_number")
                or ""
            )

    items = []
    for item in data.get("items", []):
        items.append({
            "document_date":    item.get("document_date") or data.get("document_date"),
            "posting_date":     item.get("posting_date") or data.get("posting_date"),
            "item":             item.get("item"),
            "material":         item.get("material"),
            "unit_of_measure":  item.get("unit_of_measure"),
            "quantity":         item.get("quantity"),
            "plant":            item.get("plant"),
            "storage_location": item.get("storage_location"),
            "price":            item.get("price"),
        })

    grn_doc = {
        # ── Header ────────────────────────────────────────────────────────────
        "grn_number":                  grn_number,
        "goods_receipt_number":        grn_number,          # alias kept for clarity
        "po_number":                   po_number,
        "purchase_requisition_number": pr_number,
        "document_date":               data.get("document_date"),
        "posting_date":                data.get("posting_date"),
        "status":                      data.get("status", "POSTED"),
        # ── Item Data ─────────────────────────────────────────────────────────
        "items":      items,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    if not grn_doc["grn_number"]:
        return error_response("grn_number (or goods_receipt_number) is required", 400)

    mongo.db.goods_receipts.update_one(
        {"grn_number": grn_doc["grn_number"]},
        {"$set": grn_doc},
        upsert=True
    )
    return success_response(grn_doc, "GRN ingested")


# ── List all GRNs ─────────────────────────────────────────────────────────────
@grn_bp.route("/", methods=["GET"])
def list_grns():
    cursor = mongo.db.goods_receipts.find(
        {},
        {
            "grn_number":                  1,
            "goods_receipt_number":        1,
            "po_number":                   1,
            "purchase_requisition_number": 1,
            "document_date":               1,
            "posting_date":                1,
            "status":                      1,
            "items":                       1,
            "_id":                         1,
        }
    ).sort("grn_number", 1)

    # Header: grn_number, goods_receipt_number, purchase_requisition_number
    # Items : document_date, posting_date, item, material, unit_of_measure,
    #         quantity, plant, storage_location, price
    KEY_ORDER = [
        "_id",
        "grn_number", "goods_receipt_number",
        "purchase_requisition_number",
        "po_number",
        "status", "items",
    ]

    ITEM_ORDER = [
        "document_date", "posting_date",
        "item", "material", "unit_of_measure",
        "quantity", "plant", "storage_location", "price",
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
    data = [reorder(grn) for grn in raw]
    return success_response(data, "Goods Receipts fetched")


# ── Get GRN details ───────────────────────────────────────────────────────────
@grn_bp.route("/<grn_number>", methods=["GET"])
def get_grn(grn_number):
    grn = mongo.db.goods_receipts.find_one({"grn_number": grn_number})
    if not grn:
        return error_response(f"GRN '{grn_number}' not found", 404)

    data = serialize_doc(grn)
    docs = get_active_documents("GRN", grn_number)
    data["uploaded_document"] = docs[0] if docs else None
    data["has_document"] = len(docs) > 0
    return success_response(data, "GRN details fetched")


# ── Get GRN by PO ─────────────────────────────────────────────────────────────
@grn_bp.route("/by-po/<po_number>", methods=["GET"])
def get_grn_by_po(po_number):
    grn = mongo.db.goods_receipts.find_one({"po_number": po_number})
    if not grn:
        return error_response(f"No GRN found for PO '{po_number}'", 404)

    data = serialize_doc(grn)
    docs = get_active_documents("GRN", grn["grn_number"])
    data["uploaded_document"] = docs[0] if docs else None
    return success_response(data, "GRN fetched for PO")


# ── Upload GRN document (single) ──────────────────────────────────────────────
@grn_bp.route("/<grn_number>/documents/upload", methods=["POST"])
def upload_grn_document(grn_number):
    grn = mongo.db.goods_receipts.find_one({"grn_number": grn_number})
    if not grn:
        return error_response(f"GRN '{grn_number}' not found", 404)

    existing = get_active_documents("GRN", grn_number)
    if existing:
        return error_response(
            "A document already exists for this GRN. Use Change Document to replace it.", 400
        )

    if "file" not in request.files:
        return error_response("No file provided. Use key 'file'.", 400)

    f = request.files["file"]
    if f.filename == "" or not allowed_file(f.filename):
        return error_response("Invalid or unsupported file", 400)

    doc = save_document(f, "GRN", grn_number)

    if doc:
        mongo.db.notifications.update_many(
            {"type": "MISSING_DOCUMENT", "stage": "GRN", "reference_number": grn_number},
            {"$set": {"is_read": True}}
        )

    return success_response(doc, "GRN document uploaded successfully", 201)


# ── Change (replace) GRN document ────────────────────────────────────────────
@grn_bp.route("/<grn_number>/documents/<doc_id>/change", methods=["PUT"])
def change_grn_document(grn_number, doc_id):
    grn = mongo.db.goods_receipts.find_one({"grn_number": grn_number})
    if not grn:
        return error_response(f"GRN '{grn_number}' not found", 404)

    if "file" not in request.files:
        return error_response("No replacement file provided. Use key 'file'.", 400)

    f = request.files["file"]
    if f.filename == "" or not allowed_file(f.filename):
        return error_response("Invalid file", 400)

    updated = change_document(doc_id, f, "GRN", grn_number)
    if not updated:
        return error_response(f"Document '{doc_id}' not found", 404)

    return success_response(updated, "GRN document replaced successfully")


# ── View active GRN documents ─────────────────────────────────────────────────
@grn_bp.route("/<grn_number>/documents", methods=["GET"])
def view_grn_documents(grn_number):
    grn = mongo.db.goods_receipts.find_one({"grn_number": grn_number})
    if not grn:
        return error_response(f"GRN '{grn_number}' not found", 404)

    docs = get_active_documents("GRN", grn_number)
    return success_response(
        {"grn_number": grn_number, "document": docs[0] if docs else None, "count": len(docs)},
        "Documents fetched",
    )


# ── Delete GRN document ───────────────────────────────────────────────────────
@grn_bp.route("/documents/<doc_id>", methods=["DELETE"])
def delete_grn_document(doc_id):
    doc = get_document_by_id(doc_id)
    if not doc or doc.get("stage") != "GRN":
        return error_response("Document not found", 404)

    deleted = delete_document(doc_id, stage="GRN", reference_number=doc.get("reference_number"))
    if not deleted:
        return error_response("Document not found", 404)

    return success_response(deleted, "GRN document deleted successfully")


# ── Download GRN document ─────────────────────────────────────────────────────
@grn_bp.route("/documents/<doc_id>/download", methods=["GET"])
def download_grn_document(doc_id):
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