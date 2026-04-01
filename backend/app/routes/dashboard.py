"""
Dashboard Routes
==================
GET /api/dashboard/summary   – aggregated counts and status overview
GET /api/dashboard/stages    – per-stage document upload status
GET /api/dashboard/recent-activity – last N document uploads across all stages
"""
from flask import Blueprint, request
from backend.app import mongo
from backend.app.utils.helpers import serialize_doc, success_response

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/summary", methods=["GET"])
def dashboard_summary():
    """
    Returns top-level KPIs for the dashboard:
    - Total PRs, POs, GRNs, Invoices
    - Document upload status per stage
    - Unread notification count
    """
    db = mongo.db

    pr_total   = db.purchase_requisitions.count_documents({})
    po_total   = db.purchase_orders.count_documents({})
    grn_total  = db.goods_receipts.count_documents({})
    inv_total  = db.invoice_verifications.count_documents({})

    # Count PRs that have at least one active document
    pr_with_docs = len(db.documents.distinct(
        "reference_number", {"stage": "PR", "is_active": True}
    ))
    po_with_docs = len(db.documents.distinct(
        "reference_number", {"stage": "PO", "is_active": True}
    ))
    grn_with_docs = len(db.documents.distinct(
        "reference_number", {"stage": "GRN", "is_active": True}
    ))
    inv_with_docs = len(db.documents.distinct(
        "reference_number", {"stage": "INVOICE", "is_active": True}
    ))

    # OCR status breakdown across all documents
    ocr_valid   = db.documents.count_documents({"is_active": True, "ocr_status": "VALID"})
    ocr_invalid = db.documents.count_documents({"is_active": True, "ocr_status": "INVALID"})
    ocr_review  = db.documents.count_documents({"is_active": True, "ocr_status": "REVIEW"})
    ocr_pending = db.documents.count_documents({"is_active": True, "ocr_status": "PENDING"})

    unread_notifs = db.notifications.count_documents({"is_read": False})

    miro_sent = db.invoice_verifications.count_documents({"status": "SENT_TO_MIRO"})

    data = {
        "totals": {
            "purchase_requisitions": pr_total,
            "purchase_orders": po_total,
            "goods_receipts": grn_total,
            "invoice_verifications": inv_total
        },
        "document_upload_status": {
            "PR":      {"total": pr_total,  "with_docs": pr_with_docs,  "missing": pr_total  - pr_with_docs},
            "PO":      {"total": po_total,  "with_docs": po_with_docs,  "missing": po_total  - po_with_docs},
            "GRN":     {"total": grn_total, "with_docs": grn_with_docs, "missing": grn_total - grn_with_docs},
            "INVOICE": {"total": inv_total, "with_docs": inv_with_docs, "missing": inv_total - inv_with_docs}
        },
        "ocr_summary": {
            "valid":   ocr_valid,
            "invalid": ocr_invalid,
            "review":  ocr_review,
            "pending": ocr_pending
        },
        "notifications": {
            "unread": unread_notifs
        },
        "miro_sent": miro_sent
    }
    return success_response(data, "Dashboard summary fetched")


@dashboard_bp.route("/stages", methods=["GET"])
def stage_status():
    """
    Returns per-stage document upload completeness with OCR status per record.
    """
    db = mongo.db

    def build_stage(collection_name, number_fields, stage_key):
        projection = {field: 1 for field in number_fields}
        projection["status"] = 1
        projection["_id"] = 0

        records = list(db[collection_name].find({}, projection))
        result = []
        for rec in records:
            ref = next((rec.get(field) for field in number_fields if rec.get(field)), None)
            if not ref:
                continue

            docs = list(db.documents.find(
                {"stage": stage_key, "reference_number": ref, "is_active": True},
                {"ocr_status": 1, "original_filename": 1, "uploaded_at": 1, "_id": 1}
            ))
            result.append({
                "reference_number": ref,
                "record_status": rec.get("status", "UNKNOWN"),
                "document_count": len(docs),
                "has_document": len(docs) > 0,
                "documents": serialize_doc(docs)
            })
        return result

    data = {
        "PR":      build_stage("purchase_requisitions", ["purchaseRequisitionNumber", "pr_number"], "PR"),
        "PO":      build_stage("purchase_orders", ["purchaseOrderNumber", "po_number"], "PO"),
        "GRN":     build_stage("goods_receipts", ["materialDocumentNumber", "grn_number"], "GRN"),
        "INVOICE": build_stage("invoice_verifications", ["invoice_number"], "INVOICE")
    }
    return success_response(data, "Stage statuses fetched")


@dashboard_bp.route("/recent-activity", methods=["GET"])
def recent_activity():
    """Returns the last N document uploads across all stages."""
    limit = int(request.args.get("limit", 10))
    cursor = (
        mongo.db.documents
        .find(
            {"is_active": True},
            {"stage": 1, "reference_number": 1, "original_filename": 1,
             "ocr_status": 1, "uploaded_at": 1, "_id": 1}
        )
        .sort("uploaded_at", -1)
        .limit(limit)
    )
    data = serialize_doc(list(cursor))
    return success_response({"activities": data, "count": len(data)}, "Recent activity fetched")
