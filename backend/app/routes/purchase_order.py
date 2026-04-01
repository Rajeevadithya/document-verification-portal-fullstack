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

Field order (image spec + real Excel data):
    Header : po_number, document_type, purchasing_group, company_code,
             purchase_order_date, net_order_value, purchase_organization,
             purchase_requisition_number
    Items  : item_number, material, material_description,
             quantity, price, amount, plant
"""
from collections import OrderedDict
from datetime import datetime
import os
from flask import Blueprint, request, send_file
from backend.app import mongo
from backend.app.utils.helpers import (
    serialize_doc, success_response, error_response, allowed_file
)
from backend.app.services.document_service import (
    save_document, change_document, delete_document, get_active_documents, get_document_by_id
)

po_bp = Blueprint("purchaseOrder", __name__)

# ── Field order (image spec) ──────────────────────────────────────────────────
PO_KEY_ORDER = [
    "purchaseOrderNumber",        # Header 1
    "purchaseDocumentType",       # Header 2
    "purchasingGroup",            # Header 3
    "companyCode",                # Header 4
    "purchaseOrderDate",          # Header 5
    "netOrderValue",              # Header 6
    "purchaseOrganization",       # Header 7
    "purchaseRequisitionNumber",  # Header 8
    "items",
]

PO_ITEM_ORDER = [
    "itemNumber",           # Item 1
    "material",             # Item 2
    "materialDescription",  # Item 3
    "quantity",             # Item 4
    "price",                # Item 5
    "amount",               # Item 6
    "plant",                # Item 7
]


def _calc_net_order_value(items):
    try:
        return round(sum(float(i.get("amount", 0) or 0) for i in items), 2)
    except (TypeError, ValueError):
        return 0.0


def _format_po_response(po_doc):
    serialized = serialize_doc(po_doc)

    def reorder_item(item):
        ordered = OrderedDict()
        ordered["itemNumber"]          = item.get("itemNumber", "")
        ordered["material"]            = item.get("material", "")
        ordered["materialDescription"] = item.get("materialDescription", "")
        ordered["quantity"]            = item.get("quantity", "")
        ordered["price"]               = item.get("price", "")
        ordered["amount"]              = item.get("amount", "")
        ordered["plant"]               = item.get("plant", "")
        return ordered

    items = [reorder_item(i) for i in serialized.get("items", [])]

    net_order_value = serialized.get("netOrderValue")
    if net_order_value is None:
        net_order_value = _calc_net_order_value(serialized.get("items", []))

    data = OrderedDict()
    data["purchaseOrderNumber"]       = serialized.get("purchaseOrderNumber", "")
    data["purchaseDocumentType"]      = serialized.get("purchaseDocumentType", "")
    data["purchasingGroup"]           = serialized.get("purchasingGroup", "")
    data["companyCode"]               = serialized.get("companyCode", "")
    data["purchaseOrderDate"]         = serialized.get("purchaseOrderDate", "")
    data["netOrderValue"]             = net_order_value
    data["purchaseOrganization"]      = serialized.get("purchaseOrganization", "")
    data["purchaseRequisitionNumber"] = serialized.get("purchaseRequisitionNumber", "")
    data["items"]                     = items
    return data


# ── Ingest ────────────────────────────────────────────────────────────────────
@po_bp.route("/ingest", methods=["POST"])
def ingest_po():
    """
    POST body:
    {
        "purchaseOrderNumber":                   "9000000000",
        "purchaseDocumentType":               "Spares (ZSPR)",
        "purchasingGroup":            "M01",
        "companyCode":                "MLTD",
        "purchaseOrderDate":         "2026-04-06",
        "netOrderValue":             480.0,        <- optional, auto-calculated
        "purchaseOrganization":       "MGHP",
        "purchaseRequisitionNumber": "",
        "supplier":                    "34...",
        "items": [
            {
                "itemNumber":          "10",
                "material":             "MWDTSTWI04",
                "materialDescription": "Steel Wire Rope 4.9mm Alpes",
                "quantity":             2,
                "price":               240.0,
                "amount":               480.0,
                "plant":                "Midwest Limited"
            }
        ]
    }
    """
    data = request.get_json()
    if not data:
        return error_response("No data received", 400)

    pr_number = data.get("purchaseRequisitionNumber") or data.get("purchaseRequisitionNumber") or ""

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
        })

    net_order_value = data.get("netOrderValue")
    if net_order_value is None:
        net_order_value = _calc_net_order_value(items)

    po_doc = {
        "purchaseOrderNumber":                   data.get("purchaseOrderNumber"),
        "purchaseDocumentType":               data.get("purchaseDocumentType", ""),
        "purchasingGroup":            data.get("purchasingGroup", ""),
        "companyCode":                data.get("companyCode", ""),
        "purchaseOrderDate":         data.get("purchaseOrderDate", ""),
        "netOrderValue":             round(float(net_order_value), 2),
        "purchaseOrganization":       data.get("purchaseOrganization", ""),
        "purchaseRequisitionNumber": pr_number,
        "supplier":                    data.get("supplier", ""),
        "items":                       items,
        "created_at":                  datetime.utcnow(),
        "updated_at":                  datetime.utcnow(),
    }

    if not po_doc["purchaseOrderNumber"]:
        return error_response("po_number is required", 400)

    mongo.db.purchase_orders.update_one(
        {"purchaseOrderNumber": po_doc["purchaseOrderNumber"]},
        {"$set": po_doc},
        upsert=True
    )
    return success_response(_format_po_response(po_doc), "PO ingested")


# ── List all POs ──────────────────────────────────────────────────────────────
@po_bp.route("/", methods=["GET"])
def list_pos():
    cursor = mongo.db.purchase_orders.find(
        {},
        {
            "purchaseOrderNumber": 1, "purchaseDocumentType": 1, "purchasingGroup": 1,
            "companyCode": 1, "purchaseOrderDate": 1, "netOrderValue": 1,
            "purchaseOrganization": 1, "purchaseRequisitionNumber": 1,
            "items": 1,
        }
    ).sort("purchaseOrderNumber", 1)

    raw  = serialize_doc(list(cursor))
    data = [_format_po_response(po) for po in raw]
    return success_response(data, "Purchase Orders fetched")


# ── Get PO details ────────────────────────────────────────────────────────────
@po_bp.route("/<po_number>", methods=["GET"])
def get_po(po_number):
    po = mongo.db.purchase_orders.find_one({"purchaseOrderNumber": po_number})
    if not po:
        return error_response(f"PO '{po_number}' not found", 404)
    return success_response(_format_po_response(po), "PO details fetched")


# ── Get PO by PR ──────────────────────────────────────────────────────────────
@po_bp.route("/by-pr/<pr_number>", methods=["GET"])
def get_po_by_pr(pr_number):
    po = mongo.db.purchase_orders.find_one({
        "$or": [
            {"purchaseRequisitionNumber": pr_number},
            {"purchaseRequisitionNumber": pr_number}
        ]
    })
    if not po:
        return error_response(f"No PO found for PR '{pr_number}'", 404)
    return success_response(_format_po_response(po), "PO fetched for PR")


# ── Upload PO document (single) ───────────────────────────────────────────────
@po_bp.route("/<po_number>/documents/upload", methods=["POST"])
def upload_po_document(po_number):
    po = mongo.db.purchase_orders.find_one({"purchaseOrderNumber": po_number})
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
    if f.filename == "" or not allowed_file(f.filename):
        return error_response("Invalid or unsupported file", 400)

    linked_pr = po.get("purchaseRequisitionNumber") or po.get("purchaseRequisitionNumber")
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
    po = mongo.db.purchase_orders.find_one({"purchaseOrderNumber": po_number})
    if not po:
        return error_response(f"PO '{po_number}' not found", 404)
    if "file" not in request.files:
        return error_response("No replacement file provided. Use key 'file'.", 400)
    f = request.files["file"]
    if f.filename == "" or not allowed_file(f.filename):
        return error_response("Invalid file", 400)

    linked_pr = po.get("purchaseRequisitionNumber") or po.get("purchaseRequisitionNumber")
    updated = change_document(doc_id, f, "PO", po_number, linked_pr_number=linked_pr)
    if not updated:
        return error_response(f"Document '{doc_id}' not found", 404)
    return success_response(updated, "PO document replaced successfully")


# ── View active PO documents ──────────────────────────────────────────────────
@po_bp.route("/<po_number>/documents", methods=["GET"])
def view_po_documents(po_number):
    po = mongo.db.purchase_orders.find_one({"purchaseOrderNumber": po_number})
    if not po:
        return error_response(f"PO '{po_number}' not found", 404)
    docs = get_active_documents("PO", po_number)
    return success_response(
        {"purchaseOrderNumber": po_number, "document": docs[0] if docs else None, "count": len(docs)},
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