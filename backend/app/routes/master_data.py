"""
Master Data Routes – Value Help
=================================
These endpoints power the SAP-style value help dropdowns on the frontend.
"""
from flask import Blueprint
from backend.app import mongo
from backend.app.utils.helpers import serialize_doc, success_response, error_response

master_data_bp = Blueprint("master_data", __name__)


@master_data_bp.route("/pr-numbers", methods=["GET"])
def list_pr_numbers():
    """Return all available PR numbers for value help picker."""
    cursor = mongo.db.purchase_requisitions.find(
        {}, {"purchaseRequisitionNumber": 1, "purchaseDocumentType": 1, "status": 1, "_id": 0}
    ).sort("purchaseRequisitionNumber", 1)
    data = list(cursor)
    return success_response(data, "PR numbers fetched")


@master_data_bp.route("/po-numbers", methods=["GET"])
def list_po_numbers():
    """Return all available PO numbers for value help picker."""
    cursor = mongo.db.purchase_orders.find(
        {}, {"purchaseOrderNumber": 1, "purchaseRequisitionNumber": 1, "vendor": 1, "status": 1, "_id": 0}
    ).sort("purchaseOrderNumber", 1)
    data = list(cursor)
    return success_response(data, "PO numbers fetched")


@master_data_bp.route("/grn-numbers", methods=["GET"])
def list_grn_numbers():
    """Return all available GRN numbers for value help picker."""
    cursor = mongo.db.goods_receipts.find(
        {}, {"materialDocumentNumber": 1, "purchaseOrderNumber": 1, "status": 1, "_id": 0}
    ).sort("materialDocumentNumber", 1)
    data = list(cursor)
    return success_response(data, "GRN numbers fetched")


@master_data_bp.route("/invoice-numbers", methods=["GET"])
def list_invoice_numbers():
    """Return all available Invoice numbers."""
    cursor = mongo.db.invoice_verifications.find(
        {}, {"invoice_number": 1, "purchaseRequisitionNumber": 1, "purchaseOrderNumber": 1, "materialDocumentNumber": 1, "status": 1, "_id": 0}
    ).sort("invoice_number", 1)
    data = list(cursor)
    return success_response(data, "Invoice numbers fetched")