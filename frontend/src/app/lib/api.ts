import type {
  ApiEnvelope,
  DashboardSummary,
  FrontendStageKey,
  GRNItem,
  GRNRecord,
  InvoiceAggregate,
  InvoiceRecord,
  NotificationItem,
  POItem,
  PORecord,
  PRItem,
  PRRecord,
  RecentActivityItem,
  StageDocument,
  StageKey,
  StageStatusRecord,
  ValueHelpItem,
} from "./types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const DEFAULT_UPLOADER = import.meta.env.VITE_DEFAULT_UPLOADER || "frontend.user";

const ROUTE_MAP: Record<StageKey, string> = {
  PR: "pr",
  PO: "po",
  GRN: "grn",
  INVOICE: "invoice",
};

function buildUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeStageDocument(document: any): StageDocument {
  return {
    _id: asString(document?._id),
    stage: (document?.stage || "PR") as StageKey,
    reference_number: asString(document?.reference_number),
    filename: asString(document?.filename),
    original_filename: asString(document?.original_filename),
    file_path: asString(document?.file_path),
    file_size: toNumber(document?.file_size),
    mime_type: asString(document?.mime_type),
    ocr_status: (document?.ocr_status || "PENDING") as StageDocument["ocr_status"],
    ocr_result: document?.ocr_result,
    ocr_rejection_detail: document?.ocr_rejection_detail ?? null,
    version: toNumber(document?.version, 1),
    is_active: Boolean(document?.is_active),
    uploaded_by: document?.uploaded_by ? asString(document.uploaded_by) : undefined,
    uploaded_at: asString(document?.uploaded_at),
    updated_at: asString(document?.updated_at),
  };
}

function normalizePrItem(item: any): PRItem {
  const price = toNumber(item?.price ?? item?.valuation_price);
  const amount = toNumber(item?.amount, price * toNumber(item?.quantity));
  return {
    item_number: asString(item?.item_number ?? item?.itemNumber),
    material: asString(item?.material),
    material_description: asString(item?.material_description ?? item?.materialDescription),
    plant: asString(item?.plant),
    quantity: toNumber(item?.quantity),
    price,
    amount,
    purchase_organization: asString(item?.purchase_organization ?? item?.purchaseOrganization),
    unit_of_measure: asString(item?.unit_of_measure),
    valuation_price: price,
    delivery_date: asString(item?.delivery_date),
    storage_location: asString(item?.storage_location),
    purchase_group: asString(item?.purchase_group ?? item?.purchaseOrganization),
  };
}

function normalizePoItem(item: any): POItem {
  const price = toNumber(item?.price ?? item?.net_price);
  const amount = toNumber(item?.amount, price * toNumber(item?.quantity));
  return {
    item_number: asString(item?.item_number ?? item?.itemNumber),
    material: asString(item?.material),
    material_description: asString(item?.material_description ?? item?.materialDescription),
    quantity: toNumber(item?.quantity),
    price,
    amount,
    net_price: price,
    delivery_date: asString(item?.delivery_date),
    plant: asString(item?.plant),
    storage_location: asString(item?.storage_location),
  };
}

function normalizeGrnItem(item: any): GRNItem {
  const quantity = toNumber(item?.quantity);
  const price = toNumber(item?.price);
  const amount = toNumber(item?.amount, price * quantity);
  const itemNumber = asString(item?.item_number ?? item?.itemNumber ?? item?.item);
  return {
    item: itemNumber,
    item_number: itemNumber,
    material: asString(item?.material),
    material_description: asString(item?.material_description ?? item?.materialDescription),
    quantity,
    price,
    amount,
    entry_unit: asString(item?.entry_unit ?? item?.unit_of_measure),
    plant: asString(item?.plant),
    purchase_order: asString(item?.purchase_order ?? item?.purchaseOrder ?? item?.purchaseOrderNumber),
    unit_of_measure: asString(item?.unit_of_measure),
    storage_location: asString(item?.storage_location),
  };
}

function normalizePrRecord(record: any): PRRecord {
  return {
    _id: asString(record?._id),
    pr_number: asString(record?.pr_number ?? record?.purchaseRequisitionNumber),
    document_type: asString(record?.document_type ?? record?.purchaseDocumentType),
    items: Array.isArray(record?.items) ? record.items.map(normalizePrItem) : [],
    status: asString(record?.status),
    created_at: asString(record?.created_at),
    updated_at: asString(record?.updated_at),
    uploaded_documents_count: typeof record?.uploaded_documents_count === "number" ? record.uploaded_documents_count : undefined,
    has_documents: typeof record?.has_documents === "boolean" ? record.has_documents : undefined,
  };
}

function normalizePoRecord(record: any): PORecord {
  return {
    _id: asString(record?._id),
    po_number: asString(record?.po_number ?? record?.purchaseOrderNumber),
    pr_number: asString(record?.pr_number ?? record?.purchaseRequisitionNumber),
    document_type: asString(record?.document_type ?? record?.purchaseDocumentType),
    purchase_order_date: asString(record?.purchase_order_date ?? record?.purchaseOrderDate),
    net_order_value: toNumber(record?.net_order_value ?? record?.netOrderValue),
    purchase_organization: asString(record?.purchase_organization ?? record?.purchaseOrganization),
    purchase_group: asString(record?.purchase_group ?? record?.purchasingGroup),
    company_code: asString(record?.company_code ?? record?.companyCode),
    vendor: asString(record?.vendor ?? record?.supplier),
    status: asString(record?.status),
    created_at: asString(record?.created_at),
    updated_at: asString(record?.updated_at),
    items: Array.isArray(record?.items) ? record.items.map(normalizePoItem) : [],
    uploaded_document: record?.uploaded_document ? normalizeStageDocument(record.uploaded_document) : null,
    has_document: typeof record?.has_document === "boolean" ? record.has_document : undefined,
  };
}

function normalizeGrnRecord(record: any): GRNRecord {
  const firstItem = Array.isArray(record?.items) ? record.items[0] : null;
  const items = Array.isArray(record?.items) ? record.items.map(normalizeGrnItem) : [];
  const poNumber = asString(record?.po_number ?? record?.purchaseOrderNumber ?? firstItem?.purchaseOrder);
  return {
    _id: asString(record?._id),
    grn_number: asString(record?.grn_number ?? record?.materialDocumentNumber),
    po_number: poNumber,
    document_date: asString(record?.document_date ?? record?.documentDate),
    posting_date: asString(record?.posting_date ?? record?.postingDate),
    status: asString(record?.status),
    created_at: asString(record?.created_at),
    updated_at: asString(record?.updated_at),
    items: items.map((item: GRNItem) => ({ ...item, purchase_order: item.purchase_order || poNumber })),
    uploaded_document: record?.uploaded_document ? normalizeStageDocument(record.uploaded_document) : null,
    has_document: typeof record?.has_document === "boolean" ? record.has_document : undefined,
  };
}

function normalizeInvoiceRecord(record: any): InvoiceRecord {
  return {
    _id: asString(record?._id),
    invoice_number: asString(record?.invoice_number),
    pr_number: asString(record?.pr_number ?? record?.purchaseRequisitionNumber),
    po_number: asString(record?.po_number ?? record?.purchaseOrderNumber),
    grn_number: asString(record?.grn_number ?? record?.materialDocumentNumber),
    status: asString(record?.status),
    miro_redirect_url: asString(record?.miro_redirect_url),
    created_at: asString(record?.created_at),
    updated_at: asString(record?.updated_at),
  };
}

function normalizeInvoiceAggregate(record: any): InvoiceAggregate {
  return {
    invoice: normalizeInvoiceRecord(record?.invoice),
    purchase_requisition: record?.purchase_requisition ? normalizePrRecord(record.purchase_requisition) : null,
    purchase_order: record?.purchase_order
      ? normalizePoRecord(record.purchase_order)
      : record?.purchaseOrder
        ? normalizePoRecord(record.purchaseOrder)
        : null,
    goods_receipt: record?.goods_receipt ? normalizeGrnRecord(record.goods_receipt) : null,
    uploaded_document: record?.uploaded_document ? normalizeStageDocument(record.uploaded_document) : null,
    has_document: Boolean(record?.has_document),
    miro_redirect_url: asString(record?.miro_redirect_url),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), init);
  let payload: ApiEnvelope<T> | null = null;

  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || `Request failed with status ${response.status}`);
  }

  return payload.data;
}

export function buildApiAssetUrl(path: string) {
  return buildUrl(path);
}

export function getStageFromFrontend(stage: FrontendStageKey): StageKey {
  return stage === "INV" ? "INVOICE" : stage;
}

export function getReferenceLabel(stage: FrontendStageKey) {
  return stage === "INV" ? "Invoice Number" : `${stage} Number`;
}

export async function getDashboardSummary() {
  return request<DashboardSummary>("/dashboard/summary");
}

export async function getDashboardStages() {
  return request<Record<StageKey, StageStatusRecord[]>>("/dashboard/stages");
}

export async function getRecentActivity(limit = 10) {
  return request<{ activities: RecentActivityItem[]; count: number }>(`/dashboard/recent-activity?limit=${limit}`);
}

export async function getNotifications(limit = 20, unreadOnly = false) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (unreadOnly) params.set("unread", "true");
  return request<{ notifications: NotificationItem[]; count: number }>(`/notifications/?${params.toString()}`);
}

export async function getUnreadNotificationCount() {
  return request<{ unread_count: number }>("/notifications/unread-count");
}

export async function markNotificationRead(notificationId: string) {
  return request<null>(`/notifications/${notificationId}/read`, { method: "PUT" });
}

export async function markAllNotificationsRead() {
  return request<{ updated_count: number }>("/notifications/mark-all-read", { method: "PUT" });
}

export async function listValueHelp(stage: FrontendStageKey): Promise<ValueHelpItem[]> {
  if (stage === "PR") {
    const data = await request<Array<{ pr_number?: string; purchaseRequisitionNumber?: string; document_type?: string; purchaseDocumentType?: string; status?: string }>>("/master/pr-numbers");
    return data.map((item) => {
      const id = asString(item.pr_number ?? item.purchaseRequisitionNumber);
      return { id, description: asString(item.document_type ?? item.purchaseDocumentType) || id, status: asString(item.status) };
    });
  }
  if (stage === "PO") {
    const data = await request<Array<{ po_number?: string; purchaseOrderNumber?: string; pr_number?: string; purchaseRequisitionNumber?: string; vendor?: string; supplier?: string; status?: string }>>("/master/po-numbers");
    return data.map((item) => {
      const id = asString(item.po_number ?? item.purchaseOrderNumber);
      const linkedPr = asString(item.pr_number ?? item.purchaseRequisitionNumber);
      return { id, description: linkedPr || id, vendor: asString(item.vendor ?? item.supplier), status: asString(item.status) };
    });
  }
  if (stage === "GRN") {
    const data = await request<Array<{ grn_number?: string; materialDocumentNumber?: string; po_number?: string; purchaseOrderNumber?: string; status?: string }>>("/master/grn-numbers");
    return data.map((item) => {
      const id = asString(item.grn_number ?? item.materialDocumentNumber);
      const linkedPo = asString(item.po_number ?? item.purchaseOrderNumber);
      return { id, description: linkedPo || id, status: asString(item.status) };
    });
  }

  const data = await request<Array<{ invoice_number?: string; pr_number?: string; po_number?: string; grn_number?: string; purchaseRequisitionNumber?: string; purchaseOrderNumber?: string; materialDocumentNumber?: string; status?: string }>>("/master/invoice-numbers");
  return data.map((item) => ({
    id: asString(item.invoice_number),
    description:
      [
        asString(item.pr_number ?? item.purchaseRequisitionNumber),
        asString(item.po_number ?? item.purchaseOrderNumber),
        asString(item.grn_number ?? item.materialDocumentNumber),
      ].filter((value): value is string => Boolean(value)).join(" • ") || asString(item.invoice_number),
    status: asString(item.status),
  }));
}

export async function listStageRecords(stage: StageKey) {
  const route = ROUTE_MAP[stage];
  if (stage === "PR") {
    const data = await request<any[]>(`/${route}/`);
    return data.map(normalizePrRecord);
  }
  if (stage === "PO") {
    const data = await request<any[]>(`/${route}/`);
    return data.map(normalizePoRecord);
  }
  if (stage === "GRN") {
    const data = await request<any[]>(`/${route}/`);
    return data.map(normalizeGrnRecord);
  }
  const data = await request<any[]>(`/${route}/`);
  return data.map(normalizeInvoiceRecord);
}

export async function getStageRecord(stage: StageKey, referenceNumber: string) {
  const route = ROUTE_MAP[stage];
  if (stage === "PR") {
    const data = await request<any>(`/${route}/${referenceNumber}`);
    return normalizePrRecord(data);
  }
  if (stage === "PO") {
    const data = await request<any>(`/${route}/${referenceNumber}`);
    return normalizePoRecord(data);
  }
  if (stage === "GRN") {
    const data = await request<any>(`/${route}/${referenceNumber}`);
    return normalizeGrnRecord(data);
  }
  const data = await request<any>(`/${route}/${referenceNumber}`);
  return normalizeInvoiceAggregate(data);
}

export async function listDocuments(stage: StageKey, referenceNumber: string) {
  const route = ROUTE_MAP[stage];
  if (stage === "PR") {
    const data = await request<any>(`/${route}/${referenceNumber}/documents`);
    return {
      pr_number: asString(data?.pr_number ?? data?.purchaseRequisitionNumber ?? referenceNumber),
      documents: Array.isArray(data?.documents) ? data.documents.map(normalizeStageDocument) : [],
      count: toNumber(data?.count),
    };
  }
  if (stage === "PO") {
    const data = await request<any>(`/${route}/${referenceNumber}/documents`);
    return {
      po_number: asString(data?.po_number ?? data?.purchaseOrderNumber ?? referenceNumber),
      document: data?.document ? normalizeStageDocument(data.document) : null,
      count: toNumber(data?.count),
    };
  }
  if (stage === "GRN") {
    const data = await request<any>(`/${route}/${referenceNumber}/documents`);
    return {
      grn_number: asString(data?.grn_number ?? data?.materialDocumentNumber ?? referenceNumber),
      document: data?.document ? normalizeStageDocument(data.document) : null,
      count: toNumber(data?.count),
    };
  }
  const data = await request<any>(`/${route}/${referenceNumber}/documents`);
  return {
    invoice_number: asString(data?.invoice_number ?? referenceNumber),
    document: data?.document ? normalizeStageDocument(data.document) : null,
    count: toNumber(data?.count),
  };
}

export async function uploadDocuments(stage: StageKey, referenceNumber: string, files: File[]) {
  const route = ROUTE_MAP[stage];
  const formData = new FormData();
  files.forEach((file) => {
    formData.append(stage === "PR" ? "files" : "file", file);
  });
  formData.append("uploaded_by", DEFAULT_UPLOADER);

  if (stage === "PR") {
    const data = await request<{
      pr_number: string;
      uploaded: Array<{
        document_id: string;
        original_filename: string;
        stored_filename: string;
        file_size_bytes: number;
        mime_type: string;
        ocr_status: string;
        ocr_rejection_detail?: StageDocument["ocr_rejection_detail"];
        version: number;
        uploaded_by: string;
        uploaded_at: string;
      }>;
      uploaded_count: number;
      errors: Array<{ filename?: string; reason?: string; error?: string }>;
      error_count: number;
    }>(`/${route}/${referenceNumber}/documents/upload`, {
      method: "POST",
      body: formData,
    });
    return {
      pr_number: asString((data as any)?.pr_number ?? (data as any)?.purchaseRequisitionNumber ?? referenceNumber),
      uploaded: Array.isArray(data.uploaded) ? data.uploaded : [],
      uploaded_count: toNumber(data.uploaded_count),
      errors: Array.isArray(data.errors) ? data.errors : [],
      error_count: toNumber(data.error_count),
    };
  }

  const data = await request<any>(`/${route}/${referenceNumber}/documents/upload`, {
    method: "POST",
    body: formData,
  });
  return normalizeStageDocument(data);
}

export async function replaceDocument(stage: StageKey, referenceNumber: string, documentId: string, file: File) {
  const route = ROUTE_MAP[stage];
  const formData = new FormData();
  formData.append("file", file);
  formData.append("uploaded_by", DEFAULT_UPLOADER);

  const data = await request<any>(`/${route}/${referenceNumber}/documents/${documentId}/change`, {
    method: "PUT",
    body: formData,
  });
  return normalizeStageDocument(data);
}

export async function deleteDocument(stage: StageKey, documentId: string) {
  const route = ROUTE_MAP[stage];
  return request<null>(`/${route}/documents/${documentId}`, {
    method: "DELETE",
  });
}

export function getDocumentDownloadUrl(stage: StageKey, documentId: string, inline = false) {
  const route = ROUTE_MAP[stage];
  return buildApiAssetUrl(`/${route}/documents/${documentId}/download${inline ? "?inline=true" : ""}`);
}

export async function sendInvoiceToMiro(invoiceNumber: string) {
  return request<{ miro_redirect_url: string; status: string }>(`/invoice/${invoiceNumber}/miro-redirect`, {
    method: "POST",
  });
}
