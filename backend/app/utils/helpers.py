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
        "purchaseRequisitionNumber": data.get("purchaseRequisitionNumber"),
        "purchaseDocumentType": data.get("purchaseDocumentType"),
    }
    data["item_data"] = [
        {
            "itemNumber": item.get("itemNumber"),
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
        "purchaseDocumentType": data.get("purchaseDocumentType"),
        "purchaseOrganization": data.get("purchaseOrganization"),
        "purchaseRequisitionNumber": data.get("purchaseRequisitionNumber"),
        "purchase_group": data.get("purchase_group"),
        "companyCode": data.get("companyCode"),
    }
    data["item_data"] = [
        {
            "vendor": data.get("vendor"),
            "itemNumber": item.get("itemNumber"),
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
        "goods_receipt_number": data.get("materialDocumentNumber"),
        "purchaseRequisitionNumber": purchase_requisition_number,
    }
    data["item_data"] = [
        {
            "documentDate": data.get("documentDate"),
            "postingDate": data.get("postingDate"),
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

def safe_float(val, default=0.0) -> float:
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        val = val.replace(",", "").strip()
        if not val:
            return default
        try:
            return float(val)
        except ValueError:
            return default
    return default

def parse_request_json(req):
    """
    Robustly extract JSON / dictionary from a Flask request:
    - Handles Content-Type: application/json
    - Handles missing, text/plain, or form Content-Type
    - Handles single-quoted dict strings from Windows CMD (ast.literal_eval fallback)
    - Handles SAP OData v2 (d / results), SAP OData v4 (value), and common wrappers (data / payload / records)
    """
    data = req.get_json(silent=True)
    if data is None:
        try:
            data = req.get_json(force=True, silent=True)
        except Exception:
            pass

    if data is None and req.form:
        for field in ("payload", "data", "json", "body", "record"):
            if field in req.form:
                try:
                    import json
                    data = json.loads(req.form[field])
                    break
                except Exception:
                    pass
        if data is None:
            data = dict(req.form)

    if data is None:
        raw_body = req.get_data(as_text=True)
        if raw_body and raw_body.strip():
            raw_stripped = raw_body.strip()
            try:
                import json
                data = json.loads(raw_stripped)
            except Exception:
                try:
                    import ast
                    evaluated = ast.literal_eval(raw_stripped)
                    if isinstance(evaluated, (dict, list)):
                        data = evaluated
                except Exception:
                    pass

    if isinstance(data, dict):
        for wrapper in ("data", "d", "value", "results", "records", "payload"):
            if wrapper in data and isinstance(data[wrapper], (dict, list)):
                data = data[wrapper]
                break
        if isinstance(data, dict) and "results" in data and isinstance(data["results"], list):
            data = data["results"]

    return data