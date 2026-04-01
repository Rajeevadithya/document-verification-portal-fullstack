"""
MongoDB Collections & Schema Definitions
=========================================

Collection: purchase_requisitions
----------------------------------
{
    "_id": ObjectId,
    "purchaseRequisitionNumber": str (unique, e.g. "PR-1001"),
    "purchaseDocumentType": str,           # PurchaseRequisitionType
    "items": [
        {
            "itemNumber": str,     # PurchaseRequisitionItem
            "material": str,
            "unit_of_measure": str, # baseunit
            "quantity": float,      # RequestedQuantity
            "valuation_price": float, # NetPriceAmount
            "delivery_date": str,   # ISO date
            "plant": str,
            "storage_location": str,
            "purchase_group": str   # PurchasingGroup
        }
    ],
    "status": str,  # OPEN | CLOSED | IN_PROGRESS
    "created_at": datetime,
    "updated_at": datetime
}

Collection: purchase_orders
-----------------------------
{
    "_id": ObjectId,
    "purchaseOrderNumber": str (unique, e.g. "PO-2001"),
    "purchaseRequisitionNumber": str,               # linked PR
    "purchaseDocumentType": str,           # PurchaseOrderType
    "purchaseOrganization": str,   # PurchasingOrganization
    "purchase_group": str,          # PurchasingGroup
    "companyCode": str,            # CompanyCode
    "vendor": str,                  # Supplier
    "items": [
        {
            "itemNumber": str,     # PurchaseOrderItem
            "material": str,
            "quantity": float,      # OrderQuantity
            "net_price": float,     # purgreleasetimetotalamount
            "delivery_date": str,
            "plant": str,
            "storage_location": str # StorageLocation
        }
    ],
    "status": str,
    "created_at": datetime,
    "updated_at": datetime
}

Collection: goods_receipts
----------------------------
{
    "_id": ObjectId,
    "materialDocumentNumber": str (unique, e.g. "GRN-3001"),
    "purchaseOrderNumber": str,               # PurchaseOrder link
    "documentDate": str,           # ISO date
    "postingDate": str,            # ISO date
    "items": [
        {
            "item": str,            # MaterialDocumentItem
            "material": str,
            "unit_of_measure": str, # purchaseorderquanityunit
            "quantity": float,      # Quantitybaseunit
            "entry_unit": str,      # entrunit
            "plant": str,
            "storage_location": str,
            "price": float          # totalgoodsmvtamtinccrrcy
        }
    ],
    "status": str,
    "created_at": datetime,
    "updated_at": datetime
}

Collection: invoice_verifications
-----------------------------------
{
    "_id": ObjectId,
    "invoice_number": str (unique, e.g. "INV-4001"),
    "purchaseRequisitionNumber": str,
    "purchaseOrderNumber": str,
    "materialDocumentNumber": str,
    "status": str,                  # PENDING | SENT_TO_MIRO | COMPLETED
    "miro_redirect_url": str,
    "created_at": datetime,
    "updated_at": datetime
}

Collection: documents
----------------------
{
    "_id": ObjectId,
    "stage": str,                   # PR | PO | GRN | INVOICE
    "reference_number": str,        # The PR/PO/GRN/INV number
    "filename": str,                # stored filename
    "original_filename": str,
    "file_path": str,
    "file_size": int,
    "mime_type": str,
    "ocr_status": str,              # PENDING | VALID | INVALID | REVIEW
    "ocr_result": {
        "document_type_detected": str,
        "expected_number_found": bool,
        "cross_reference_valid": bool,  # for PO: PR number present
        "confidence": float,
        "raw_text_snippet": str,
        "issues": [str]
    },
    "version": int,                 # increments on change
    "is_active": bool,
    "uploaded_at": datetime,
    "updated_at": datetime
}

Collection: notifications
--------------------------
{
    "_id": ObjectId,
    "type": str,       # MISSING_DOCUMENT | OCR_FAILED | OCR_REVIEW | VALIDATION_ERROR
    "stage": str,      # PR | PO | GRN | INVOICE
    "reference_number": str,
    "message": str,
    "action_label": str,
    "action_route": str,   # frontend route to redirect
    "is_read": bool,
    "created_at": datetime
}
"""

from backend.app import mongo
from datetime import datetime


def init_indexes():
    """Create MongoDB indexes for performance."""
    db = mongo.db

    # Unique indexes
    db.purchase_requisitions.create_index("purchaseRequisitionNumber", unique=True)
    db.purchase_orders.create_index("purchaseOrderNumber", unique=True)
    db.goods_receipts.create_index("materialDocumentNumber", unique=True)
    db.invoice_verifications.create_index("invoice_number", unique=True)

    # Query indexes
    db.purchase_orders.create_index("purchaseRequisitionNumber")
    db.goods_receipts.create_index("purchaseOrderNumber")
    db.invoice_verifications.create_index([("purchaseRequisitionNumber", 1), ("purchaseOrderNumber", 1), ("materialDocumentNumber", 1)])

    db.documents.create_index([("stage", 1), ("reference_number", 1)])
    db.documents.create_index("is_active")

    db.notifications.create_index("is_read")
    db.notifications.create_index([("stage", 1), ("reference_number", 1)])
    db.notifications.create_index("created_at")


def init_document_audit_log_indexes():
    """Create indexes for the new document_audit_logs collection."""
    db = mongo.db
    db.document_audit_logs.create_index([("stage", 1), ("reference_number", 1)])
    db.document_audit_logs.create_index("document_id")
    db.document_audit_logs.create_index("performed_by")
    db.document_audit_logs.create_index("timestamp")