import os
from bson import ObjectId
from datetime import datetime
from flask import current_app
import re

ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "tiff", "bmp"}

def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def serialize_doc(doc: dict) -> dict:
    """Recursively convert ObjectId and datetime to JSON-serializable types."""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [serialize_doc(d) for d in doc]
    if isinstance(doc, dict):
        return {k: serialize_doc(v) for k, v in doc.items()}
    if isinstance(doc, ObjectId):
        return str(doc)
    if isinstance(doc, datetime):
        return doc.isoformat()
    return doc

def format_pr_sections(pr_doc: dict | None) -> dict | None:
    if pr_doc is None:
        return None

    data = serialize_doc(pr_doc)
    data["header_data"] = {
        "pr_number": data.get("pr_number"),
        "document_type": data.get("document_type"),
    }
    data["item_data"] = [
        {
            "item_number": item.get("item_number"),
            "material": item.get("material"),
            "unit_of_measure": item.get("unit_of_measure"),
            "quantity": item.get("quantity"),
            "valuation_price": item.get("valuation_price"),
            "delivery_date": item.get("delivery_date"),
            "plant": item.get("plant"),
            "storage_location": item.get("storage_location"),
            "purchase_group": item.get("purchase_group"),
        }
        for item in data.get("items", [])
    ]
    return data

def format_po_sections(po_doc: dict | None) -> dict | None:
    if po_doc is None:
        return None

    data = serialize_doc(po_doc)
    data["header_data"] = {
        "document_type": data.get("document_type"),
        "purchase_organization": data.get("purchase_organization"),
        "purchase_requisition_number": data.get("pr_number"),
        "purchase_group": data.get("purchase_group"),
        "company_code": data.get("company_code"),
    }
    data["item_data"] = [
        {
            "vendor": data.get("vendor"),
            "item_number": item.get("item_number"),
            "material": item.get("material"),
            "quantity": item.get("quantity"),
            "net_price": item.get("net_price"),
            "delivery_date": item.get("delivery_date"),
            "plant": item.get("plant"),
            "storage_location": item.get("storage_location"),
        }
        for item in data.get("items", [])
    ]
    return data

def format_grn_sections(grn_doc: dict | None, purchase_requisition_number: str | None = None) -> dict | None:
    if grn_doc is None:
        return None

    data = serialize_doc(grn_doc)
    data["header_data"] = {
        "goods_receipt_number": data.get("grn_number"),
        "purchase_requisition_number": purchase_requisition_number,
    }
    data["item_data"] = [
        {
            "document_date": data.get("document_date"),
            "posting_date": data.get("posting_date"),
            "item": item.get("item"),
            "material": item.get("material"),
            "unit_of_measure": item.get("unit_of_measure"),
            "quantity": item.get("quantity"),
            "plant": item.get("plant"),
            "storage_location": item.get("storage_location"),
            "price": item.get("price"),
        }
        for item in data.get("items", [])
    ]
    return data

def success_response(data=None, message="Success", status_code=200):
    resp = {"success": True, "message": message}
    if data is not None:
        resp["data"] = data
    return resp, status_code

def error_response(message="Error", status_code=400, errors=None):
    resp = {"success": False, "message": message}
    if errors:
        resp["errors"] = errors
    return resp, status_code

def safe_filename(stage: str, ref_number: str, original: str) -> str:
    """Build a safe stored filename preserving the extension."""
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else "bin"
    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    clean_ref = re.sub(r"[^A-Za-z0-9\-]", "", ref_number)
    return f"{stage}_{clean_ref}_{ts}.{ext}"

def get_upload_path(stage: str) -> str:
    folder_map = {"PR": "pr", "PO": "po", "GRN": "grn", "INVOICE": "invoice"}
    sub = folder_map.get(stage.upper(), "misc")
    path = os.path.join(current_app.config["UPLOAD_FOLDER"], sub)
    os.makedirs(path, exist_ok=True)
    return path
