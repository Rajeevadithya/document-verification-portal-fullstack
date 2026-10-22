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
    serialize_doc, success_response, error_response, allowed_file,
    safe_float, parse_request_json, find_stage_doc, clean_reference
)
from backend.app.services.document_service import (
    save_document, change_document, delete_document, get_active_documents, get_document_by_id,
    OCRValidationError
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
        ordered["itemNumber"]          = str(item.get("itemNumber", "")).strip()
        ordered["material"]            = str(item.get("material", "")).strip()
        ordered["materialDescription"] = str(item.get("materialDescription", "")).strip()
        ordered["quantity"]            = item.get("quantity", "")
        ordered["price"]               = item.get("price", "")
        ordered["amount"]              = item.get("amount", "")
        ordered["plant"]               = str(item.get("plant", "")).strip()
        ordered["storageLocation"]     = str(item.get("storageLocation") or item.get("storage_location") or item.get("LGORT") or "").strip()
        ordered["storage_location"]    = ordered["storageLocation"]
        ordered["purchaseOrder"]       = str(item.get("purchaseOrder", "")).strip()
        return ordered

    material_document_number = (
        str(serialized.get("materialDocumentNumber") or "").strip()
    )
    material_document_year = str(
        serialized.get("materialDocumentYear")
        or _extract_year(serialized.get("documentDate", ""))
    ).strip()

    po_num = str(
        serialized.get("purchaseOrderNumber")
        or serialized.get("purchaseOrder")
        or serialized.get("po_number")
        or (serialized.get("items") and serialized["items"][0].get("purchaseOrder"))
        or ""
    ).strip()

    storage_loc = str(
        serialized.get("storageLocation")
        or serialized.get("storage_location")
        or (serialized.get("items") and serialized["items"][0].get("storageLocation"))
        or (serialized.get("items") and serialized["items"][0].get("storage_location"))
        or ""
    ).strip()

    data = OrderedDict()
    data["materialDocumentNumber"] = material_document_number
    data["materialDocumentYear"]   = material_document_year
    data["documentDate"]           = str(serialized.get("documentDate", "")).strip()
    data["postingDate"]            = str(serialized.get("postingDate", "")).strip()
    data["purchaseOrderNumber"]    = po_num
    data["purchaseOrder"]          = po_num
    data["po_number"]              = po_num
    data["storageLocation"]        = storage_loc
    data["storage_location"]       = storage_loc
    data["items"]                  = [reorder_item(i) for i in serialized.get("items", [])]
    return data


# ── Ingest ────────────────────────────────────────────────────────────────────
@grn_bp.route("/ingest", methods=["GET", "POST"])
def ingest_grn():
    """
    POST body (accepts single dict or list of dicts):
    {
        "materialDocumentNumber": "4900000198",   <- or grn_number / MBLNR
        "materialDocumentYear":   "2026",         <- optional, derived from documentDate
        "documentDate":            "2026-03-25",
        "postingDate":             "2026-03-25",
        "purchaseOrderNumber":     "4500000004",   <- optional fallback PO
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
    if request.method == "GET":
        return success_response(
            {"endpoint": "/api/grn/ingest", "method": "POST", "expected_content_type": "application/json"},
            "GRN Ingestion endpoint is active. Send a POST request with JSON payload to ingest GRN records."
        )

    data = parse_request_json(request)
    raw_preview = request.get_data(as_text=True)[:200]
    print(f"[GRN INGEST DEBUG] Received: {raw_preview}", flush=True)

    if not data:
        return error_response(
            "No data received. Send JSON payload with 'materialDocumentNumber' (or 'grn_number') and 'items'.",
            400
        )

    def build_grn_doc(grn):
        if not isinstance(grn, dict):
            return {"materialDocumentNumber": ""}

        grn_num = str(
            grn.get("materialDocumentNumber")
            or grn.get("grn_number")
            or grn.get("grnNumber")
            or grn.get("goods_receipt_number")
            or grn.get("material_document_number")
            or grn.get("MBLNR")
            or grn.get("id")
            or ""
        ).strip()

        po_fallback = str(
            grn.get("purchaseOrderNumber")
            or grn.get("purchaseOrder")
            or grn.get("po_number")
            or grn.get("poNumber")
            or grn.get("EBELN")
            or ""
        ).strip()

        doc_date = str(grn.get("documentDate") or grn.get("document_date") or grn.get("docDate") or grn.get("BLDAT") or "")
        post_date = str(grn.get("postingDate") or grn.get("posting_date") or grn.get("BUDAT") or "")
        year = str(grn.get("materialDocumentYear") or grn.get("material_document_year") or grn.get("MJAHR") or _extract_year(doc_date))

        root_storage = str(
            grn.get("storageLocation")
            or grn.get("storage_location")
            or grn.get("storageLoc")
            or grn.get("LGORT")
            or ""
        ).strip()

        if not po_fallback and raw_items:
            for item in raw_items:
                if isinstance(item, dict):
                    cand = str(item.get("purchaseOrder") or item.get("purchaseOrderNumber") or item.get("po_number") or item.get("EBELN") or "").strip()
                    if cand:
                        po_fallback = cand
                        break

        items = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            qty   = safe_float(item.get("quantity") or item.get("qty") or item.get("MENGE"))
            price = safe_float(item.get("price") or item.get("unit_price") or item.get("NETPR"))
            amt_val = item.get("amount") or item.get("total_amount") or item.get("DMBTR") or item.get("WRBTR")
            amount = round(safe_float(amt_val, default=round(qty * price, 2)), 2)
            item_po = str(item.get("purchaseOrder") or item.get("purchaseOrderNumber") or item.get("po_number") or item.get("EBELN") or po_fallback).strip()
            item_storage = str(
                item.get("storageLocation")
                or item.get("storage_location")
                or item.get("storageLoc")
                or item.get("LGORT")
                or root_storage
            ).strip()
            if not root_storage and item_storage:
                root_storage = item_storage

            items.append({
                "itemNumber":          str(item.get("itemNumber") or item.get("item_number") or item.get("ZEILE") or item.get("EBELP") or ""),
                "material":             str(item.get("material") or item.get("material_number") or item.get("MATNR") or ""),
                "materialDescription": str(item.get("materialDescription") or item.get("material_description") or item.get("description") or item.get("MAKTX") or ""),
                "quantity":             qty,
                "price":                price,
                "amount":               amount,
                "plant":                str(item.get("plant") or item.get("WERKS") or ""),
                "storageLocation":     item_storage,
                "storage_location":    item_storage,
                "purchaseOrder":       item_po,
            })

        return {
            "materialDocumentNumber": grn_num,
            "materialDocumentYear":   year,
            "documentDate":            doc_date,
            "postingDate":             post_date,
            "purchaseOrderNumber":     po_fallback,
            "purchaseOrder":           po_fallback,
            "po_number":               po_fallback,
            "storageLocation":         root_storage,
            "storage_location":        root_storage,
            "items":                    items,
            "created_at":               datetime.utcnow(),
            "updated_at":               datetime.utcnow(),
        }

    if isinstance(data, list):
        inserted = []
        for grn in data:
            grn_doc = build_grn_doc(grn)
            if not grn_doc["materialDocumentNumber"]:
                continue
            mongo.db.goods_receipts.update_one(
                {"materialDocumentNumber": grn_doc["materialDocumentNumber"]},
                {"$set": grn_doc},
                upsert=True
            )
            inserted.append(grn_doc["materialDocumentNumber"])
        return success_response(inserted, "GRNs ingested")

    grn_doc = build_grn_doc(data)
    if not grn_doc["materialDocumentNumber"]:
        keys_found = list(data.keys()) if isinstance(data, dict) else str(type(data))
        return error_response(
            f"Missing required field 'materialDocumentNumber' (or 'grn_number'). Received keys: {keys_found}",
            400
        )

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
            "materialDocumentNumber": 1,
            "materialDocumentYear": 1,
            "documentDate": 1,
            "postingDate": 1,
            "purchaseOrderNumber": 1,
            "purchaseOrder": 1,
            "po_number": 1,
            "storageLocation": 1,
            "storage_location": 1,
            "items": 1,
        }
    ).sort("materialDocumentNumber", 1)

    raw  = serialize_doc(list(cursor))
    data = [_format_grn_response(grn) for grn in raw]
    return success_response(data, "Goods Receipts fetched")


# ── Get GRN details ───────────────────────────────────────────────────────────
@grn_bp.route("/<grn_number>", methods=["GET"])
def get_grn(grn_number):
    grn = find_stage_doc(mongo.db.goods_receipts, "materialDocumentNumber", grn_number)
    if not grn:
        return error_response(f"GRN '{clean_reference(grn_number)}' not found", 404)
    return success_response(_format_grn_response(grn), "GRN details fetched")


# ── Get GRN by PO ─────────────────────────────────────────────────────────────
@grn_bp.route("/by-po/<po_number>", methods=["GET"])
def get_grn_by_po(po_number):
    clean_po = clean_reference(po_number)
    import re
    pattern = re.compile(f"^\\s*{re.escape(clean_po)}\\s*$", re.IGNORECASE)
    grn = mongo.db.goods_receipts.find_one({
        "$or": [
            {"items.purchaseOrder": pattern},
            {"items.purchase_order": pattern},
            {"purchaseOrderNumber": pattern},
            {"purchaseOrder": pattern},
        ]
    })
    if not grn:
        return error_response(f"No GRN found for PO '{clean_po}'", 404)
    return success_response(_format_grn_response(grn), "GRN fetched for PO")


# ── Upload GRN document (single) ──────────────────────────────────────────────
@grn_bp.route("/<grn_number>/documents/upload", methods=["POST"])
def upload_grn_document(grn_number):
    grn = find_stage_doc(mongo.db.goods_receipts, "materialDocumentNumber", grn_number)
    if not grn:
        return error_response(f"GRN '{clean_reference(grn_number)}' not found", 404)
    grn_number = str(grn.get("materialDocumentNumber") or grn_number).strip()

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

    try:
        doc = save_document(f, "GRN", grn_number)
    except (OCRValidationError, ValueError) as e:
        return error_response(str(e), 400)

    if doc:
        mongo.db.notifications.update_many(
            {"type": "MISSING_DOCUMENT", "stage": "GRN", "reference_number": grn_number},
            {"$set": {"is_read": True}}
        )

    return success_response(doc, "GRN document uploaded successfully", 201)


# ── Change (replace) GRN document ────────────────────────────────────────────
@grn_bp.route("/<grn_number>/documents/<doc_id>/change", methods=["PUT"])
def change_grn_document(grn_number, doc_id):
    grn = find_stage_doc(mongo.db.goods_receipts, "materialDocumentNumber", grn_number)
    if not grn:
        return error_response(f"GRN '{clean_reference(grn_number)}' not found", 404)
    grn_number = str(grn.get("materialDocumentNumber") or grn_number).strip()
    if "file" not in request.files:
        return error_response("No replacement file provided. Use key 'file'.", 400)
    f = request.files["file"]
    if f.filename == "" or not allowed_file(f.filename):
        return error_response("Invalid file", 400)

    try:
        updated = change_document(doc_id, f, "GRN", grn_number)
    except (OCRValidationError, ValueError) as e:
        return error_response(str(e), 400)

    if not updated:
        return error_response(f"Document '{doc_id}' not found", 404)
    return success_response(updated, "GRN document replaced successfully")


# ── View active GRN documents ─────────────────────────────────────────────────
@grn_bp.route("/<grn_number>/documents", methods=["GET"])
def view_grn_documents(grn_number):
    grn = find_stage_doc(mongo.db.goods_receipts, "materialDocumentNumber", grn_number)
    if not grn:
        return error_response(f"GRN '{clean_reference(grn_number)}' not found", 404)
    grn_number = str(grn.get("materialDocumentNumber") or grn_number).strip()
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