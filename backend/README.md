# SAP Procurement Support Portal – Backend API

Flask + MongoDB backend for the SAP-inspired procurement support portal.

---

## Project Structure

```
sap_procurement_backend/
├── app/
│   ├── __init__.py              # App factory, blueprint registration
│   ├── config.py                # Configuration from .env
│   ├── models/
│   │   └── schemas.py           # MongoDB schema documentation + index init
│   ├── routes/
│   │   ├── master_data.py       # Value help endpoints (PR/PO/GRN/INV number lists)
│   │   ├── purchase_requisition.py
│   │   ├── purchase_order.py
│   │   ├── goods_receipt.py
│   │   ├── invoice_verification.py
│   │   ├── notifications.py
│   │   └── dashboard.py
│   ├── services/
│   │   ├── ocr_service.py       # Tesseract + PyMuPDF OCR + validation logic
│   │   └── document_service.py  # Upload / change / view / download logic
│   └── utils/
│       └── helpers.py           # Serialization, response builders, file helpers
├── uploads/
│   ├── pr/
│   ├── po/
│   ├── grn/
│   └── invoice/
├── run.py                       # Entry point
├── seed_data.py                 # Demo data seeder
├── requirements.txt
├── .env
└── SAP_Procurement_Postman_Collection.json
```

---

## Quick Start

### 1. Prerequisites

- Python 3.10+
- MongoDB running on `localhost:27017`
- Tesseract OCR installed on OS:
  - Ubuntu/Debian: `sudo apt install tesseract-ocr`
  - macOS: `brew install tesseract`
  - Windows: Download from https://github.com/UB-Mannheim/tesseract/wiki

### 2. Install Dependencies

```bash
cd sap_procurement_backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure Environment

Edit `.env` if needed (defaults work for local MongoDB):
```
MONGO_URI=mongodb://localhost:27017/sap_procurement
UPLOAD_FOLDER=uploads
MAX_CONTENT_LENGTH=16777216
SECRET_KEY=sap-procurement-demo-secret-key-2024
```

### 4. Seed Demo Data

```bash
python seed_data.py
```

This creates:
- 3 Purchase Requisitions (PR-1001, PR-1002, PR-1003)
- 3 Purchase Orders (PO-2001, PO-2002, PO-2003)
- 2 Goods Receipts (GRN-3001, GRN-3002)
- 2 Invoice Verifications (INV-4001, INV-4002)
- 3 Sample Notifications

### 5. Run the Server

```bash
python run.py
```

Server starts at: `http://localhost:5000`

---

## API Reference

### Base URL: `http://localhost:5000`

---

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |

---

### Master Data (Value Help)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/master/pr-numbers` | All PR numbers for value help picker |
| GET | `/api/master/po-numbers` | All PO numbers for value help picker |
| GET | `/api/master/grn-numbers` | All GRN numbers for value help picker |
| GET | `/api/master/invoice-numbers` | All Invoice numbers |

---

### Purchase Requisition (`/api/pr`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pr/` | List all PRs |
| GET | `/api/pr/<pr_number>` | Get PR details (auto-fill fields) |
| POST | `/api/pr/<pr_number>/documents/upload` | Upload PR documents (**supports multiple**) |
| PUT | `/api/pr/<pr_number>/documents/<doc_id>/change` | Replace a specific PR document |
| GET | `/api/pr/<pr_number>/documents` | View all active PR documents |
| GET | `/api/pr/documents/<doc_id>/download` | Download a document |

**Upload PR Documents:**
- Form-data key: `files` (multiple) or `file` (single)
- Supported types: pdf, png, jpg, jpeg, tiff, bmp

---

### Purchase Order (`/api/po`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/po/` | List all POs |
| GET | `/api/po/<po_number>` | Get PO details (auto-fill) |
| GET | `/api/po/by-pr/<pr_number>` | Get PO linked to a PR |
| POST | `/api/po/<po_number>/documents/upload` | Upload PO document (**single only**) |
| PUT | `/api/po/<po_number>/documents/<doc_id>/change` | Replace PO document |
| GET | `/api/po/<po_number>/documents` | View active PO document |
| GET | `/api/po/documents/<doc_id>/download` | Download document |

**OCR on PO:** Validates document type + PO number + **cross-references linked PR number**

---

### Goods Receipt / GRN (`/api/grn`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/grn/` | List all GRNs |
| GET | `/api/grn/<grn_number>` | Get GRN details (auto-fill) |
| GET | `/api/grn/by-po/<po_number>` | Get GRN linked to a PO |
| POST | `/api/grn/<grn_number>/documents/upload` | Upload GRN document (**single only**) |
| PUT | `/api/grn/<grn_number>/documents/<doc_id>/change` | Replace GRN document |
| GET | `/api/grn/<grn_number>/documents` | View active GRN document |
| GET | `/api/grn/documents/<doc_id>/download` | Download document |

---

### Invoice Verification (`/api/invoice`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/invoice/` | List all invoices |
| GET | `/api/invoice/<invoice_number>` | **Aggregated PR+PO+GRN data** for display |
| GET | `/api/invoice/by-po/<po_number>` | Get invoice linked to a PO |
| POST | `/api/invoice/<invoice_number>/documents/upload` | Upload invoice document |
| PUT | `/api/invoice/<invoice_number>/documents/<doc_id>/change` | Replace document |
| GET | `/api/invoice/<invoice_number>/documents` | View document |
| GET | `/api/invoice/documents/<doc_id>/download` | Download document |
| POST | `/api/invoice/<invoice_number>/miro-redirect` | **Log handoff + return MIRO URL** |

---

### Notifications (`/api/notifications`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications/` | List all notifications (unread first) |
| GET | `/api/notifications/?unread=true` | Unread only |
| GET | `/api/notifications/?stage=PR` | Filter by stage |
| GET | `/api/notifications/unread-count` | Badge count for topbar icon |
| PUT | `/api/notifications/<id>/read` | Mark single as read |
| PUT | `/api/notifications/mark-all-read` | Mark all as read |
| POST | `/api/notifications/` | Create notification (manual/testing) |
| DELETE | `/api/notifications/<id>` | Delete notification |

---

### Dashboard (`/api/dashboard`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/summary` | KPIs: totals, doc status, OCR stats, notifications |
| GET | `/api/dashboard/stages` | Per-record document + OCR status per stage |
| GET | `/api/dashboard/recent-activity?limit=10` | Last N document uploads |

---

## OCR Validation Logic

| Stage | Type Check | Number Check | Cross-Reference |
|-------|-----------|--------------|-----------------|
| PR | ✅ Checks for PR keywords | ✅ PR number in doc | — |
| PO | ✅ Checks for PO keywords | ✅ PO number in doc | ✅ **PR number in PO doc** |
| GRN | ✅ Checks for GRN keywords | ✅ GRN number in doc | — |
| INVOICE | ✅ Checks for invoice keywords | ✅ INV number in doc | — |

**OCR Status values:**
- `VALID` – All checks passed (confidence ≥ 0.75)
- `REVIEW` – Partially valid, needs manual review (0.4 – 0.74)
- `INVALID` – Document type mismatch or critical number missing (< 0.4)

---

## MongoDB Collections

| Collection | Key Field | Purpose |
|------------|-----------|---------|
| `purchase_requisitions` | `pr_number` | PR master data |
| `purchase_orders` | `po_number` | PO master data (linked to PR) |
| `goods_receipts` | `grn_number` | GRN master data (linked to PO) |
| `invoice_verifications` | `invoice_number` | Invoice records (links PR+PO+GRN) |
| `documents` | `stage + reference_number` | Uploaded file metadata + OCR results |
| `notifications` | `is_read + stage` | User-facing notification messages |

---

## Testing with Postman

1. Import `SAP_Procurement_Postman_Collection.json`
2. Set collection variable `BASE_URL = http://localhost:5000`
3. Start with **Master Data** endpoints to verify data
4. Upload a PDF using **Upload PR Documents**
5. Check OCR result in response
6. Test **Dashboard Summary** for overview
7. Use **MIRO Redirect** on INV-4001 to test handoff flow

---

## Standard Response Format

```json
{
  "success": true,
  "message": "PR details fetched",
  "data": { ... }
}
```

Error response:
```json
{
  "success": false,
  "message": "PR 'PR-9999' not found",
  "errors": []
}
```

---

## Notes for Demo

- **No authentication** – by design for PoC/demo
- Upload folder defaults to `./uploads/` with subfolders per stage
- All business data fields are **read-only** – users only manage documents
- OCR falls back gracefully if Tesseract is not installed (returns PENDING status)
- File size limit: 16MB (configurable in `.env`)
