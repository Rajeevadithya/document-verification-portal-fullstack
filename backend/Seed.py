"""
Real Data Seed Script
======================
Loads actual MNC data from the 3 Excel files into MongoDB.
Replaces the demo seed data completely.
 
Run:
    python seed_data_real.py
 
Excel files expected at same folder level:
    Purchase_Requisition_Data.xlsx
    Purchase_Order_Data.xlsx
    GRN__Material_Documents_Data_.xlsx
"""
 
import sys, os, math
from datetime import datetime
import glob
import pandas as pd
 
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(CURRENT_DIR)

if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.app import create_app, mongo
 
app = create_app()
 
# ── Resolve file paths ────────────────────────────────────────────────────────
BASE = os.path.dirname(__file__)
def find_file(folder, keyword):
    matches = glob.glob(os.path.join(folder, f"*{keyword}*.xlsx"))
    return matches[0] if matches else ""
 
PR_FILE  = find_file(BASE, "Requisition")
PO_FILE  = find_file(BASE, "Order")
GRN_FILE = find_file(BASE, "GRN") or find_file(BASE, "Material")
 
# ── Helper functions ──────────────────────────────────────────────────────────
def s(v):
    """Safe string: NaN → empty string."""
    if v is None:
        return ""
    try:
        if math.isnan(float(v)):
            return ""
    except (TypeError, ValueError):
        pass
    return str(v).strip()
 
def f(v, default=0.0):
    """Safe float: NaN → default."""
    try:
        val = float(v)
        return default if math.isnan(val) else round(val, 2)
    except (TypeError, ValueError):
        return default
 
def d(v):
    """Safe date → ISO string YYYY-MM-DD."""
    try:
        ts = pd.Timestamp(v)
        if pd.isnull(ts):
            return ""
        return ts.strftime("%Y-%m-%d")
    except Exception:
        return s(v)
 
def int_str(v):
    """Convert numeric ID to clean string without decimals."""
    try:
        return str(int(float(v)))
    except (TypeError, ValueError):
        return s(v)
 
 
# ── Build Purchase Requisitions ───────────────────────────────────────────────
def build_pr_records(filepath):
    df = pd.read_excel(filepath)
    groups = {}
    now = datetime.utcnow()
 
    for _, row in df.iterrows():
        pr_num    = int_str(row["Purchase Requisition"])
        item_full = s(row["Purchase Requisition Item"])
        item_num  = item_full.split("/")[-1] if "/" in item_full else item_full
 
        if pr_num not in groups:
            groups[pr_num] = {
                "pr_number":    pr_num,
                "document_type": s(row["Document Type"]),
                "status":       "OPEN",
                "created_at":   now,
                "updated_at":   now,
                "items":        []
            }
 
        groups[pr_num]["items"].append({
            "item_number":      item_num,
            "material":         s(row["Material"]),
            "unit_of_measure":  "EA",
            "quantity":         f(row["Quantity Requested"]),
            "valuation_price":  f(row["Valuation Price"]),
            "delivery_date":    d(row["Delivery Date"]),
            "plant":            s(row["Plant"]),
            "storage_location": s(row["Storage Location"]),
            "purchase_group":   s(row["Purchasing Group"])
        })
 
    return list(groups.values())
 
 
# ── Build Purchase Orders ─────────────────────────────────────────────────────
def build_po_records(filepath):
    df = pd.read_excel(filepath)
    groups = {}
    now = datetime.utcnow()
 
    for _, row in df.iterrows():
        po_num = int_str(row["Purchase Order"])
 
        if po_num not in groups:
            groups[po_num] = {
                "po_number":             po_num,
                "pr_number":             "",   # no direct PR link in source data
                "document_type":         s(row["Purchasing Document Type"]),
                "purchase_organization": s(row["Purchasing Organization"]),
                "purchase_group":        s(row["Purchasing Group"]),
                "company_code":          s(row["Company Code"]),
                "vendor":                s(row["Supplier"]),
                "status":                "OPEN",
                "created_at":            now,
                "updated_at":            now,
                "items":                 []
            }
 
        groups[po_num]["items"].append({
            "item_number":      int_str(row["Item"]),
            "material":         s(row["Material"]),
            "quantity":         f(row["Order Quantity"]),
            "net_price":        f(row["Net Order Value"]),
            "delivery_date":    d(row["Delivery Date"]),
            "plant":            s(row["Plant"]),
            "storage_location": s(row["Storage location"])
        })
 
    return list(groups.values())
 
 
# ── Build Goods Receipts ──────────────────────────────────────────────────────
def build_grn_records(filepath):
    df = pd.read_excel(filepath)
    groups = {}
    now = datetime.utcnow()
 
    for _, row in df.iterrows():
        grn_num = int_str(row["Material Document"])
        po_num  = int_str(row["Purchasing Document"])
 
        if grn_num not in groups:
            groups[grn_num] = {
                "grn_number":    grn_num,
                "po_number":     po_num,
                "document_date": d(row["Document Date"]),
                "posting_date":  d(row["Posting Date"]),
                "status":        "POSTED",
                "created_at":    now,
                "updated_at":    now,
                "items":         []
            }
 
        groups[grn_num]["items"].append({
            "item":             int_str(row["Purchase Order Item"]),
            "material":         s(row["Material"]),
            "unit_of_measure":  s(row["Order Unit"]),
            "quantity":         f(row["Quantity(GRN)"]),
            "entry_unit":       s(row["Order Unit"]),
            "plant":            s(row["Plant"]),
            "storage_location": s(row["Storage Location"]),
            "price":            f(row["Quantity in Order Unit(PO)"])
        })
 
    return list(groups.values())
 
 
# ── Build Invoice Verifications from PO+GRN links ────────────────────────────
def build_invoice_records(po_records, grn_records):
    """
    Auto-generate invoice records for every GRN that has a matching PO.
    Format: INV-<grn_number>
    """
    po_map  = {p["po_number"]: p for p in po_records}
    now     = datetime.utcnow()
    records = []
 
    for grn in grn_records:
        po_num  = grn["po_number"]
        po_rec  = po_map.get(po_num)
        pr_num  = po_rec["pr_number"] if po_rec else ""
        inv_num = f"INV-{grn['grn_number']}"
 
        records.append({
            "invoice_number":    inv_num,
            "pr_number":         pr_num,
            "po_number":         po_num,
            "grn_number":        grn["grn_number"],
            "status":            "PENDING",
            "miro_redirect_url": f"https://sap-miro.example.com/miro?ref={inv_num}",
            "created_at":        now,
            "updated_at":        now
        })
 
    return records
 
 
# ── Build Notifications for missing documents ─────────────────────────────────
def build_notifications(pr_records, po_records, grn_records):
    now    = datetime.utcnow()
    notifs = []
 
    for pr in pr_records:
        notifs.append({
            "type":             "MISSING_DOCUMENT",
            "stage":            "PR",
            "reference_number": pr["pr_number"],
            "message":          f"PR document not uploaded for PR {pr['pr_number']}",
            "action_label":     "Upload Now",
            "action_route":     f"/document-uploads/pr/upload?pr={pr['pr_number']}",
            "is_read":          False,
            "created_at":       now
        })
 
    for po in po_records:
        notifs.append({
            "type":             "MISSING_DOCUMENT",
            "stage":            "PO",
            "reference_number": po["po_number"],
            "message":          f"PO document not uploaded for PO {po['po_number']}",
            "action_label":     "Upload Now",
            "action_route":     f"/document-uploads/po/upload?po={po['po_number']}",
            "is_read":          False,
            "created_at":       now
        })
 
    for grn in grn_records:
        notifs.append({
            "type":             "MISSING_DOCUMENT",
            "stage":            "GRN",
            "reference_number": grn["grn_number"],
            "message":          f"GRN document not uploaded for GRN {grn['grn_number']}",
            "action_label":     "Upload Now",
            "action_route":     f"/document-uploads/grn/upload?grn={grn['grn_number']}",
            "is_read":          False,
            "created_at":       now
        })
 
    return notifs
 
 
# ── Main seeder ───────────────────────────────────────────────────────────────
def seed():
    print("=" * 60)
    print("SAP Procurement Portal – Real Data Seeder")
    print("=" * 60)
 
    # Validate files exist
    for label, path in [("PR", PR_FILE), ("PO", PO_FILE), ("GRN", GRN_FILE)]:
        if not os.path.exists(path):
            print(f"❌ Missing file: {path}")
            print(f"   Place {os.path.basename(path)} in the same folder as this script.")
            sys.exit(1)
        print(f"✅ Found {label} file: {os.path.basename(path)}")
 
    print("\nReading and transforming Excel files...")
    pr_records  = build_pr_records(PR_FILE)
    po_records  = build_po_records(PO_FILE)
    grn_records = build_grn_records(GRN_FILE)
    inv_records = build_invoice_records(po_records, grn_records)
    notif_records = build_notifications(pr_records, po_records, grn_records)
 
    print(f"  PR  records : {len(pr_records)}")
    print(f"  PO  records : {len(po_records)}")
    print(f"  GRN records : {len(grn_records)}")
    print(f"  INV records : {len(inv_records)}")
    print(f"  Notifications: {len(notif_records)}")
 
    with app.app_context():
        db = mongo.db
 
        # Drop existing collections
        for col in ["purchase_requisitions", "purchase_orders", "goods_receipts",
                    "invoice_verifications", "documents", "notifications"]:
            db[col].drop()
            print(f"\n  Dropped: {col}")
 
        # Insert
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
 
        # Create indexes
        print("\nCreating indexes...")
        db.purchase_requisitions.create_index("pr_number", unique=True)
        db.purchase_orders.create_index("po_number", unique=True)
        db.goods_receipts.create_index("grn_number", unique=True)
        db.invoice_verifications.create_index("invoice_number", unique=True)
        db.purchase_orders.create_index("pr_number")
        db.goods_receipts.create_index("po_number")
        db.documents.create_index([("stage", 1), ("reference_number", 1)])
        db.notifications.create_index([("is_read", 1), ("created_at", -1)])
        print("  ✅ Indexes created")
 
        # Verify counts
        print("\n" + "=" * 60)
        print("Verification – MongoDB record counts:")
        print(f"  purchase_requisitions : {db.purchase_requisitions.count_documents({})}")
        print(f"  purchase_orders       : {db.purchase_orders.count_documents({})}")
        print(f"  goods_receipts        : {db.goods_receipts.count_documents({})}")
        print(f"  invoice_verifications : {db.invoice_verifications.count_documents({})}")
        print(f"  notifications         : {db.notifications.count_documents({})}")
        print("=" * 60)
        print("\n✅ Real data seed completed successfully.")
        print("\nSample data to test in Postman:")
        print(f"  GET /api/pr/{pr_records[0]['pr_number']}")
        print(f"  GET /api/po/{po_records[0]['po_number']}")
        print(f"  GET /api/grn/{grn_records[0]['grn_number']}")
        print(f"  GET /api/invoice/{inv_records[0]['invoice_number']}")
 
 
if __name__ == "__main__":
    seed()
