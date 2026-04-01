"""
Real Data Seed Script
======================
Reads the 3 Excel files and seeds MongoDB.

Excel columns (verified from actual files):
  PR  : Document Type, Purchase Requisition, Purchase Requisition Item,
        Material, Plant, Storage Location, Purchasing Group,
        Delivery Date, Quantity Requested, Valuation Price

  PO  : Purchasing Document Type, Purchase Order, Company Code,
        Purchasing Group, Purchasing Organization, Supplier,
        Item, Material, Plant, Storage location,
        Order Quantity, Net Order Value, Delivery Date

  GRN : Material Document, Document Date, Posting Date, Material,
        Plant, Storage Location, Goods Movement Type, Document Type,
        Order Unit, Purchase Order Item, Purchasing Document,
        Quantity(GRN), Quantity in Order Unit(PO), Supplier

Run:
    python seed_data_real.py
"""

import sys, os, math, re
from datetime import datetime
import glob
import pandas as pd

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(CURRENT_DIR)

if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.app import create_app, mongo

app = create_app()

# ── Locate Excel files ────────────────────────────────────────────────────────
BASE = os.path.dirname(__file__)

def find_file(folder, keyword):
    matches = glob.glob(os.path.join(folder, f"*{keyword}*.xlsx"))
    return matches[0] if matches else ""

PR_FILE  = find_file(BASE, "Requisition")
PO_FILE  = find_file(BASE, "Order")
GRN_FILE = find_file(BASE, "GRN") or find_file(BASE, "Material")


# ── Value helpers ─────────────────────────────────────────────────────────────
def s(v):
    """Safe string – NaN/None → ''."""
    if v is None:
        return ""
    try:
        if math.isnan(float(v)):
            return ""
    except (TypeError, ValueError):
        pass
    return str(v).strip()

def f(v, default=0.0):
    """Safe float – NaN/None → default."""
    try:
        val = float(v)
        return default if math.isnan(val) else round(val, 2)
    except (TypeError, ValueError):
        return default

def d(v):
    """Safe date → 'YYYY-MM-DD', else ''."""
    try:
        ts = pd.Timestamp(v)
        return "" if pd.isnull(ts) else ts.strftime("%Y-%m-%d")
    except Exception:
        return s(v)

def int_str(v):
    """'4500001.0' → '4500001'."""
    try:
        return str(int(float(v)))
    except (TypeError, ValueError):
        return s(v)

def year_from_date(date_str):
    """'2026-03-25' → '2026'."""
    if date_str and len(str(date_str)) >= 4:
        return str(date_str)[:4]
    return str(datetime.utcnow().year)

def parse_material(raw):
    """
    'Steel Wire Rope 4.9mm Alpes (MWDTSTWI04)'
      → code='MWDTSTWI04', desc='Steel Wire Rope 4.9mm Alpes'
    No parens → code='', desc=full string.
    """
    raw = s(raw)
    if not raw:
        return "", ""
    m = re.match(r"^(.*?)\s*\(([^)]+)\)\s*$", raw)
    if m:
        return m.group(2).strip(), m.group(1).strip()
    return "", raw

def parse_name_code(raw):
    """
    'Midwest Limited (MLTD)' → 'MLTD'
    'Mr.Sripal Reddy (M01)'  → 'M01'
    No parens → full string.
    """
    raw = s(raw)
    if not raw:
        return ""
    m = re.match(r"^.*\(([^)]+)\)\s*$", raw)
    return m.group(1).strip() if m else raw


# ── PR ────────────────────────────────────────────────────────────────────────
def build_pr_records(filepath):
    """
    Header : pr_number, document_type, total_value
    Items  : item_number, material, material_description, plant,
             quantity, price, amount, purchase_organization
    NOTE   : PR Excel has no Purchase Requisition Number link to PO or
             Purchase Organization column – purchasing_group stored instead,
             purchase_organization left '' (not in source data).
    """
    df  = pd.read_excel(filepath)
    now = datetime.utcnow()
    groups = {}

    for _, row in df.iterrows():
        pr_num = int_str(row["Purchase Requisition"])

        item_full = s(row["Purchase Requisition Item"])
        item_num  = item_full.split("/")[-1] if "/" in item_full else item_full

        mat_code, mat_desc = parse_material(row["Material"])

        doc_type      = s(row["Document Type"])                    # e.g. ZSER
        plant         = parse_name_code(row["Plant"])              # e.g. MCMK
        purch_group   = parse_name_code(row["Purchasing Group"])   # e.g. M01

        qty    = f(row["Quantity Requested"])
        price  = f(row["Valuation Price"])
        amount = round(qty * price, 2)

        if pr_num not in groups:
            groups[pr_num] = {
                "purchaseRequisitionNumber":        pr_num,
                "purchaseDocumentType":    doc_type,
                "totalValue":      0.0,
                "purchasingGroup": purch_group,   # stored for reference
                "created_at":       now,
                "updated_at":       now,
                "items":            [],
            }

        groups[pr_num]["items"].append({
            "itemNumber":           item_num,
            "material":              mat_code,
            "materialDescription":  mat_desc,
            "plant":                 plant,
            "quantity":              qty,
            "price":                 price,
            "amount":                amount,
            "purchaseOrganization": "",   # not in PR Excel; filled by API if needed
        })

    for rec in groups.values():
        rec["totalValue"] = round(sum(i["amount"] for i in rec["items"]), 2)

    return list(groups.values())


# ── PO ────────────────────────────────────────────────────────────────────────
def build_po_records(filepath):
    """
    Header : po_number, document_type, purchasing_group, company_code,
             purchase_order_date, net_order_value, purchase_organization,
             purchase_requisition_number, supplier
    Items  : item_number, material, material_description,
             quantity, price, amount, plant
    NOTE   : PO Excel has no Purchase Requisition column –
             purchase_requisition_number stored as ''.
             purchase_order_date not in Excel – stored as ''.
    """
    df  = pd.read_excel(filepath)
    now = datetime.utcnow()
    groups = {}

    for _, row in df.iterrows():
        po_num = int_str(row["Purchase Order"])

        mat_code, mat_desc = parse_material(row["Material"])

        qty    = f(row["Order Quantity"])
        price  = f(row["Net Order Value"])
        amount = round(qty * price, 2)

        if po_num not in groups:
            doc_type     = s(row["Purchasing Document Type"])        # e.g. Spares (ZSPR)
            company_code = parse_name_code(row["Company Code"])      # e.g. MLTD
            purch_grp    = parse_name_code(row["Purchasing Group"])  # e.g. M01
            purch_org    = parse_name_code(row["Purchasing Organization"])  # e.g. MGHP
            supplier     = s(row["Supplier"])

            # Delivery Date used as purchase_order_date (closest available)
            po_date = d(row["Delivery Date"])

            groups[po_num] = {
                "purchaseOrderNumber":                   po_num,
                "purchaseDocumentType":               doc_type,
                "purchasingGroup":            purch_grp,
                "companyCode":                company_code,
                "purchaseOrderDate":         po_date,
                "netOrderValue":             0.0,          # computed after items
                "purchaseOrganization":       purch_org,
                "purchaseRequisitionNumber": "",           # not in source Excel
                "supplier":                    supplier,
                "created_at":                  now,
                "updated_at":                  now,
                "items":                       [],
            }

        plant    = s(row["Plant"])
        item_num = int_str(row["Item"])

        groups[po_num]["items"].append({
            "itemNumber":          item_num,
            "material":             mat_code,
            "materialDescription": mat_desc,
            "quantity":             qty,
            "price":                price,
            "amount":               amount,
            "plant":                plant,
        })

    for rec in groups.values():
        rec["netOrderValue"] = round(sum(i["amount"] for i in rec["items"]), 2)

    return list(groups.values())


# ── GRN ───────────────────────────────────────────────────────────────────────
def build_grn_records(filepath):
    """
    Header : grn_number, material_document_number, material_document_year,
             document_date, posting_date
    Items  : item_number, material, material_description, quantity,
             price, amount, plant, purchase_order
    """
    df  = pd.read_excel(filepath)
    now = datetime.utcnow()
    groups = {}

    for _, row in df.iterrows():
        grn_num = int_str(row["Material Document"])
        po_num  = int_str(row["Purchasing Document"])

        mat_code, mat_desc = parse_material(row["Material"])

        qty    = f(row["Quantity(GRN)"])
        price  = f(row["Quantity in Order Unit(PO)"])
        amount = round(qty * price, 2)

        item_num = int_str(row["Purchase Order Item"])
        plant    = parse_name_code(row["Plant"])

        if grn_num not in groups:
            doc_date  = d(row["Document Date"])
            post_date = d(row["Posting Date"])
            mat_year  = year_from_date(doc_date)

            groups[grn_num] = {
                "materialDocumentNumber": grn_num,
                "materialDocumentYear":   mat_year,
                "documentDate":            doc_date,
                "postingDate":             post_date,
                "created_at":               now,
                "updated_at":               now,
                "items":                    [],
            }

        groups[grn_num]["items"].append({
            "itemNumber":          item_num,
            "material":             mat_code,
            "materialDescription": mat_desc,
            "quantity":             qty,
            "price":                price,
            "amount":               amount,
            "plant":                plant,
            "purchaseOrder":       po_num,
        })

    return list(groups.values())


# ── Invoice Verifications ─────────────────────────────────────────────────────
def build_invoice_records(po_records, grn_records):
    po_map  = {p["purchaseOrderNumber"]: p for p in po_records}
    now     = datetime.utcnow()
    records = []

    for grn in grn_records:
        po_num  = grn["items"][0]["purchaseOrder"] if grn.get("items") else ""
        po_rec  = po_map.get(po_num)
        pr_num  = po_rec.get("purchaseRequisitionNumber", "") if po_rec else ""
        inv_num = f"INV-{grn['materialDocumentNumber']}"

        records.append({
            "invoice_number":    inv_num,
            "purchaseRequisitionNumber":         pr_num,
            "purchaseOrderNumber":         po_num,
            "materialDocumentNumber":        grn["materialDocumentNumber"],
            "status":            "PENDING",
            "miro_redirect_url": f"https://sap-miro.example.com/miro?ref={inv_num}",
            "created_at":        now,
            "updated_at":        now,
        })

    return records


# ── Notifications ─────────────────────────────────────────────────────────────
def build_notifications(pr_records, po_records, grn_records):
    now    = datetime.utcnow()
    notifs = []

    for pr in pr_records:
        notifs.append({
            "type": "MISSING_DOCUMENT", "stage": "PR",
            "reference_number": pr["purchaseRequisitionNumber"],
            "message":      f"PR document not uploaded for PR {pr['purchaseRequisitionNumber']}",
            "action_label": "Upload Now",
            "action_route": f"/document-uploads/pr/upload?pr={pr['purchaseRequisitionNumber']}",
            "is_read": False, "created_at": now,
        })

    for po in po_records:
        notifs.append({
            "type": "MISSING_DOCUMENT", "stage": "PO",
            "reference_number": po["purchaseOrderNumber"],
            "message":      f"PO document not uploaded for PO {po['purchaseOrderNumber']}",
            "action_label": "Upload Now",
            "action_route": f"/document-uploads/po/upload?po={po['purchaseOrderNumber']}",
            "is_read": False, "created_at": now,
        })

    for grn in grn_records:
        notifs.append({
            "type": "MISSING_DOCUMENT", "stage": "GRN",
            "reference_number": grn["materialDocumentNumber"],
            "message":      f"GRN document not uploaded for GRN {grn['materialDocumentNumber']}",
            "action_label": "Upload Now",
            "action_route": f"/document-uploads/grn/upload?grn={grn['materialDocumentNumber']}",
            "is_read": False, "created_at": now,
        })

    return notifs


# ── Main ──────────────────────────────────────────────────────────────────────
def seed():
    print("=" * 60)
    print("SAP Procurement Portal – Real Data Seeder")
    print("=" * 60)

    for label, path in [("PR", PR_FILE), ("PO", PO_FILE), ("GRN", GRN_FILE)]:
        if not path or not os.path.exists(path):
            print(f"❌ Missing file for {label}")
            sys.exit(1)
        print(f"✅ Found {label} file: {os.path.basename(path)}")

    print("\nReading and transforming Excel files...")
    pr_records    = build_pr_records(PR_FILE)
    po_records    = build_po_records(PO_FILE)
    grn_records   = build_grn_records(GRN_FILE)
    inv_records   = build_invoice_records(po_records, grn_records)
    notif_records = build_notifications(pr_records, po_records, grn_records)

    print(f"  PR  records  : {len(pr_records)}")
    print(f"  PO  records  : {len(po_records)}")
    print(f"  GRN records  : {len(grn_records)}")
    print(f"  INV records  : {len(inv_records)}")
    print(f"  Notifications: {len(notif_records)}")

    with app.app_context():
        db = mongo.db

        for col_name in ["purchase_requisitions", "purchase_orders", "goods_receipts",
                         "invoice_verifications", "documents", "notifications"]:
            db[col_name].drop()
            print(f"  Dropped: {col_name}")

        db.purchase_requisitions.insert_many(pr_records)
        print(f"  ✅ Inserted {len(pr_records)} Purchase Requisitions")

        db.purchase_orders.insert_many(po_records)
        print(f"  ✅ Inserted {len(po_records)} Purchase Orders")

        db.goods_receipts.insert_many(grn_records)
        print(f"  ✅ Inserted {len(grn_records)} Goods Receipts")

        db.invoice_verifications.insert_many(inv_records)
        print(f"  ✅ Inserted {len(inv_records)} Invoice Verifications")

        db.notifications.insert_many(notif_records)
        print(f"  ✅ Inserted {len(notif_records)} Notifications")

        print("\nCreating indexes...")
        db.purchase_requisitions.create_index("purchaseRequisitionNumber", unique=True)
        db.purchase_orders.create_index("purchaseOrderNumber", unique=True)
        db.goods_receipts.create_index("materialDocumentNumber", unique=True)
        db.invoice_verifications.create_index("invoice_number", unique=True)
        db.purchase_orders.create_index("purchaseRequisitionNumber")
        db.goods_receipts.create_index("items.purchaseOrder")
        db.documents.create_index([("stage", 1), ("reference_number", 1)])
        db.notifications.create_index([("is_read", 1), ("created_at", -1)])
        print("  ✅ Indexes created")

        print("\n" + "=" * 60)
        print("Verification – MongoDB record counts:")
        print(f"  purchase_requisitions : {db.purchase_requisitions.count_documents({})}")
        print(f"  purchase_orders       : {db.purchase_orders.count_documents({})}")
        print(f"  goods_receipts        : {db.goods_receipts.count_documents({})}")
        print(f"  invoice_verifications : {db.invoice_verifications.count_documents({})}")
        print(f"  notifications         : {db.notifications.count_documents({})}")
        print("=" * 60)

        print(f"\n✅ Seed completed successfully.")
        print(f"\nSample Postman tests:")
        print(f"  GET /api/pr/{pr_records[0]['purchaseRequisitionNumber']}")
        print(f"  GET /api/po/{po_records[0]['purchaseOrderNumber']}")
        print(f"  GET /api/grn/{grn_records[0]['materialDocumentNumber']}")
        print(f"  GET /api/invoice/{inv_records[0]['invoice_number']}")


if __name__ == "__main__":
    seed()
