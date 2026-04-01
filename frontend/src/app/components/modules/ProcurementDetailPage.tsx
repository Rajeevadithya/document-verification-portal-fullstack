import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
  Download,
  Edit,
  Eye,
  FileUp,
  LoaderCircle,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import {
  deleteDocument,
  getDocumentDownloadUrl,
  getStageFromFrontend,
  getStageRecord,
  listDocuments,
  replaceDocument,
  uploadDocuments,
} from "../../lib/api";
import { formatCurrency, formatDate, formatFileSize } from "../../lib/format";
import type {
  FrontendStageKey,
  GRNRecord,
  PORecord,
  PRRecord,
  StageDocument,
  StageKey,
} from "../../lib/types";

// ─── Types ──────────────────────────────────────────────────────────────────────

type ProcurementRecord = PRRecord | PORecord | GRNRecord;

function isPRRecord(r: ProcurementRecord): r is PRRecord {
  return "pr_number" in r && "document_type" in r;
}
function isPORecord(r: ProcurementRecord): r is PORecord {
  return "po_number" in r && "vendor" in r && "company_code" in r;
}
function isGRNRecord(r: ProcurementRecord): r is GRNRecord {
  return "grn_number" in r && "document_date" in r && "posting_date" in r;
}
function getTotalValue(r: ProcurementRecord) {
  if (isPRRecord(r)) return r.items.reduce((s, i) => s + i.amount, 0);
  if (isPORecord(r)) return r.items.reduce((s, i) => s + i.amount, 0);
  return r.items.reduce((s, i) => s + i.amount, 0);
}

// ─── Styles ──────────────────────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "12px",
  fontWeight: "700",
  color: "#475569",
  borderBottom: "1px solid #e2e8f0",
  borderRight: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
  backgroundColor: "#f8fafc",
  textAlign: "left",
};
const TD: React.CSSProperties = {
  padding: "13px 16px",
  fontSize: "13px",
  color: "#334155",
  borderBottom: "1px solid #f1f5f9",
  borderRight: "1px solid #f1f5f9",
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

// ─── Stage meta ──────────────────────────────────────────────────────────────────

const SAP_BLUE = "#0070F2";

const STAGE_META: Record<Exclude<FrontendStageKey, "INV">, {
  label: string;
  backLabel: string;
  tabs: string[];
  activeTab: string;
  color: string;
}> = {
  PR: {
    label: "Purchase Requisition",
    backLabel: "Purchase Requisitions",
    tabs: ["Items", "Attachment"],
    activeTab: "Items",
    color: SAP_BLUE,
  },
  PO: {
    label: "Purchase Order",
    backLabel: "Purchase Orders",
    tabs: ["Items", "Attachment"],
    activeTab: "Items",
    color: SAP_BLUE,
  },
  GRN: {
    label: "Goods Receipt Note",
    backLabel: "Goods Receipt Notes",
    tabs: ["Items", "Attachment"],
    activeTab: "Items",
    color: SAP_BLUE,
  },
};

// ─── Sub-components ──────────────────────────────────────────────────────────────

function MetaChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "3px",
      padding: "10px 16px",
      backgroundColor: highlight ? "#eff6ff" : "#f8fafc",
      border: `1px solid ${highlight ? "#bfdbfe" : "#e2e8f0"}`,
      borderRadius: "10px",
      minWidth: "130px",
    }}>
      <span style={{ fontSize: "10px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: "600", color: highlight ? "#1d4ed8" : "#0f172a" }}>{value}</span>
    </div>
  );
}

function SectionCard({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "16px",
      overflow: "hidden",
      boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
    }}>
      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid #f1f5f9",
        backgroundColor: "#fafcff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a" }}>{title}</span>
        {badge && <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "500" }}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ text }: { text: string }) {
  const lower = text.toLowerCase();
  const isGreen = lower.includes("open") || lower.includes("follow") || lower.includes("created") || lower.includes("posted");
  return (
    <span style={{
      fontSize: "11px",
      fontWeight: "700",
      color: isGreen ? "#107E3E" : "#6A6D70",
      backgroundColor: isGreen ? "#eef5ec" : "#f5f5f5",
      padding: "3px 10px",
      borderRadius: "6px",
      display: "inline-block",
    }}>
      {text}
    </span>
  );
}

// ─── Items tables ────────────────────────────────────────────────────────────────

function PRItemsTable({ record }: { record: PRRecord }) {
  const cols = ["Item Number", "Material", "Material Description", "Plant", "Quantity", "Price", "Amount", "Purchase Organization"];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "960px" }}>
        <thead>
          <tr>{cols.map((c) => <th key={c} style={TH}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {record.items.map((item, i) => (
            <tr key={item.item_number} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#fafcff" }}>
              <td style={TD}>{item.item_number}</td>
              <td style={{ ...TD, color: "#0070F2", fontWeight: "600" }}>{item.material || "—"}</td>
              <td style={TD}>{item.material_description || "—"}</td>
              <td style={TD}>{item.plant}</td>
              <td style={{ ...TD, textAlign: "right" }}>{item.quantity.toLocaleString()}</td>
              <td style={{ ...TD, textAlign: "right" }}>{formatCurrency(item.price)}</td>
              <td style={{ ...TD, textAlign: "right", fontWeight: "600" }}>{formatCurrency(item.amount)}</td>
              <td style={{ ...TD, borderRight: "none" }}>{item.purchase_organization || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function POItemsTable({ record }: { record: PORecord }) {
  const cols = ["Item Number", "Material", "Material Description", "Quantity", "Price", "Amount", "Plant"];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "900px" }}>
        <thead>
          <tr>{cols.map((c) => <th key={c} style={TH}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {record.items.map((item, i) => (
            <tr key={item.item_number} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#fafcff" }}>
              <td style={TD}>{item.item_number}</td>
              <td style={{ ...TD, color: "#107E3E", fontWeight: "600" }}>{item.material}</td>
              <td style={TD}>{item.material_description || "—"}</td>
              <td style={{ ...TD, textAlign: "right" }}>{item.quantity.toLocaleString()}</td>
              <td style={{ ...TD, textAlign: "right" }}>{formatCurrency(item.price)}</td>
              <td style={{ ...TD, textAlign: "right", fontWeight: "600" }}>{formatCurrency(item.amount)}</td>
              <td style={{ ...TD, borderRight: "none" }}>{item.plant}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GRNItemsTable({ record }: { record: GRNRecord }) {
  const cols = ["Item Number", "Material", "Material Description", "Quantity", "Price", "Amount", "Plant", "Purchase Order"];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "1000px" }}>
        <thead>
          <tr>{cols.map((c) => <th key={c} style={TH}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {record.items.map((item, i) => (
            <tr key={item.item_number} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#fafcff" }}>
              <td style={TD}>{item.item_number}</td>
              <td style={{ ...TD, color: "#E9730C", fontWeight: "600" }}>{item.material}</td>
              <td style={TD}>{item.material_description || "—"}</td>
              <td style={{ ...TD, textAlign: "right" }}>{item.quantity.toLocaleString()}</td>
              <td style={{ ...TD, textAlign: "right" }}>{formatCurrency(item.price)}</td>
              <td style={{ ...TD, textAlign: "right", fontWeight: "600" }}>{formatCurrency(item.amount)}</td>
              <td style={TD}>{item.plant}</td>
              <td style={{ ...TD, color: "#0070F2", borderRight: "none" }}>{item.purchase_order || record.po_number}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemsTable({ record }: { record: ProcurementRecord }) {
  if (isPRRecord(record)) return <PRItemsTable record={record} />;
  if (isPORecord(record)) return <POItemsTable record={record} />;
  if (isGRNRecord(record)) return <GRNItemsTable record={record} />;
  return null;
}

// ─── Documents panel ─────────────────────────────────────────────────────────────

function DocumentsPanel({
  reference,
  stageKey,
  docs,
  docsLoading,
  canModify,
  onReplace,
  onDelete,
}: {
  reference: string;
  stageKey: StageKey;
  docs: StageDocument[];
  docsLoading: boolean;
  canModify: boolean;
  onReplace: (ref: string, docId: string) => void;
  onDelete: (docId: string) => Promise<void>;
}) {
  return (
    <div style={{ borderTop: "1px solid #e0edff" }}>
      <div style={{
        padding: "10px 24px",
        backgroundColor: "#f0f7ff",
        borderBottom: "1px solid #dbeafe",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}>
        <Paperclip size={13} color="#1d4ed8" />
        <span style={{ fontSize: "12px", fontWeight: "700", color: "#1e40af" }}>
          Uploaded Documents ({docsLoading ? "…" : docs.length})
        </span>
      </div>

      {docsLoading ? (
        <div style={{ padding: "20px 24px", fontSize: "13px", color: "#6A6D70", display: "flex", alignItems: "center", gap: "8px" }}>
          <LoaderCircle size={15} className="animate-spin" /> Loading documents…
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "900px" }}>
            <thead>
              <tr>
                {["File Name", "Reference", "Version", "Upload Date", "Uploaded By", "Size", "Actions"].map((c) => (
                  <th key={c} style={TH}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "24px", textAlign: "center", fontSize: "13px", color: "#94a3b8" }}>
                    No documents uploaded for <strong>{reference}</strong>.
                  </td>
                </tr>
              ) : docs.map((doc, i) => (
                <tr key={doc._id} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#fafcff" }}>
                  <td style={{ ...TD, color: "#0070F2", fontWeight: "600", minWidth: "200px" }}>{doc.original_filename}</td>
                  <td style={TD}>{reference}</td>
                  <td style={TD}>v{doc.version}</td>
                  <td style={TD}>{formatDate(doc.uploaded_at)}</td>
                  <td style={TD}>{doc.uploaded_by || "system"}</td>
                  <td style={TD}>{formatFileSize(doc.file_size)}</td>
                  <td style={{ ...TD, borderRight: "none" }}>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <a
                        href={getDocumentDownloadUrl(stageKey, doc._id, true)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", border: "1px solid #0070F2", color: "#0070F2", borderRadius: "7px", fontSize: "11px", fontWeight: "600", textDecoration: "none", backgroundColor: "#ffffff" }}
                      >
                        <Eye size={11} /> View
                      </a>
                      <a
                        href={getDocumentDownloadUrl(stageKey, doc._id)}
                        style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", border: "1px solid #d9d9d9", color: "#32363a", borderRadius: "7px", fontSize: "11px", fontWeight: "600", textDecoration: "none", backgroundColor: "#ffffff" }}
                      >
                        <Download size={11} /> Download
                      </a>
                      {canModify && (
                        <>
                          <button
                            onClick={() => onReplace(reference, doc._id)}
                            style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", border: "1px solid #0070F2", color: "#0070F2", borderRadius: "7px", fontSize: "11px", fontWeight: "600", backgroundColor: "#ffffff", cursor: "pointer" }}
                          >
                            <Edit size={11} /> Replace
                          </button>
                          <button
                            onClick={() => void onDelete(doc._id)}
                            style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", border: "1px solid #BB0000", color: "#BB0000", borderRadius: "7px", fontSize: "11px", fontWeight: "600", backgroundColor: "#ffffff", cursor: "pointer" }}
                          >
                            <Trash2 size={11} /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Upload panel ────────────────────────────────────────────────────────────────

function UploadPanel({
  reference,
  multiUpload,
  uploading,
  onUpload,
}: {
  reference: string;
  multiUpload: boolean;
  uploading: boolean;
  onUpload: (files: File[]) => Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const canUpload = files.length > 0 && !uploading;

  return (
    <div style={{ padding: "20px 24px", backgroundColor: "#fafeff", borderTop: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a", marginBottom: "14px", display: "flex", alignItems: "center", gap: "7px" }}>
        <FileUp size={15} color="#0070F2" />
        Upload Document{multiUpload ? "s" : ""}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "14px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <span style={{ fontSize: "11px", fontWeight: "600", color: "#64748b" }}>Reference</span>
          <div style={{ fontSize: "13px", fontWeight: "700", color: "#0070F2", padding: "8px 14px", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px" }}>
            {reference}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "5px", flex: 1, minWidth: "280px" }}>
          <span style={{ fontSize: "11px", fontWeight: "600", color: "#64748b" }}>
            {multiUpload ? "Files" : "File"} (PDF, PNG, JPG, JPEG, TIFF, BMP)
          </span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 16px",
              border: `1.5px dashed ${files.length > 0 ? "#0070F2" : "#cbd5e1"}`,
              borderRadius: "10px",
              backgroundColor: files.length > 0 ? "#f0f7ff" : "#f8fafc",
              cursor: "pointer",
              fontSize: "13px",
              color: files.length > 0 ? "#1d4ed8" : "#64748b",
              fontWeight: files.length > 0 ? "600" : "400",
              minHeight: "44px",
              textAlign: "left",
            }}
          >
            <Upload size={15} color={files.length > 0 ? "#0070F2" : "#94a3b8"} style={{ flexShrink: 0 }} />
            {files.length > 0 ? files.map((f) => f.name).join(", ") : `Click to choose ${multiUpload ? "one or more files" : "a file"}`}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple={multiUpload}
            accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.bmp"
            style={{ display: "none" }}
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
        </div>
        <button
          type="button"
          disabled={!canUpload}
          onClick={async () => {
            if (!canUpload) return;
            await onUpload(files);
            setFiles([]);
            if (inputRef.current) inputRef.current.value = "";
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "10px 22px",
            height: "44px",
            borderRadius: "10px",
            border: "none",
            backgroundColor: canUpload ? "#0070F2" : "#e2e8f0",
            color: canUpload ? "#ffffff" : "#94a3b8",
            fontSize: "13px",
            fontWeight: "700",
            cursor: canUpload ? "pointer" : "not-allowed",
            flexShrink: 0,
          }}
        >
          {uploading ? <LoaderCircle size={15} className="animate-spin" /> : <FileUp size={15} />}
          Upload
        </button>
      </div>
    </div>
  );
}

// ─── Alert bar ───────────────────────────────────────────────────────────────────

function AlertBar({ error, info }: { error?: string | null; info?: string | null }) {
  if (!error && !info) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {error && (
        <div style={{ padding: "12px 16px", backgroundColor: "#FBEAEA", border: "1px solid #F0B2B2", borderRadius: "10px", fontSize: "13px", color: "#BB0000", fontWeight: "500" }}>
          {error}
        </div>
      )}
      {info && (
        <div style={{ padding: "12px 16px", backgroundColor: "#EEF5EC", border: "1px solid #B7E0C1", borderRadius: "10px", fontSize: "13px", color: "#107E3E", fontWeight: "500" }}>
          {info}
        </div>
      )}
    </div>
  );
}

// ─── Main page component ─────────────────────────────────────────────────────────

export function ProcurementDetailPage() {
  const { ref: refParam } = useParams<{ ref: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Derive the stage from the URL path segment: /documents/pr/..., /documents/po/..., /documents/grn/...
  const pathSegment = location.pathname.split("/").filter(Boolean)[1]?.toUpperCase() as Exclude<FrontendStageKey, "INV"> | undefined;
  const frontendStage: Exclude<FrontendStageKey, "INV"> =
    pathSegment === "PO" ? "PO" : pathSegment === "GRN" ? "GRN" : "PR";
  const docRef = refParam ?? "";
  const subTab = (searchParams.get("action") as "upload" | "change" | "view" | null) ?? "view";
  const stageKey: StageKey = getStageFromFrontend(frontendStage);
  const meta = STAGE_META[frontendStage] ?? STAGE_META.PR;
  const multiUpload = frontendStage === "PR";

  const [record, setRecord] = useState<ProcurementRecord | null>(null);
  const [docs, setDocs] = useState<StageDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [docsLoading, setDocsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState(subTab === "upload" || subTab === "view" || subTab === "change" ? "Attachment" : "Items");

  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<{ referenceNumber: string; documentId: string } | null>(null);

  const loadRecord = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getStageRecord(stageKey, docRef);
      setRecord(result as ProcurementRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load record.");
    } finally {
      setLoading(false);
    }
  };

  const loadDocs = async (force = false) => {
    if (!force && docs.length > 0) return;
    setDocsLoading(true);
    try {
      const res = await listDocuments(stageKey, docRef);
      const list = "documents" in res ? res.documents : res.document ? [res.document] : [];
      setDocs(list as StageDocument[]);
    } catch {
      setDocs([]);
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    if (!docRef) return;
    void loadRecord();
    void loadDocs();
  }, [docRef, stageKey]); // eslint-disable-line

  const handleUpload = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setError(null);
    setInfoMessage(null);
    try {
      await uploadDocuments(stageKey, docRef, files);
      setInfoMessage(`${files.length} document(s) uploaded successfully.`);
      await loadDocs(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleReplace = (ref: string, docId: string) => {
    replaceTargetRef.current = { referenceNumber: ref, documentId: docId };
    replaceInputRef.current?.click();
  };

  const onReplaceFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = replaceTargetRef.current;
    if (!file || !target) return;
    setUploading(true);
    setError(null);
    try {
      await replaceDocument(stageKey, target.referenceNumber, target.documentId, file);
      setInfoMessage("Document replaced successfully.");
      await loadDocs(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Replacement failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
      replaceTargetRef.current = null;
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm("Delete this document?")) return;
    setError(null);
    try {
      await deleteDocument(stageKey, docId);
      setInfoMessage("Document deleted.");
      await loadDocs(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  const goBack = () => navigate(`/documents?tab=${frontendStage}`);

  // ── Breadcrumb ──
  const breadcrumb = `Home › Document Verification › ${meta.label}`;

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Page header */}
        <div style={{ padding: "12px 24px", borderBottom: "1px solid #d9d9d9", backgroundColor: "#ffffff", flexShrink: 0 }}>
          <div style={{ fontSize: "11px", color: "#8a8b8c" }}>{breadcrumb}</div>
          <h1 style={{ fontSize: "16px", fontWeight: "700", color: "#32363a", margin: "2px 0 0" }}>Loading…</h1>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", color: "#6A6D70", fontSize: "14px" }}>
          <LoaderCircle size={20} className="animate-spin" />
          Loading {meta.label.toLowerCase()}…
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ padding: "12px 24px", borderBottom: "1px solid #d9d9d9", backgroundColor: "#ffffff", flexShrink: 0 }}>
          <div style={{ fontSize: "11px", color: "#8a8b8c" }}>{breadcrumb}</div>
          <h1 style={{ fontSize: "16px", fontWeight: "700", color: "#32363a", margin: "2px 0 0" }}>Not Found</h1>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" }}>
          <div style={{ fontSize: "14px", color: "#0f172a", fontWeight: "600" }}>Record not found</div>
          <div style={{ fontSize: "12px", color: "#8a8b8c" }}>Could not find {frontendStage} record: {docRef}</div>
          <button onClick={goBack} style={{ padding: "8px 18px", borderRadius: "8px", border: "none", backgroundColor: "#0070F2", color: "#ffffff", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const totalValue = getTotalValue(record);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Page header bar ─────────────────────────────────────────────────── */}
      <div style={{
        padding: "12px 24px",
        borderBottom: "1px solid #d9d9d9",
        backgroundColor: "#ffffff",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "11px", color: "#8a8b8c" }}>{breadcrumb}</div>
          <h1 style={{ fontSize: "16px", fontWeight: "700", color: "#32363a", margin: "2px 0 0" }}>{meta.label} Detail</h1>
        </div>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", backgroundColor: "#f1f5f9" }}>
        <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: "24px", maxWidth: "1600px" }}>

          {/* ── Hero header card ─────────────────────────────────────── */}
          <div style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "20px",
            overflow: "hidden",
            boxShadow: "0 2px 8px rgba(15,23,42,0.07)",
          }}>
            {/* Top stripe with back + title */}
            <div style={{
              padding: "20px 32px 16px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}>
              <button
                onClick={goBack}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "5px 12px 5px 8px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  backgroundColor: "#f8fafc",
                  color: "#475569",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  width: "fit-content",
                }}
              >
                <ArrowLeft size={14} color="#64748b" />
                Back to {meta.backLabel}
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
                <div style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", letterSpacing: "-0.5px" }}>
                  {docRef}
                </div>
                <StatusBadge text={record.status || "Open"} />
              </div>
            </div>

            {/* Meta chips row */}
            <div style={{ padding: "20px 32px", display: "flex", gap: "12px", flexWrap: "wrap", borderBottom: "1px solid #f1f5f9" }}>
              <MetaChip label="Reference" value={docRef} highlight />
              <MetaChip label="Total Value" value={formatCurrency(totalValue)} />
              <MetaChip label="Items" value={`${record.items.length} item${record.items.length !== 1 ? "s" : ""}`} />
              {isPRRecord(record) && <>
                <MetaChip label="Document Type" value={record.document_type || "—"} />
              </>}
              {isPORecord(record) && <>
                <MetaChip label="Supplier" value={record.vendor || "—"} />
                <MetaChip label="Company Code" value={record.company_code || "—"} />
                <MetaChip label="Purchase Group" value={record.purchase_group || "—"} />
              </>}
              {isGRNRecord(record) && <>
                <MetaChip label="PO Number" value={record.po_number || "—"} />
                <MetaChip label="Document Date" value={formatDate(record.document_date)} />
                <MetaChip label="Posting Date" value={formatDate(record.posting_date)} />
              </>}
            </div>

            {/* Tab strip */}
            <div style={{ padding: "0 32px", display: "flex", alignItems: "center", gap: "0" }}>
              {meta.tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "14px 20px",
                    fontSize: "13px",
                    fontWeight: activeTab === tab ? "700" : "500",
                    color: activeTab === tab ? meta.color : "#64748b",
                    backgroundColor: "transparent",
                    border: "none",
                    borderBottom: activeTab === tab ? `2.5px solid ${meta.color}` : "2.5px solid transparent",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* ── Alert messages ───────────────────────────────────────── */}
          <AlertBar error={error} info={infoMessage} />

          {/* ── Items tab ────────────────────────────────────────────── */}
          {activeTab === "Items" && (
            <SectionCard
              title={`Items (${record.items.length})`}
              badge={`Total: ${formatCurrency(totalValue)}`}
            >
              <ItemsTable record={record} />
            </SectionCard>
          )}

          {/* ── Attachment tab ───────────────────────────────────────── */}
          {activeTab === "Attachment" && (
            <SectionCard title="Attachment">
              {(subTab === "view" || subTab === "change") && (
                <DocumentsPanel
                  reference={docRef}
                  stageKey={stageKey}
                  docs={docs}
                  docsLoading={docsLoading}
                  canModify={subTab === "change"}
                  onReplace={handleReplace}
                  onDelete={handleDelete}
                />
              )}
              {subTab === "upload" && (
                <UploadPanel
                  reference={docRef}
                  multiUpload={multiUpload}
                  uploading={uploading}
                  onUpload={handleUpload}
                />
              )}
            </SectionCard>
          )}

        </div>
      </div>

      <input ref={replaceInputRef} type="file" style={{ display: "none" }} onChange={(e) => void onReplaceFileSelected(e)} />
    </div>
  );
}
