export type StageKey = "PR" | "PO" | "GRN" | "INVOICE";
export type FrontendStageKey = "PR" | "PO" | "GRN" | "INV";

export type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  errors?: Array<{ filename?: string; reason?: string; error?: string }>;
};

export type NotificationItem = {
  _id: string;
  type: string;
  stage: StageKey;
  reference_number: string;
  message: string;
  action_label: string;
  action_route: string;
  is_read: boolean;
  created_at: string;
};

export type DashboardSummary = {
  totals: {
    purchase_requisitions: number;
    purchase_orders: number;
    goods_receipts: number;
    invoice_verifications: number;
  };
  document_upload_status: Record<StageKey, { total: number; with_docs: number; missing: number }>;
  ocr_summary: {
    valid: number;
    invalid: number;
    review: number;
    pending: number;
  };
  notifications: {
    unread: number;
  };
  miro_sent: number;
};

export type StageDocument = {
  _id: string;
  stage: StageKey;
  reference_number: string;
  filename: string;
  original_filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  ocr_status: "VALID" | "INVALID" | "REVIEW" | "PENDING";
  ocr_result?: {
    document_type_detected?: string | null;
    expected_number_found?: boolean;
    cross_reference_valid?: boolean;
    confidence?: number;
    raw_text_snippet?: string;
    issues?: string[];
  };
  ocr_rejection_detail?: {
    summary?: string;
    status?: string;
    confidence_score?: number;
    confidence_label?: string;
    failure_reasons?: Array<{
      check: string;
      expected: string;
      found: string;
      explanation: string;
      suggestion: string;
    }>;
    what_ocr_read?: string;
    overall_advice?: string;
  } | null;
  version: number;
  is_active: boolean;
  uploaded_by?: string;
  uploaded_at: string;
  updated_at: string;
};

export type StageStatusRecord = {
  reference_number: string;
  record_status: string;
  document_count: number;
  has_document: boolean;
  documents: StageDocument[];
};

export type RecentActivityItem = {
  _id: string;
  stage: StageKey;
  reference_number: string;
  original_filename: string;
  ocr_status: string;
  uploaded_at: string;
};

export type ValueHelpItem = {
  id: string;
  description: string;
  plant?: string;
  vendor?: string;
  status?: string;
};

export type PRItem = {
  item_number: string;
  material: string;
  material_description: string;
  plant: string;
  quantity: number;
  price: number;
  amount: number;
  purchase_organization: string;
  unit_of_measure?: string;
  valuation_price: number;
  delivery_date: string;
  storage_location?: string;
  purchase_group?: string;
};

export type PRRecord = {
  _id: string;
  pr_number: string;
  document_type: string;
  items: PRItem[];
  status: string;
  created_at: string;
  updated_at: string;
  uploaded_documents_count?: number;
  has_documents?: boolean;
};

export type POItem = {
  item_number: string;
  material: string;
  material_description: string;
  quantity: number;
  price: number;
  amount: number;
  net_price: number;
  delivery_date: string;
  plant: string;
  storage_location?: string;
};

export type PORecord = {
  _id: string;
  po_number: string;
  pr_number: string;
  document_type: string;
  purchase_order_date: string;
  net_order_value: number;
  purchase_organization: string;
  purchase_group: string;
  company_code: string;
  vendor: string;
  status: string;
  created_at: string;
  updated_at: string;
  items: POItem[];
  uploaded_document?: StageDocument | null;
  has_document?: boolean;
};

export type GRNItem = {
  item: string;
  item_number: string;
  material: string;
  material_description: string;
  quantity: number;
  price: number;
  amount: number;
  entry_unit: string;
  plant: string;
  purchase_order: string;
  unit_of_measure?: string;
  storage_location?: string;
};

export type GRNRecord = {
  _id: string;
  grn_number: string;
  po_number: string;
  document_date: string;
  posting_date: string;
  status: string;
  created_at: string;
  updated_at: string;
  items: GRNItem[];
  uploaded_document?: StageDocument | null;
  has_document?: boolean;
};

export type InvoiceRecord = {
  _id: string;
  invoice_number: string;
  pr_number: string;
  po_number: string;
  grn_number: string;
  status: string;
  miro_redirect_url: string;
  created_at: string;
  updated_at: string;
};

export type InvoiceAggregate = {
  invoice: InvoiceRecord;
  purchase_requisition: PRRecord | null;
  purchase_order: PORecord | null;
  goods_receipt: GRNRecord | null;
  uploaded_document: StageDocument | null;
  has_document: boolean;
  miro_redirect_url: string;
};
