"""
Procurement Chatbot – RAG + Intent Detection + Action Triggers
================================================================
POST /api/chatbot/message   – main chat endpoint
GET  /api/chatbot/health    – health check

Architecture
------------
1. Intent Detection  – classifies user query into one of 7 intents
2. RAG Fetch         – pulls real data from MongoDB based on intent
3. Prompt Assembly   – injects structured DB data into the LLM prompt
4. LLM Call          – Gemini generates the final response
5. Response Format   – always returns { message, action, data }

Supported Intents
-----------------
FETCH_PR        – single PR lookup
FETCH_PO        – single PO lookup
FETCH_GRN       – single GRN lookup
FETCH_INVOICE   – single invoice lookup
LIST_MISSING    – which records are missing documents
LIST_OCR        – OCR validation summary / failures
LIST_NOTIFS     – notification listing
NAVIGATE        – navigation trigger only (no data needed)
DASHBOARD       – dashboard summary KPIs
RECENT_ACTIVITY – recent uploads
UNKNOWN         – fallback
"""

import os
import re
import json
import logging
from datetime import datetime, timezone
from flask import Blueprint, request
from app import mongo
from app.utils.helpers import serialize_doc, success_response, error_response

import google.generativeai as genai

logger = logging.getLogger(__name__)

chatbot_bp = Blueprint("chatbot", __name__)

# ── Gemini setup ──────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    _gemini_model = genai.GenerativeModel("gemini-2.5-flash")
else:
    _gemini_model = None
    logger.warning("GEMINI_API_KEY not set – chatbot will use rule-based fallback only")


# ── Intent patterns ───────────────────────────────────────────────────────────
_INTENT_PATTERNS = [
    # Specific record lookups – must come before generic LIST patterns
    ("FETCH_PR",      r"\b(pr[-\s]?\d+|purchase\s+req(?:uisition)?)\b"),
    ("FETCH_PO",      r"\b(po[-\s]?\d+|purchase\s+ord(?:er)?)\b"),
    ("FETCH_GRN",     r"\b(grn[-\s]?\d+|goods\s+rec(?:eipt)?)\b"),
    ("FETCH_INVOICE", r"\b(inv[-\s]?\d+|invoice(?:\s+number)?)\b"),
    # Status queries
    ("LIST_MISSING",  r"\b(missing|not\s+upload(?:ed)?|without\s+doc|no\s+doc)\b"),
    ("LIST_OCR",      r"\b(ocr|valid(?:ation)?|invalid|review|rejection)\b"),
    ("LIST_NOTIFS",   r"\b(notif(?:ication)?s?|alert|unread)\b"),
    ("RECENT_ACTIVITY", r"\b(recent|latest|last|new(?:est)?)\s+(upload|doc|activit)\b"),
    ("DASHBOARD",     r"\b(dashboard|summary|kpi|overview|total)\b"),
    # Navigation intents
    ("NAVIGATE",      r"\b(go\s+to|open|show|navigate|take\s+me\s+to|view\s+all|list\s+all)\b"),
]

_SCREEN_MAP = {
    "PR":      "PR_LIST",
    "PO":      "PO_LIST",
    "GRN":     "GRN_LIST",
    "INV":     "INVOICE_LIST",
    "INVOICE": "INVOICE_LIST",
    "DASHBOARD": "DASHBOARD",
    "NOTIFICATION": "NOTIFICATIONS",
}

_REF_PATTERN = re.compile(r"\b(PR|PO|GRN|INV)[-\s]?(\d+)\b", re.IGNORECASE)


# ── Helpers ───────────────────────────────────────────────────────────────────
def _detect_intent(text: str) -> str:
    """Return the best-matching intent for a given user message."""
    lower = text.lower()
    for intent, pattern in _INTENT_PATTERNS:
        if re.search(pattern, lower):
            return intent
    return "UNKNOWN"


def _extract_ref(text: str) -> tuple[str, str] | tuple[None, None]:
    """Extract (stage, number) from text, e.g. ('PR', '1001')."""
    m = _REF_PATTERN.search(text)
    if m:
        return m.group(1).upper(), m.group(2)
    return None, None


def _extract_navigate_screen(text: str) -> dict:
    """Best-effort: map navigation requests to a screen + optional id."""
    lower = text.lower()
    stage, number = _extract_ref(text)

    if stage and number:
        ref_key = f"{stage}-{number}"
        screen_map = {"PR": "PR_DETAIL", "PO": "PO_DETAIL", "GRN": "GRN_DETAIL", "INV": "INVOICE_DETAIL"}
        return {"type": "NAVIGATE", "screen": screen_map.get(stage, "DASHBOARD"), "id": ref_key}

    for keyword, screen in _SCREEN_MAP.items():
        if keyword.lower() in lower:
            return {"type": "NAVIGATE", "screen": screen}

    return {"type": "NAVIGATE", "screen": "DASHBOARD"}


# ── RAG data fetchers ─────────────────────────────────────────────────────────
def _fetch_pr(pr_number: str) -> dict:
    pr = mongo.db.purchase_requisitions.find_one({"pr_number": f"PR-{pr_number}"}) or \
         mongo.db.purchase_requisitions.find_one({"pr_number": pr_number})
    if not pr:
        return {}
    data = serialize_doc(pr)
    docs = list(mongo.db.documents.find(
        {"stage": "PR", "reference_number": pr.get("pr_number"), "is_active": True},
        {"original_filename": 1, "ocr_status": 1, "uploaded_at": 1, "_id": 0}
    ))
    data["uploaded_documents"] = serialize_doc(docs)
    data["has_documents"] = len(docs) > 0
    return data


def _fetch_po(po_number: str) -> dict:
    po = mongo.db.purchase_orders.find_one({"po_number": f"PO-{po_number}"}) or \
         mongo.db.purchase_orders.find_one({"po_number": po_number})
    if not po:
        return {}
    data = serialize_doc(po)
    docs = list(mongo.db.documents.find(
        {"stage": "PO", "reference_number": po.get("po_number"), "is_active": True},
        {"original_filename": 1, "ocr_status": 1, "uploaded_at": 1, "_id": 0}
    ))
    data["uploaded_document"] = serialize_doc(docs[0]) if docs else None
    data["has_document"] = len(docs) > 0
    return data


def _fetch_grn(grn_number: str) -> dict:
    grn = mongo.db.goods_receipts.find_one({"grn_number": f"GRN-{grn_number}"}) or \
          mongo.db.goods_receipts.find_one({"grn_number": grn_number})
    if not grn:
        return {}
    data = serialize_doc(grn)
    docs = list(mongo.db.documents.find(
        {"stage": "GRN", "reference_number": grn.get("grn_number"), "is_active": True},
        {"original_filename": 1, "ocr_status": 1, "uploaded_at": 1, "_id": 0}
    ))
    data["uploaded_document"] = serialize_doc(docs[0]) if docs else None
    data["has_document"] = len(docs) > 0
    return data


def _fetch_invoice(inv_number: str) -> dict:
    inv = mongo.db.invoice_verifications.find_one({"invoice_number": f"INV-{inv_number}"}) or \
          mongo.db.invoice_verifications.find_one({"invoice_number": inv_number})
    if not inv:
        return {}
    data = serialize_doc(inv)
    docs = list(mongo.db.documents.find(
        {"stage": "INVOICE", "reference_number": inv.get("invoice_number"), "is_active": True},
        {"original_filename": 1, "ocr_status": 1, "uploaded_at": 1, "_id": 0}
    ))
    data["uploaded_document"] = serialize_doc(docs[0]) if docs else None
    data["has_document"] = len(docs) > 0
    return data


def _fetch_missing_docs() -> dict:
    db = mongo.db
    result = {}
    for stage_key, coll, ref_field in [
        ("PR", "purchase_requisitions", "pr_number"),
        ("PO", "purchase_orders", "po_number"),
        ("GRN", "goods_receipts", "grn_number"),
        ("INVOICE", "invoice_verifications", "invoice_number"),
    ]:
        all_refs = [r[ref_field] for r in db[coll].find({}, {ref_field: 1, "_id": 0})]
        uploaded_refs = set(db.documents.distinct("reference_number", {"stage": stage_key, "is_active": True}))
        missing = [r for r in all_refs if r not in uploaded_refs]
        result[stage_key] = {"missing": missing, "count": len(missing), "total": len(all_refs)}
    return result


def _fetch_ocr_summary() -> dict:
    db = mongo.db
    pipeline = [
        {"$match": {"is_active": True}},
        {"$group": {"_id": "$ocr_status", "count": {"$sum": 1}}},
    ]
    ocr_counts = {item["_id"]: item["count"] for item in db.documents.aggregate(pipeline)}

    invalid_docs = list(db.documents.find(
        {"is_active": True, "ocr_status": {"$in": ["INVALID", "REVIEW"]}},
        {"stage": 1, "reference_number": 1, "original_filename": 1,
         "ocr_status": 1, "ocr_rejection_detail": 1, "_id": 0}
    ).limit(10))

    return {
        "summary": ocr_counts,
        "needs_attention": serialize_doc(invalid_docs),
    }


def _fetch_notifications(limit: int = 15) -> list:
    cursor = (
        mongo.db.notifications
        .find({})
        .sort([("is_read", 1), ("created_at", -1)])
        .limit(limit)
    )
    return serialize_doc(list(cursor))


def _fetch_dashboard() -> dict:
    db = mongo.db
    return {
        "totals": {
            "PR": db.purchase_requisitions.count_documents({}),
            "PO": db.purchase_orders.count_documents({}),
            "GRN": db.goods_receipts.count_documents({}),
            "INVOICE": db.invoice_verifications.count_documents({}),
        },
        "ocr": {
            "valid": db.documents.count_documents({"is_active": True, "ocr_status": "VALID"}),
            "invalid": db.documents.count_documents({"is_active": True, "ocr_status": "INVALID"}),
            "review": db.documents.count_documents({"is_active": True, "ocr_status": "REVIEW"}),
            "pending": db.documents.count_documents({"is_active": True, "ocr_status": "PENDING"}),
        },
        "unread_notifications": db.notifications.count_documents({"is_read": False}),
        "miro_sent": db.invoice_verifications.count_documents({"status": "SENT_TO_MIRO"}),
    }


def _fetch_recent(limit: int = 8) -> list:
    cursor = (
        mongo.db.documents
        .find({"is_active": True},
              {"stage": 1, "reference_number": 1, "original_filename": 1,
               "ocr_status": 1, "uploaded_at": 1, "_id": 0})
        .sort("uploaded_at", -1)
        .limit(limit)
    )
    return serialize_doc(list(cursor))


# ── RAG orchestrator ──────────────────────────────────────────────────────────
def _rag_fetch(intent: str, user_text: str) -> dict:
    """Return retrieved DB data for injection into the LLM prompt."""
    stage, number = _extract_ref(user_text)

    if intent == "FETCH_PR" and number:
        return {"intent": intent, "record": _fetch_pr(number)}
    if intent == "FETCH_PO" and number:
        return {"intent": intent, "record": _fetch_po(number)}
    if intent == "FETCH_GRN" and number:
        return {"intent": intent, "record": _fetch_grn(number)}
    if intent == "FETCH_INVOICE" and number:
        return {"intent": intent, "record": _fetch_invoice(number)}
    if intent == "LIST_MISSING":
        return {"intent": intent, "missing_docs": _fetch_missing_docs()}
    if intent == "LIST_OCR":
        return {"intent": intent, "ocr": _fetch_ocr_summary()}
    if intent == "LIST_NOTIFS":
        return {"intent": intent, "notifications": _fetch_notifications()}
    if intent == "RECENT_ACTIVITY":
        return {"intent": intent, "recent": _fetch_recent()}
    if intent == "DASHBOARD":
        return {"intent": intent, "dashboard": _fetch_dashboard()}
    if intent == "NAVIGATE":
        return {"intent": intent}
    return {"intent": "UNKNOWN"}


# ── System prompt ─────────────────────────────────────────────────────────────
_SYSTEM_PROMPT = """
You are DVP Assistant, an AI embedded in a SAP-style procurement document management system.
You have access to real-time data from the database (provided in the context below).

RULES:
- NEVER hallucinate data. Only use what is in the provided DB context.
- If data is not found, say so clearly and briefly.
- Keep responses SHORT and BUSINESS-LIKE (3-6 lines max).
- Always return valid JSON matching this exact schema:
  {
    "message": "<concise human-readable answer>",
    "action": {
      "type": "NAVIGATE | NONE",
      "screen": "PR_LIST | PO_LIST | GRN_LIST | INVOICE_LIST | PR_DETAIL | PO_DETAIL | GRN_DETAIL | INVOICE_DETAIL | DASHBOARD | NOTIFICATIONS | NONE",
      "id": "<optional reference number>"
    },
    
    "data": [<optional array of relevant items for frontend to display>]
  }

  {
    "action": {
        "type": "NAVIGATE",
        "screen": "PR_DETAIL",
        "id": "PR-1001"
    }
  }

When the user mentions a specific document number (e.g. "show PR-1001", "open PO-2003", "check GRN-5"):
- Set action.type = "NAVIGATE"  
- Set action.screen = "PR_DETAIL" / "PO_DETAIL" / "GRN_DETAIL" / "INVOICE_DETAIL" accordingly
- Set action.id = the exact document number (e.g. "PR-1001")

- Use action.type = NAVIGATE when the user wants to go somewhere.
- Use action.type = NONE for information queries.
- data[] should contain items when listing records (missing docs, notifications, OCR issues).
- For single record queries, data[] can be empty (put info in message).

Do not include any markdown, code fences, or extra text outside the JSON.
""".strip()


# ── LLM call ──────────────────────────────────────────────────────────────────
def _call_llm(user_text: str, rag_data: dict) -> dict:
    """Call Gemini with RAG context and return parsed JSON response."""
    if not _gemini_model:
        return _rule_based_fallback(user_text, rag_data)

    context_json = json.dumps(rag_data, default=str, indent=2)
    full_prompt = (
        f"{_SYSTEM_PROMPT}\n\n"
        f"=== DATABASE CONTEXT ===\n{context_json}\n"
        f"=== USER QUERY ===\n{user_text}"
    )

    try:
        response = _gemini_model.generate_content(
            full_prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.2,
                max_output_tokens=512,
            )
        )
        raw = response.text.strip()
        # Strip code fences if present
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        return json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("LLM returned non-JSON: %s", e)
        return _rule_based_fallback(user_text, rag_data)
    except Exception as e:
        logger.error("Gemini call failed: %s", e)
        return _rule_based_fallback(user_text, rag_data)


# ── Rule-based fallback (no LLM / LLM failure) ───────────────────────────────
def _rule_based_fallback(user_text: str, rag: dict) -> dict:
    intent = rag.get("intent", "UNKNOWN")
    no_action = {"type": "NONE", "screen": "NONE"}

    if intent == "FETCH_PR":
        rec = rag.get("record", {})
        if not rec:
            return {"message": "Purchase Requisition not found.", "action": no_action, "data": []}
        has = rec.get("has_documents", False)
        items = len(rec.get("items", []))
        return {
            "message": (f"PR {rec.get('pr_number')} — Status: {rec.get('status', 'N/A')} | "
                        f"{items} line item(s) | "
                        f"Document: {'✓ Uploaded' if has else '✗ Missing'}"),
            "action": {"type": "NAVIGATE", "screen": "PR_DETAIL", "id": rec.get("pr_number")},
            "data": [rec]
        }

    if intent == "FETCH_PO":
        rec = rag.get("record", {})
        if not rec:
            return {"message": "Purchase Order not found.", "action": no_action, "data": []}
        has = rec.get("has_document", False)
        return {
            "message": (f"PO {rec.get('po_number')} — Vendor: {rec.get('vendor', 'N/A')} | "
                        f"Status: {rec.get('status', 'N/A')} | "
                        f"Document: {'✓ Uploaded' if has else '✗ Missing'}"),
            "action": {"type": "NAVIGATE", "screen": "PO_DETAIL", "id": rec.get("po_number")},
            "data": [rec]
        }

    if intent == "FETCH_GRN":
        rec = rag.get("record", {})
        if not rec:
            return {"message": "GRN not found.", "action": no_action, "data": []}
        return {
            "message": (f"GRN {rec.get('grn_number')} — PO: {rec.get('po_number', 'N/A')} | "
                        f"Status: {rec.get('status', 'N/A')} | "
                        f"Document: {'✓ Uploaded' if rec.get('has_document') else '✗ Missing'}"),
            "action": {"type": "NAVIGATE", "screen": "GRN_DETAIL", "id": rec.get("grn_number")},
            "data": [rec]
        }

    if intent == "FETCH_INVOICE":
        rec = rag.get("record", {})
        if not rec:
            return {"message": "Invoice not found.", "action": no_action, "data": []}
        return {
            "message": (f"Invoice {rec.get('invoice_number')} — Status: {rec.get('status', 'N/A')} | "
                        f"Document: {'✓ Uploaded' if rec.get('has_document') else '✗ Missing'}"),
            "action": {"type": "NAVIGATE", "screen": "INVOICE_DETAIL", "id": rec.get("invoice_number")},
            "data": [rec]
        }

    if intent == "LIST_MISSING":
        missing = rag.get("missing_docs", {})
        lines = []
        items = []
        for stage, info in missing.items():
            count = info.get("count", 0)
            lines.append(f"{stage}: {count} missing / {info.get('total', 0)} total")
            for ref in info.get("missing", [])[:5]:
                items.append({"stage": stage, "reference": ref, "status": "MISSING"})
        return {
            "message": "Missing documents by stage:\n" + "\n".join(lines),
            "action": no_action,
            "data": items
        }

    if intent == "LIST_OCR":
        ocr = rag.get("ocr", {})
        summary = ocr.get("summary", {})
        attention = ocr.get("needs_attention", [])
        msg = (f"OCR Summary — Valid: {summary.get('VALID', 0)} | "
               f"Review: {summary.get('REVIEW', 0)} | "
               f"Invalid: {summary.get('INVALID', 0)} | "
               f"Pending: {summary.get('PENDING', 0)}")
        return {"message": msg, "action": no_action, "data": attention}

    if intent == "LIST_NOTIFS":
        notifs = rag.get("notifications", [])
        unread = sum(1 for n in notifs if not n.get("is_read", True))
        return {
            "message": f"{len(notifs)} notification(s) — {unread} unread.",
            "action": {"type": "NAVIGATE", "screen": "NOTIFICATIONS"},
            "data": notifs[:10]
        }

    if intent == "RECENT_ACTIVITY":
        recent = rag.get("recent", [])
        return {
            "message": f"{len(recent)} recent document upload(s).",
            "action": no_action,
            "data": recent
        }

    if intent == "DASHBOARD":
        dash = rag.get("dashboard", {})
        totals = dash.get("totals", {})
        ocr = dash.get("ocr", {})
        return {
            "message": (f"Dashboard: PR {totals.get('PR', 0)} | PO {totals.get('PO', 0)} | "
                        f"GRN {totals.get('GRN', 0)} | INV {totals.get('INVOICE', 0)} | "
                        f"OCR Valid {ocr.get('valid', 0)} | Unread {dash.get('unread_notifications', 0)}"),
            "action": {"type": "NAVIGATE", "screen": "DASHBOARD"},
            "data": []
        }

    if intent == "NAVIGATE":
        action = _extract_navigate_screen(user_text)
        return {
            "message": f"Navigating to {action.get('screen', 'Dashboard')}.",
            "action": action,
            "data": []
        }

    return {
        "message": "I can help with PR, PO, GRN, and Invoice data. Try asking about a specific document number, missing uploads, or OCR status.",
        "action": no_action,
        "data": []
    }


# ── Main endpoint ─────────────────────────────────────────────────────────────
@chatbot_bp.route("/message", methods=["POST"])
def chat_message():
    body = request.get_json(silent=True)
    if not body or not body.get("message"):
        return error_response("'message' field is required", 400)

    user_text = str(body["message"]).strip()[:500]
    if not user_text:
        return error_response("Empty message", 400)

    intent = _detect_intent(user_text)
    rag_data = _rag_fetch(intent, user_text)
    response = _call_llm(user_text, rag_data)

    # Validate response shape
    if not isinstance(response, dict):
        response = {"message": str(response), "action": {"type": "NONE", "screen": "NONE"}, "data": []}
    response.setdefault("message", "")
    response.setdefault("action", {"type": "NONE", "screen": "NONE"})
    response.setdefault("data", [])

    return success_response({
        "chatbot_response": response,
        "debug": {"intent": intent, "rag_keys": list(rag_data.keys())}
    }, "OK")


@chatbot_bp.route("/health", methods=["GET"])
def health():
    return success_response({"llm": "gemini" if _gemini_model else "rule-based"}, "Chatbot healthy")