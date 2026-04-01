"""
OCR Service
============
Extracts text from uploaded documents (PDF / image) and validates:
  1. Document type matches expected stage (PR / PO / GRN / INVOICE)
  2. Expected reference number is present
  3. For PO: linked PR number is also present (cross-reference check)

Tesseract is used for image OCR; PyMuPDF is used to extract text from PDFs.
"""
import os
import re
import logging

logger = logging.getLogger(__name__)

# ── keyword maps for document-type detection ──────────────────────────────────
STAGE_KEYWORDS = {
    "PR": [
        "purchase requisition", "requisition", "pr number", "purchase req",
        "material requisition", "requestedquantity", "pr-"
    ],
    "PO": [
        "purchase order", "po number", "vendor", "supplier",
        "net price", "orderquantity", "po-", "purchase org"
    ],
    "GRN": [
        "goods receipt", "grn", "goods received", "material document",
        "posting date", "document date", "goods receipt note", "grn-"
    ],
    "INVOICE": [
        "invoice", "tax invoice", "invoice number", "bill to",
        "amount due", "gst", "invoice date", "inv-"
    ]
}

# ── helpers ───────────────────────────────────────────────────────────────────

def _extract_text_from_pdf(file_path: str) -> str:
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(file_path)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text
    except Exception as exc:
        logger.warning("PyMuPDF extraction failed: %s", exc)
        return ""

def _extract_text_from_image(file_path: str) -> str:
    try:
        import pytesseract
        from PIL import Image
        img = Image.open(file_path)
        return pytesseract.image_to_string(img)
    except Exception as exc:
        logger.warning("Tesseract extraction failed: %s", exc)
        return ""

def extract_text(file_path: str) -> str:
    ext = file_path.rsplit(".", 1)[-1].lower()
    if ext == "pdf":
        text = _extract_text_from_pdf(file_path)
        # fallback to OCR if PDF has no selectable text
        if len(text.strip()) < 30:
            text = _extract_text_from_image(file_path)
    else:
        text = _extract_text_from_image(file_path)
    return text

def _detect_stage(text: str) -> str | None:
    """Return detected stage name based on keyword density."""
    lower = text.lower()
    scores = {}
    for stage, keywords in STAGE_KEYWORDS.items():
        scores[stage] = sum(1 for kw in keywords if kw in lower)
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else None

def _find_number(text: str, ref_number: str) -> bool:
    """Check if ref_number appears in OCR text (case-insensitive, ignoring dashes/spaces)."""
    # normalise for flexible match
    clean_ref = re.sub(r"[\s\-]", "", ref_number).lower()
    clean_text = re.sub(r"[\s\-]", "", text).lower()
    return clean_ref in clean_text

# ── main validation entry point ───────────────────────────────────────────────

def validate_document(file_path: str, stage: str, reference_number: str,
                       linked_pr_number: str = None) -> dict:
    """
    Perform OCR and validate document.

    Returns:
    {
        "ocr_status": "VALID" | "INVALID" | "REVIEW",
        "document_type_detected": str | None,
        "expected_number_found": bool,
        "cross_reference_valid": bool,   # only for PO
        "confidence": float (0-1),
        "raw_text_snippet": str,
        "issues": [str]
    }
    """
    issues = []

    if not os.path.exists(file_path):
        return {
            "ocr_status": "INVALID",
            "document_type_detected": None,
            "expected_number_found": False,
            "cross_reference_valid": False,
            "confidence": 0.0,
            "raw_text_snippet": "",
            "issues": ["File not found on server"]
        }

    raw_text = extract_text(file_path)
    snippet = raw_text[:500].replace("\n", " ").strip()

    detected_stage = _detect_stage(raw_text)
    expected_number_found = _find_number(raw_text, reference_number)
    cross_reference_valid = True  # default true unless PO check fails

    # ── type check ──
    type_conflict = detected_stage is not None and detected_stage != stage.upper()
    type_unknown = detected_stage is None

    if type_conflict:
        issues.append(
            f"Document appears to be a {detected_stage} document, expected {stage.upper()}."
        )
    elif type_unknown and not expected_number_found:
        issues.append(f"Could not confidently identify document type for {stage.upper()}.")

    # ── number presence check ──
    if not expected_number_found:
        issues.append(f"Expected reference number '{reference_number}' not found in document.")

    # ── PO cross-reference check ──
    if stage.upper() == "PO" and linked_pr_number:
        cross_reference_valid = _find_number(raw_text, linked_pr_number)
        if not cross_reference_valid:
            issues.append(
                f"Linked PR number '{linked_pr_number}' not found in PO document. "
                "Cross-reference validation failed."
            )

    # ── confidence scoring ──
    type_ok = detected_stage == stage.upper()
    num_ok = expected_number_found
    xref_ok = cross_reference_valid

    if type_ok:
        type_score = 0.4 if stage.upper() == "PO" else 0.5
    elif type_unknown:
        # OCR can miss keywords on otherwise correct scans, so don't force REVIEW
        # when the expected document number (and linked PR for PO) are present.
        type_score = 0.25
    else:
        type_score = 0.0

    if stage.upper() == "PO":
        score = type_score + (0.35 if num_ok else 0.0) + (0.25 if xref_ok else 0.0)
    else:
        score = type_score + (0.5 if num_ok else 0.0)

    # ── final status ──
    if score >= 0.75:
        ocr_status = "VALID"
    elif score >= 0.4:
        ocr_status = "REVIEW"
    else:
        ocr_status = "INVALID"

    return {
        "ocr_status": ocr_status,
        "document_type_detected": detected_stage,
        "expected_number_found": expected_number_found,
        "cross_reference_valid": cross_reference_valid,
        "confidence": round(score, 2),
        "raw_text_snippet": snippet,
        "issues": issues
    }


# ── detailed rejection explanation ───────────────────────────────────────────

def build_rejection_explanation(ocr_result: dict, stage: str, reference_number: str) -> dict:
    """
    Build a detailed, human-readable explanation of why a document was
    rejected or flagged for review after OCR validation.

    Returns a dict with:
    {
        "summary":          str,           # one-line verdict
        "status":           str,           # INVALID | REVIEW
        "confidence_score": float,         # 0.0 – 1.0
        "confidence_label": str,           # "Very Low" | "Low" | "Moderate" | "High"
        "failure_reasons":  [              # each issue broken down individually
            {
                "check":       str,        # which check failed
                "expected":    str,        # what the system expected to find
                "found":       str,        # what was actually detected
                "explanation": str,        # plain-English reason
                "suggestion":  str         # how to fix it
            }
        ],
        "what_ocr_read":    str,           # first 500 chars OCR extracted
        "overall_advice":   str            # combined actionable guidance
    }
    """
    status        = ocr_result.get("ocr_status", "INVALID")
    confidence    = ocr_result.get("confidence", 0.0)
    issues        = ocr_result.get("issues", [])
    detected_type = ocr_result.get("document_type_detected")
    num_found     = ocr_result.get("expected_number_found", False)
    xref_valid    = ocr_result.get("cross_reference_valid", True)
    snippet       = ocr_result.get("raw_text_snippet", "")

    # ── confidence label ──
    if confidence >= 0.75:
        conf_label = "High"
    elif confidence >= 0.5:
        conf_label = "Moderate"
    elif confidence >= 0.25:
        conf_label = "Low"
    else:
        conf_label = "Very Low"

    # ── summary line ──
    if status == "INVALID":
        summary = (
            f"Document rejected: OCR validation failed for {stage.upper()} "
            f"{reference_number} (confidence {confidence:.0%})."
        )
    else:  # REVIEW
        summary = (
            f"Document flagged for manual review: partial OCR match for "
            f"{stage.upper()} {reference_number} (confidence {confidence:.0%})."
        )

    # ── per-check failure breakdown ──
    failure_reasons = []

    # Check 1: document type mismatch
    if detected_type != stage.upper():
        if detected_type:
            explanation = (
                f"The OCR engine scanned the document and identified it as a "
                f"'{detected_type}' document based on keywords found in its text "
                f"(e.g. '{', '.join(STAGE_KEYWORDS.get(detected_type, [])[:3])}'). "
                f"However, this upload slot expects a '{stage.upper()}' document."
            )
            suggestion = (
                f"Make sure you are uploading the correct document. "
                f"A {stage.upper()} document should contain keywords such as: "
                f"{', '.join(STAGE_KEYWORDS.get(stage.upper(), [])[:4])}."
            )
        else:
            explanation = (
                "The OCR engine could not find any recognisable document-type keywords "
                "in the scanned text. This usually means the document is either scanned "
                "at very low resolution, is blank, or is in a language/format not "
                "supported by the keyword dictionary."
            )
            suggestion = (
                f"Re-upload a clearer scan or a text-based PDF. "
                f"Ensure the document clearly states it is a {stage.upper()} and contains "
                f"keywords such as: {', '.join(STAGE_KEYWORDS.get(stage.upper(), [])[:4])}."
            )
        failure_reasons.append({
            "check":       "Document Type Detection",
            "expected":    stage.upper(),
            "found":       detected_type or "Undetected",
            "explanation": explanation,
            "suggestion":  suggestion
        })

    # Check 2: reference number not found
    if not num_found:
        failure_reasons.append({
            "check":       "Reference Number Presence",
            "expected":    reference_number,
            "found":       "Not found in OCR text",
            "explanation": (
                f"The system searched the entire OCR-extracted text for the reference "
                f"number '{reference_number}' (ignoring spaces and dashes) but could not "
                f"locate it. This could happen because: (a) the document belongs to a "
                f"different {stage.upper()} number, (b) the number is printed in a non-standard "
                f"font or is partially obscured, (c) the scan quality is too low for the "
                f"OCR engine to read that area of the page, or (d) the document does not "
                f"contain the reference number at all."
            ),
            "suggestion": (
                f"Verify that the physical document displays '{reference_number}' clearly. "
                f"If it does, try re-scanning at a higher DPI (300+ recommended) or "
                f"upload a text-based PDF instead of a scanned image."
            )
        })

    # Check 3: PO cross-reference (linked PR number missing)
    if stage.upper() == "PO" and not xref_valid:
        linked_pr = next(
            (i.split("'")[1] for i in issues if "Linked PR" in i and "'" in i),
            "linked PR"
        )
        failure_reasons.append({
            "check":       "Cross-Reference Validation (Linked PR Number)",
            "expected":    f"PR number present in PO document",
            "found":       f"'{linked_pr}' not found in OCR text",
            "explanation": (
                f"Purchase Order documents must reference the originating Purchase "
                f"Requisition number. The system searched for '{linked_pr}' inside "
                f"the PO document but could not find it. This cross-reference check "
                f"ensures PO documents are traceable back to an approved PR."
            ),
            "suggestion": (
                f"Ensure the PO document explicitly mentions the PR number '{linked_pr}'. "
                f"If the document is correct, check whether the number appears in a table "
                f"cell or header that may have been missed during OCR extraction."
            )
        })

    # ── overall advice ──
    if not failure_reasons:
        overall_advice = "No specific failures detected beyond low confidence scoring."
    else:
        checks_failed = [r["check"] for r in failure_reasons]
        overall_advice = (
            f"{len(failure_reasons)} check(s) failed: {', '.join(checks_failed)}. "
        )
        if status == "INVALID":
            overall_advice += (
                "The document must be corrected and re-uploaded before it can be accepted."
            )
        else:
            overall_advice += (
                "The document has been flagged for manual review. A reviewer can "
                "override the OCR decision if the document is physically correct."
            )

    return {
        "summary":          summary,
        "status":           status,
        "confidence_score": confidence,
        "confidence_label": conf_label,
        "failure_reasons":  failure_reasons,
        "what_ocr_read":    snippet if snippet else "No text could be extracted.",
        "overall_advice":   overall_advice
    }
