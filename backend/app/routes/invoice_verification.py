"""
Invoice Verification Routes
==============================
GET  /api/invoice/                               – list all invoices
GET  /api/invoice/<invoice_number>               – get aggregated PR+PO+GRN data
GET  /api/invoice/by-po/<po_number>              – get invoice linked to a PO
POST /api/invoice/<invoice_number>/documents/upload  – upload invoice document
PUT  /api/invoice/<invoice_number>/documents/<doc_id>/change – replace
GET  /api/invoice/<invoice_number>/documents     – view
GET  /api/invoice/documents/<doc_id>/download    – download
POST /api/invoice/<invoice_number>/miro-redirect – log MIRO handoff + return URL
"""
import os
from datetime import datetime
from flask import Blueprint, request, send_file
from app import mongo
from app.utils.helpers import (
    format_grn_sections, format_po_sections, format_pr_sections, serialize_doc, success_response, error_response, allowed_file
)
from app.services.document_service import (
    save_document, change_document, delete_document, get_active_documents, get_document_by_id
)

inv_bp = Blueprint("invoice_verification", __name__)


@inv_bp.route("/", methods=["GET"])
def list_invoices():
    cursor = mongo.db.invoice_verifications.find(
        {}, {"invoice_number": 1, "pr_number": 1, "po_number": 1,
             "grn_number": 1, "status": 1, "_id": 1}
    ).sort("invoice_number", 1)
    data = serialize_doc(list(cursor))
    return success_response(data, "Invoices fetched")


@inv_bp.route("/<invoice_number>", methods=["GET"])
def get_invoice_aggregated(invoice_number):
    """
    Aggregates PR + PO + GRN data and returns combined view for Invoice Verification tab.
    """
    inv = mongo.db.invoice_verifications.find_one({"invoice_number": invoice_number})
    if not inv:
        return error_response(f"Invoice '{invoice_number}' not found", 404)

    pr_number  = inv.get("pr_number")
    po_number  = inv.get("po_number")
    grn_number = inv.get("grn_number")

    pr_doc = mongo.db.purchase_requisitions.find_one({"pr_number": pr_number}) if pr_number else None
    po_doc = mongo.db.purchase_orders.find_one({"po_number": po_number}) if po_number else None
    grn_doc = mongo.db.goods_receipts.find_one({"grn_number": grn_number}) if grn_number else None

    pr_data = format_pr_sections(pr_doc) if pr_doc else None
    po_data = format_po_sections(po_doc) if po_doc else None
    grn_data = format_grn_sections(
        grn_doc,
        purchase_requisition_number=po_doc.get("pr_number") if po_doc else None,
    ) if grn_doc else None

    # Docs
    inv_docs = get_active_documents("INVOICE", invoice_number)

    data = {
        "invoice": serialize_doc(inv),
        "purchase_requisition": pr_data,
        "purchase_order": po_data,
        "goods_receipt": grn_data,
        "uploaded_document": inv_docs[0] if inv_docs else None,
        "has_document": len(inv_docs) > 0,
        "miro_redirect_url": inv.get("miro_redirect_url", "")
    }
    return success_response(data, "Invoice aggregated data fetched")


@inv_bp.route("/by-po/<po_number>", methods=["GET"])
def get_invoice_by_po(po_number):
    inv = mongo.db.invoice_verifications.find_one({"po_number": po_number})
    if not inv:
        return error_response(f"No invoice found for PO '{po_number}'", 404)
    return get_invoice_aggregated(inv["invoice_number"])


@inv_bp.route("/<invoice_number>/documents/upload", methods=["POST"])
def upload_invoice_document(invoice_number):
    inv = mongo.db.invoice_verifications.find_one({"invoice_number": invoice_number})
    if not inv:
        return error_response(f"Invoice '{invoice_number}' not found", 404)

    existing = get_active_documents("INVOICE", invoice_number)
    if existing:
        return error_response(
            "An invoice document already exists. Use Change Document to replace it.", 400
        )

    if "file" not in request.files:
        return error_response("No file provided. Use key 'file'.", 400)

    f = request.files["file"]
    if f.filename == "" or not allowed_file(f.filename):
        return error_response("Invalid or unsupported file", 400)

    doc = save_document(f, "INVOICE", invoice_number)

    if doc:
        mongo.db.notifications.update_many(
            {"type": "MISSING_DOCUMENT", "stage": "INVOICE", "reference_number": invoice_number},
            {"$set": {"is_read": True}}
        )

    return success_response(doc, "Invoice document uploaded successfully", 201)


@inv_bp.route("/<invoice_number>/documents/<doc_id>/change", methods=["PUT"])
def change_invoice_document(invoice_number, doc_id):
    inv = mongo.db.invoice_verifications.find_one({"invoice_number": invoice_number})
    if not inv:
        return error_response(f"Invoice '{invoice_number}' not found", 404)

    if "file" not in request.files:
        return error_response("No replacement file provided. Use key 'file'.", 400)

    f = request.files["file"]
    if f.filename == "" or not allowed_file(f.filename):
        return error_response("Invalid file", 400)

    updated = change_document(doc_id, f, "INVOICE", invoice_number)
    if not updated:
        return error_response(f"Document '{doc_id}' not found", 404)

    return success_response(updated, "Invoice document replaced successfully")


@inv_bp.route("/<invoice_number>/documents", methods=["GET"])
def view_invoice_documents(invoice_number):
    inv = mongo.db.invoice_verifications.find_one({"invoice_number": invoice_number})
    if not inv:
        return error_response(f"Invoice '{invoice_number}' not found", 404)

    docs = get_active_documents("INVOICE", invoice_number)
    return success_response(
        {"invoice_number": invoice_number, "document": docs[0] if docs else None, "count": len(docs)},
        "Documents fetched"
    )

@inv_bp.route("/documents/<doc_id>", methods=["DELETE"])
def delete_invoice_document(doc_id):
    doc = get_document_by_id(doc_id)
    if not doc or doc.get("stage") != "INVOICE":
        return error_response("Document not found", 404)

    deleted = delete_document(doc_id, stage="INVOICE", reference_number=doc.get("reference_number"))
    if not deleted:
        return error_response("Document not found", 404)

    return success_response(deleted, "Invoice document deleted successfully")


@inv_bp.route("/documents/<doc_id>/download", methods=["GET"])
def download_invoice_document(doc_id):
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


@inv_bp.route("/<invoice_number>/miro-redirect", methods=["POST"])
def miro_redirect(invoice_number):
    """
    Logs the MIRO handoff event and returns the MIRO redirect URL.
    Frontend uses this URL to open SAP MIRO in a new tab.
    """
    inv = mongo.db.invoice_verifications.find_one({"invoice_number": invoice_number})
    if not inv:
        return error_response(f"Invoice '{invoice_number}' not found", 404)

    # Update status
    mongo.db.invoice_verifications.update_one(
        {"invoice_number": invoice_number},
        {"$set": {"status": "SENT_TO_MIRO", "updated_at": datetime.utcnow()}}
    )

    # Log notification
    mongo.db.notifications.insert_one({
        "type": "MIRO_REDIRECT",
        "stage": "INVOICE",
        "reference_number": invoice_number,
        "message": f"Invoice {invoice_number} has been sent to SAP MIRO for processing.",
        "action_label": "View Invoice",
        "action_route": f"/document-uploads/invoice?inv={invoice_number}",
        "is_read": False,
        "created_at": datetime.utcnow()
    })

    return success_response(
        {"miro_redirect_url": inv.get("miro_redirect_url", ""), "status": "SENT_TO_MIRO"},
        "Invoice sent to MIRO"
    )
