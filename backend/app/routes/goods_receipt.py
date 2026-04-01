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

Field order (image spec + real Excel data):
    Header : material_document_number, material_document_year,
             document_date, posting_date
    Items  : item_number, material, material_description,
             quantity, price, amount, plant, purchase_order
"""
import os
from collections import OrderedDict
from flask import Blueprint, request, send_file
from datetime import datetime
from backend.app import mongo
from backend.app.utils.helpers import (
    serialize_doc, success_response, error_response, allowed_file
)
from backend.app.services.document_service import (
    save_document, change_document, delete_document, get_active_documents, get_document_by_id
)

grn_bp = Blueprint("goods_receipt", __name__)

# ── Field order (image spec) ──────────────────────────────────────────────────
GRN_KEY_ORDER = [
    "materialDocumentNumber",  # Header 1
    "materialDocumentYear",    # Header 2
    "documentDate",            # Header 3
    "postingDate",             # Header 4
    "items",
]

GRN_ITEM_ORDER = [
    "itemNumber",           # Item 1
    "material",             # Item 2
    "materialDescription",  # Item 3
    "quantity",             # Item 4
    "price",                # Item 5
    "amount",               # Item 6
    "plant",                # Item 7
    "purchaseOrder",        # Item 8
]


def _extract_year(date_str):
    if date_str and len(str(date_str)) >= 4:
        try:
            return str(date_str)[:4]
        except Exception:
            pass
    return str(datetime.utcnow().year)


def _format_grn_response(grn_doc):
    serialized = serialize_doc(grn_doc)

    def reorder_item(item):
        ordered = OrderedDict()
        ordered["itemNumber"]          = item.get("itemNumber", "")
        ordered["material"]            = item.get("material", "")
        ordered["materialDescription"] = item.get("materialDescription", "")
        ordered["quantity"]            = item.get("quantity", "")
        ordered["price"]               = item.get("price", "")
        ordered["amount"]              = item.get("amount", "")
        ordered["plant"]               = item.get("plant", "")
        ordered["purchaseOrder"]       = item.get("purchaseOrder", "")
        return ordered

    material_document_number = (
        serialized.get("materialDocumentNumber") or serialized.get("materialDocumentNumber", "")
    )
    material_document_year = (
        serialized.get("materialDocumentYear")
        or _extract_year(serialized.get("documentDate", ""))
    )

    data = OrderedDict()
    data["materialDocumentNumber"] = material_document_number
    data["materialDocumentYear"]   = material_document_year
    data["documentDate"]           = serialized.get("documentDate", "")
    data["postingDate"]            = serialized.get("postingDate", "")
    data["items"]                  = [reorder_item(i) for i in serialized.get("items", [])]
    return data


# ── Ingest ────────────────────────────────────────────────────────────────────
@grn_bp.route("/ingest", methods=["POST"])
def ingest_grn():
    """
    POST body:
    {
        "materialDocumentNumber":             "4900000198",   <- also accepts material_document_number
        "materialDocumentYear": "2026",          <- optional, derived from document_date
        "documentDate":          "2026-03-25",
        "postingDate":           "2026-03-25",
        "items": [
            {
                "itemNumber":          "10",
                "material":             "MWDTSTWI01",
                "materialDescription": "Steel Wire Rope 4.9mm",
                "quantity":             2,
                "price":                2.0,
                "amount":               4.0,
                "plant":                "MARP",
                "purchaseOrder":       "4500000004"
            }
        ]
    }
    """
    data = request.get_json()
    if not data:
        return error_response("No data received", 400)

    po_number = data.get("purchaseOrderNumber") or data.get("purchaseOrder") or ""

    grn_number = (
        data.get("materialDocumentNumber")
        or data.get("goods_receipt_number")
        or data.get("materialDocumentNumber")
        or ""
    )

    document_date = data.get("documentDate", "")
    material_document_year = (
        data.get("materialDocumentYear")
        or _extract_year(document_date)
    )

    items = []
    for item in data.get("items", []):
        qty   = float(item.get("quantity") or 0)
        price = float(item.get("price") or 0)
        items.append({
            "itemNumber":          item.get("itemNumber", ""),
            "material":             item.get("material", ""),
            "materialDescription": item.get("materialDescription", ""),
            "quantity":             qty,
            "price":                price,
            "amount":               round(float(item.get("amount") or qty * price), 2),
            "plant":                item.get("plant", ""),
            "purchaseOrder":       item.get("purchaseOrder") or item.get("purchaseOrderNumber") or po_number,
        })

    grn_doc = {
        "materialDocumentNumber":               grn_number,
        "materialDocumentNumber": grn_number,
        "materialDocumentYear":   str(material_document_year),
        "documentDate":            document_date,
        "postingDate":             data.get("postingDate", ""),
        "items":                    items,
        "created_at":               datetime.utcnow(),
        "updated_at":               datetime.utcnow(),
    }

    if not grn_doc["materialDocumentNumber"]:
        return error_response("grn_number (or material_document_number) is required", 400)

    mongo.db.goods_receipts.update_one(
        {"materialDocumentNumber": grn_doc["materialDocumentNumber"]},
        {"$set": grn_doc},
        upsert=True
    )
    return success_response(_format_grn_response(grn_doc), "GRN ingested")


# ── List all GRNs ─────────────────────────────────────────────────────────────
@grn_bp.route("/", methods=["GET"])
def list_grns():
    cursor = mongo.db.goods_receipts.find(
        {},
        {
            "materialDocumentNumber": 1, "materialDocumentNumber": 1,
            "materialDocumentYear": 1, "documentDate": 1,
            "postingDate": 1, "items": 1,
        }
    ).sort("materialDocumentNumber", 1)

    raw  = serialize_doc(list(cursor))
    data = [_format_grn_response(grn) for grn in raw]
    return success_response(data, "Goods Receipts fetched")


# ── Get GRN details ───────────────────────────────────────────────────────────
@grn_bp.route("/<grn_number>", methods=["GET"])
def get_grn(grn_number):
    grn = mongo.db.goods_receipts.find_one({"materialDocumentNumber": grn_number})
    if not grn:
        return error_response(f"GRN '{grn_number}' not found", 404)
    return success_response(_format_grn_response(grn), "GRN details fetched")


# ── Get GRN by PO ─────────────────────────────────────────────────────────────
@grn_bp.route("/by-po/<po_number>", methods=["GET"])
def get_grn_by_po(po_number):
    grn = mongo.db.goods_receipts.find_one({"items.purchase_order": po_number})
    if not grn:
        return error_response(f"No GRN found for PO '{po_number}'", 404)
    return success_response(_format_grn_response(grn), "GRN fetched for PO")


# ── Upload GRN document (single) ──────────────────────────────────────────────
@grn_bp.route("/<grn_number>/documents/upload", methods=["POST"])
def upload_grn_document(grn_number):
    grn = mongo.db.goods_receipts.find_one({"materialDocumentNumber": grn_number})
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
    grn = mongo.db.goods_receipts.find_one({"materialDocumentNumber": grn_number})
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
    grn = mongo.db.goods_receipts.find_one({"materialDocumentNumber": grn_number})
    if not grn:
        return error_response(f"GRN '{grn_number}' not found", 404)
    docs = get_active_documents("GRN", grn_number)
    return success_response(
        {"materialDocumentNumber": grn_number, "document": docs[0] if docs else None, "count": len(docs)},
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