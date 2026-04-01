import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Edit,
  Eye,
  FileUp,
  LoaderCircle,
  Trash2,
  Upload,
  ChevronRight,
  ChevronDown,
  Paperclip,
} from "lucide-react";
import { FilterBar, createEmptyFilterValues, type FilterValues } from "../FilterBar";
import { useNavigate, useSearchParams } from "react-router";
import {
  deleteDocument,
  getDocumentDownloadUrl,
  getStageFromFrontend,
  listDocuments,
  listStageRecords,
  listValueHelp,
  replaceDocument,
  uploadDocuments,
} from "../../lib/api";
import { formatCurrency, formatDate, formatFileSize } from "../../lib/format";
import { ModuleFooterAlerts, SelectionPlaceholder } from "./ModuleExperience";
import type {
  FrontendStageKey,
  GRNRecord,
  PORecord,
  PRRecord,
  StageDocument,
  StageKey,
  ValueHelpItem,
} from "../../lib/types";

// ─── Config ────────────────────────────────────────────────────────────────────

type StageModuleConfig = {
  frontendStage: Exclude<FrontendStageKey, "INV">;
  title: string;
  description: string;
  multiUpload: boolean;
  uploadLabel: string;
  changeLabel: string;
  viewLabel: string;
};

type ProcurementRecord = PRRecord | PORecord | GRNRecord;

function isPRRecord(record: ProcurementRecord): record is PRRecord {
  return "pr_number" in record && "document_type" in record;
}

function isPORecord(record: ProcurementRecord): record is PORecord {
  return "po_number" in record && "vendor" in record && "company_code" in record;
}

function isGRNRecord(record: ProcurementRecord): record is GRNRecord {
  return "grn_number" in record && "document_date" in record && "posting_date" in record;
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: "12px",
  fontWeight: "700",
  color: "#32363a",
  borderBottom: "1px solid #d9d9d9",
  borderRight: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
  backgroundColor: "#f5f5f5",
  textAlign: "left",
  position: "sticky",
  top: 0,
  zIndex: 2,
};

const TD: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: "12px",
  color: "#32363a",
  borderBottom: "1px solid #eee",
  borderRight: "1px solid #f0f0f0",
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

const SUB_TH: React.CSSProperties = {
  padding: "7px 12px",
  fontSize: "11px",
  fontWeight: "700",
  color: "#64748b",
  borderBottom: "1px solid #e2e8f0",
  borderRight: "1px solid #e8edf2",
  whiteSpace: "nowrap",
  backgroundColor: "#f8fafc",
  textAlign: "left",
};

const SUB_TD: React.CSSProperties = {
  padding: "7px 12px",
  fontSize: "11px",
  color: "#334155",
  borderBottom: "1px solid #f1f5f9",
  borderRight: "1px solid #f1f5f9",
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

// ─── Record helpers ─────────────────────────────────────────────────────────────

function getReference(r: ProcurementRecord) {
  if (isGRNRecord(r)) return r.grn_number;
  if (isPORecord(r)) return r.po_number;
  return r.pr_number;
}
function getDocType(r: ProcurementRecord) {
  return isPRRecord(r) ? r.document_type : "Material Document";
}
function getStatus(r: ProcurementRecord) {
  return r.status || "Open";
}
function getPlant(r: ProcurementRecord) {
  return r.items[0]?.plant || "—";
}
function getMaterial(r: ProcurementRecord) {
  return r.items[0]?.material || "—";
}
function getStorageLocation(r: ProcurementRecord) {
  return r.items[0]?.storage_location || "—";
}
function getTotalValue(r: ProcurementRecord) {
  if (isPRRecord(r)) {
    return r.items.reduce((s, i) => s + i.amount, 0);
  }
  if (isPORecord(r)) {
    return r.items.reduce((s, i) => s + i.amount, 0);
  }
  return r.items.reduce((s, i) => s + i.amount, 0);
}
function getYear(r: ProcurementRecord) {
  if (isGRNRecord(r)) return new Date(r.document_date).getFullYear().toString();
  return new Date(r.created_at).getFullYear().toString();
}
function buildFieldOptions(records: ProcurementRecord[], stage: Exclude<FrontendStageKey, "INV">) {
  const opts = (vals: string[]) => Array.from(new Set(vals.filter(Boolean))).sort();
  if (stage === "PR") return { editingStatus: opts(records.map(getStatus)), documentType: opts(records.map(getDocType)) };
  if (stage === "PO") return { editingStatus: opts(records.map(getStatus)), status: opts(records.map(getStatus)) };
  return { stockChange: opts(records.map(getStatus)) };
}

// ─── Filter matching ────────────────────────────────────────────────────────────

function inc(v: string | undefined, s: string) {
  return (v || "").toLowerCase().includes(s.toLowerCase());
}
function matchDate(v: string | undefined, f: string) {
  if (!f) return true;
  return (v || "").slice(0, 10) === f;
}
function matchesFilters(r: ProcurementRecord, f: FilterValues, stage: Exclude<FrontendStageKey, "INV">) {
  const ref = getReference(r);
  const search = f.search.trim().toLowerCase();
  if (search && ![ref, getPlant(r), getMaterial(r), getStorageLocation(r), getStatus(r), getDocType(r)].join(" ").toLowerCase().includes(search)) return false;
  if (stage === "PR") {
    if (f.docNumber && ref !== f.docNumber) return false;
    if (f.editingStatus && getStatus(r) !== f.editingStatus) return false;
    if (f.documentType && getDocType(r) !== f.documentType) return false;
    return true;
  }
  if (stage === "PO") {
    if (!isPORecord(r)) return false;
    const po = r;
    if (f.purchaseOrder && po.po_number !== f.purchaseOrder) return false;
    if (f.editingStatus && getStatus(r) !== f.editingStatus) return false;
    if (f.supplier && !inc(po.vendor, f.supplier)) return false;
    if (f.purchasingGroup && !inc(po.purchase_group, f.purchasingGroup)) return false;
    if (f.companyCode && !inc(po.company_code, f.companyCode)) return false;
    if (f.status && getStatus(r) !== f.status) return false;
    if (f.material && !po.items.some((i) => inc(i.material, f.material))) return false;
    if (f.plant && !inc(getPlant(r), f.plant)) return false;
    if (!matchDate(po.created_at, f.purchaseOrderDate)) return false;
    return true;
  }
  if (!isGRNRecord(r)) return false;
  const grn = r;
  if (f.materialDocument && grn.grn_number !== f.materialDocument) return false;
  if (f.stockChange && getStatus(r) !== f.stockChange) return false;
  if (f.plant && !inc(getPlant(r), f.plant)) return false;
  if (f.storageLocation && !inc(getStorageLocation(r), f.storageLocation)) return false;
  if (f.stockType && !inc(getStatus(r), f.stockType)) return false;
  if (f.materialDocumentYear && getYear(grn) !== f.materialDocumentYear) return false;
  if (f.material && !grn.items.some((i) => inc(i.material, f.material))) return false;
  if (!matchDate(grn.posting_date, f.postingDate)) return false;
  if (!matchDate(grn.document_date, f.documentDate)) return false;
  return true;
}

// ─── Column headers ─────────────────────────────────────────────────────────────

function getHeaders(stage: Exclude<FrontendStageKey, "INV">) {
  if (stage === "PR") return ["Purchase Requisition", "Document Type", "Total Value", "Number of Items", "Status", "Origin", "Currency"];
  if (stage === "PO") {
    return [
      "Purchase Order Number",
      "Purchase Document Type",
      "Purchasing Group",
      "Company Code",
      "Purchase Order Date",
      "Net Order Value",
      "Purchase Organization",
      "Purchase Requisition Number",
    ];
  }
  return ["Material Document", "Year", "Material", "Plant", "Storage Location", "Posting Date"];
}

// ─── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ text }: { text: string }) {
  const lower = text.toLowerCase();
  const isGreen = lower.includes("open") || lower.includes("follow") || lower.includes("created");
  return (
    <span style={{
      fontSize: "11px", fontWeight: "600",
      color: isGreen ? "#107E3E" : "#6A6D70",
      backgroundColor: isGreen ? "#eef5ec" : "#f5f5f5",
      padding: "2px 8px", borderRadius: "4px", display: "inline-block",
    }}>
      {text}
    </span>
  );
}

// ─── Summary row cells ──────────────────────────────────────────────────────────

function SummaryRowCells({ record, stage }: { record: ProcurementRecord; stage: Exclude<FrontendStageKey, "INV"> }) {
  if (stage === "PR") {
    const pr = record as PRRecord;
    return (
      <>
        <td style={{ ...TD, color: "#0070F2", fontWeight: "700", minWidth: "160px" }}>{pr.pr_number}</td>
        <td style={{ ...TD, minWidth: "160px" }}>{pr.document_type}</td>
        <td style={{ ...TD, minWidth: "120px" }}>{formatCurrency(getTotalValue(pr))}</td>
        <td style={{ ...TD, minWidth: "120px" }}>{pr.items.length}</td>
        <td style={{ ...TD, minWidth: "120px" }}><StatusBadge text={pr.status || "OPEN"} /></td>
        <td style={{ ...TD, minWidth: "160px" }}>Realtime (manual)</td>
        <td style={{ ...TD, minWidth: "80px", borderRight: "none" }}>INR</td>
      </>
    );
  }
  if (stage === "PO") {
    const po = record as PORecord;
    return (
      <>
        <td style={{ ...TD, color: "#0070F2", fontWeight: "700", minWidth: "160px" }}>{po.po_number}</td>
        <td style={{ ...TD, minWidth: "180px" }}>{po.document_type}</td>
        <td style={{ ...TD, minWidth: "160px" }}>{po.purchase_group}</td>
        <td style={{ ...TD, minWidth: "160px" }}>{po.company_code}</td>
        <td style={{ ...TD, minWidth: "150px" }}>{po.purchase_order_date ? formatDate(po.purchase_order_date) : ""}</td>
        <td style={{ ...TD, minWidth: "140px" }}>{po.net_order_value == null ? "" : formatCurrency(po.net_order_value)}</td>
        <td style={{ ...TD, minWidth: "170px" }}>{po.purchase_organization}</td>
        <td style={{ ...TD, minWidth: "200px", borderRight: "none" }}>{po.pr_number}</td>
      </>
    );
  }
  const grn = record as GRNRecord;
  return (
    <>
      <td style={{ ...TD, color: "#0070F2", fontWeight: "700", minWidth: "160px" }}>{grn.grn_number}</td>
      <td style={{ ...TD, minWidth: "80px" }}>{getYear(grn)}</td>
      <td style={{ ...TD, minWidth: "200px" }}>{getMaterial(grn)}</td>
      <td style={{ ...TD, minWidth: "160px" }}>{getPlant(grn)}</td>
      <td style={{ ...TD, minWidth: "160px" }}>{getStorageLocation(grn)}</td>
      <td style={{ ...TD, minWidth: "120px", borderRight: "none" }}>{formatDate(grn.posting_date)}</td>
    </>
  );
}

// ─── Items sub-table ────────────────────────────────────────────────────────────

function ItemsSubTable({ record, stage }: { record: ProcurementRecord; stage: Exclude<FrontendStageKey, "INV"> }) {
  if (stage === "PR") {
    const pr = record as PRRecord;
    const cols = ["Item Number", "Material", "Material Description", "Plant", "Quantity", "Price", "Amount", "Purchase Organization"];
    return (
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "960px" }}>
        <thead><tr>{cols.map((c) => <th key={c} style={SUB_TH}>{c}</th>)}</tr></thead>
        <tbody>
          {pr.items.map((item, i) => (
            <tr key={item.item_number} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
              <td style={SUB_TD}>{item.item_number}</td>
              <td style={{ ...SUB_TD, color: "#0070F2" }}>{item.material || "—"}</td>
              <td style={SUB_TD}>{item.material_description || "—"}</td>
              <td style={SUB_TD}>{item.plant}</td>
              <td style={SUB_TD}>{item.quantity}</td>
              <td style={SUB_TD}>{formatCurrency(item.price)}</td>
              <td style={SUB_TD}>{formatCurrency(item.amount)}</td>
              <td style={{ ...SUB_TD, borderRight: "none" }}>{item.purchase_organization || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (stage === "PO") {
    const po = record as PORecord;
    const cols = ["Item Number", "Material", "Material Description", "Quantity", "Price", "Amount", "Plant"];
    return (
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "900px" }}>
        <thead><tr>{cols.map((c) => <th key={c} style={SUB_TH}>{c}</th>)}</tr></thead>
        <tbody>
          {po.items.map((item, i) => (
            <tr key={item.item_number} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
              <td style={SUB_TD}>{item.item_number}</td>
              <td style={{ ...SUB_TD, color: "#0070F2" }}>{item.material}</td>
              <td style={SUB_TD}>{item.material_description || "—"}</td>
              <td style={SUB_TD}>{item.quantity}</td>
              <td style={SUB_TD}>{formatCurrency(item.price)}</td>
              <td style={SUB_TD}>{formatCurrency(item.amount)}</td>
              <td style={{ ...SUB_TD, borderRight: "none" }}>{item.plant}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  const grn = record as GRNRecord;
  const cols = ["Item Number", "Material", "Material Description", "Quantity", "Price", "Amount", "Plant", "Purchase Order"];
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "960px" }}>
      <thead><tr>{cols.map((c) => <th key={c} style={SUB_TH}>{c}</th>)}</tr></thead>
      <tbody>
        {grn.items.map((item, i) => (
          <tr key={item.item_number} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
            <td style={SUB_TD}>{item.item_number}</td>
            <td style={{ ...SUB_TD, color: "#0070F2" }}>{item.material}</td>
            <td style={SUB_TD}>{item.material_description || "—"}</td>
            <td style={SUB_TD}>{item.quantity}</td>
            <td style={SUB_TD}>{formatCurrency(item.price)}</td>
            <td style={SUB_TD}>{formatCurrency(item.amount)}</td>
            <td style={SUB_TD}>{item.plant}</td>
            <td style={{ ...SUB_TD, color: "#0070F2", borderRight: "none" }}>{item.purchase_order || grn.po_number}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Documents panel ────────────────────────────────────────────────────────────

function DocumentsPanel({
  reference, stage, docs, docsLoading, canModify, onReplace, onDelete,
}: {
  reference: string; stage: StageKey; docs: StageDocument[];
  docsLoading: boolean; canModify: boolean;
  onReplace: (ref: string, docId: string) => void;
  onDelete: (docId: string) => Promise<void>;
}) {
  const cols = ["File Name", "Reference", "Version", "Upload Date", "Uploaded By", "Size", "Actions"];
  return (
    <div style={{ borderTop: "1px solid #dbeafe" }}>
      <div style={{ padding: "8px 14px", backgroundColor: "#f0f7ff", borderBottom: "1px solid #dbeafe", display: "flex", alignItems: "center", gap: "6px" }}>
        <Paperclip size={12} color="#1d4ed8" />
        <span style={{ fontSize: "11px", fontWeight: "700", color: "#1e40af" }}>
          Uploaded Documents ({docsLoading ? "…" : docs.length})
        </span>
      </div>
      {docsLoading ? (
        <div style={{ padding: "14px 16px", fontSize: "12px", color: "#6A6D70", display: "flex", alignItems: "center", gap: "6px" }}>
          <LoaderCircle size={14} className="animate-spin" /> Loading documents…
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "860px" }}>
            <thead><tr>{cols.map((c) => <th key={c} style={SUB_TH}>{c}</th>)}</tr></thead>
            <tbody>
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "16px 14px", textAlign: "center", fontSize: "12px", color: "#94a3b8" }}>
                    No documents uploaded for <strong>{reference}</strong>.
                  </td>
                </tr>
              ) : docs.map((doc, i) => (
                <tr key={doc._id} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#fafbfc" }}>
                  <td style={{ ...SUB_TD, color: "#0070F2", minWidth: "200px" }}>{doc.original_filename}</td>
                  <td style={SUB_TD}>{reference}</td>
                  <td style={SUB_TD}>v{doc.version}</td>
                  <td style={SUB_TD}>{formatDate(doc.uploaded_at)}</td>
                  <td style={SUB_TD}>{doc.uploaded_by || "system"}</td>
                  <td style={SUB_TD}>{formatFileSize(doc.file_size)}</td>
                  <td style={{ ...SUB_TD, borderRight: "none" }}>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <a href={getDocumentDownloadUrl(stage, doc._id, true)} target="_blank" rel="noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: "3px", padding: "3px 8px", border: "1px solid #0070F2", color: "#0070F2", borderRadius: "6px", fontSize: "10px", fontWeight: "600", textDecoration: "none", backgroundColor: "#ffffff" }}>
                        <Eye size={10} /> View
                      </a>
                      <a href={getDocumentDownloadUrl(stage, doc._id)}
                        style={{ display: "flex", alignItems: "center", gap: "3px", padding: "3px 8px", border: "1px solid #d9d9d9", color: "#32363a", borderRadius: "6px", fontSize: "10px", fontWeight: "600", textDecoration: "none", backgroundColor: "#ffffff" }}>
                        <Download size={10} /> Download
                      </a>
                      {canModify && (
                        <>
                          <button onClick={() => onReplace(reference, doc._id)}
                            style={{ display: "flex", alignItems: "center", gap: "3px", padding: "3px 8px", border: "1px solid #0070F2", color: "#0070F2", borderRadius: "6px", fontSize: "10px", fontWeight: "600", backgroundColor: "#ffffff", cursor: "pointer" }}>
                            <Edit size={10} /> Replace
                          </button>
                          <button onClick={() => void onDelete(doc._id)}
                            style={{ display: "flex", alignItems: "center", gap: "3px", padding: "3px 8px", border: "1px solid #BB0000", color: "#BB0000", borderRadius: "6px", fontSize: "10px", fontWeight: "600", backgroundColor: "#ffffff", cursor: "pointer" }}>
                            <Trash2 size={10} /> Delete
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

// ─── Upload panel ───────────────────────────────────────────────────────────────

function UploadPanel({
  reference, multiUpload, uploading, onUpload,
}: {
  reference: string; multiUpload: boolean; uploading: boolean;
  onUpload: (files: File[]) => Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const canUpload = files.length > 0 && !uploading;

  return (
    <div style={{ padding: "16px 20px", backgroundColor: "#fafeff", borderTop: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: "12px", fontWeight: "700", color: "#0f172a", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
        <FileUp size={13} color="#0070F2" />
        Upload Document{multiUpload ? "s" : ""}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "10px", fontWeight: "600", color: "#64748b" }}>Reference</span>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "#0070F2", padding: "6px 12px", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px" }}>
            {reference}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1, minWidth: "260px" }}>
          <span style={{ fontSize: "10px", fontWeight: "600", color: "#64748b" }}>
            {multiUpload ? "Files" : "File"} (PDF, PNG, JPG, JPEG, TIFF, BMP)
          </span>
          <button type="button" onClick={() => inputRef.current?.click()}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", border: `1.5px dashed ${files.length > 0 ? "#0070F2" : "#cbd5e1"}`, borderRadius: "8px", backgroundColor: files.length > 0 ? "#f0f7ff" : "#f8fafc", cursor: "pointer", fontSize: "12px", color: files.length > 0 ? "#1d4ed8" : "#64748b", fontWeight: files.length > 0 ? "600" : "400", minHeight: "40px", textAlign: "left" }}>
            <Upload size={14} color={files.length > 0 ? "#0070F2" : "#94a3b8"} style={{ flexShrink: 0 }} />
            {files.length > 0 ? files.map((f) => f.name).join(", ") : `Click to choose ${multiUpload ? "one or more files" : "a file"}`}
          </button>
          <input ref={inputRef} type="file" multiple={multiUpload} accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.bmp" style={{ display: "none" }}
            onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        </div>
        <button type="button" disabled={!canUpload}
          onClick={async () => { if (!canUpload) return; await onUpload(files); setFiles([]); if (inputRef.current) inputRef.current.value = ""; }}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 18px", height: "40px", borderRadius: "8px", border: "none", backgroundColor: canUpload ? "#0070F2" : "#e2e8f0", color: canUpload ? "#ffffff" : "#94a3b8", fontSize: "12px", fontWeight: "700", cursor: canUpload ? "pointer" : "not-allowed", flexShrink: 0 }}>
          {uploading ? <LoaderCircle size={14} className="animate-spin" /> : <FileUp size={14} />}
          Upload
        </button>
      </div>
    </div>
  );
}

// ─── Full expanded content ──────────────────────────────────────────────────────

function ExpandedRowContent({
  record, stage, stageKey, docs, docsLoading, subTab, multiUpload, uploading, onUpload, onReplace, onDelete,
}: {
  record: ProcurementRecord; stage: Exclude<FrontendStageKey, "INV">; stageKey: StageKey;
  docs: StageDocument[]; docsLoading: boolean; subTab: "upload" | "change" | "view";
  multiUpload: boolean; uploading: boolean;
  onUpload: (ref: string, files: File[]) => Promise<void>;
  onReplace: (ref: string, docId: string) => void;
  onDelete: (docId: string) => Promise<void>;
}) {
  const reference = getReference(record);

  return (
    <div style={{ backgroundColor: "#f8fbff", borderTop: "2px solid #bfdbfe" }}>
      {/* Items header */}
      <div style={{ padding: "8px 14px", backgroundColor: "#eff6ff", borderBottom: "1px solid #dbeafe", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "11px", fontWeight: "700", color: "#1e40af" }}>Items ({record.items.length})</span>
        <span style={{ fontSize: "10px", color: "#64748b" }}>{getReference(record)}</span>
      </div>

      {/* Items table */}
      <div style={{ overflowX: "auto" }}>
        <ItemsSubTable record={record} stage={stage} />
      </div>

      {/* Documents panel (view & change) */}
      {(subTab === "view" || subTab === "change") && (
        <DocumentsPanel
          reference={reference} stage={stageKey} docs={docs} docsLoading={docsLoading}
          canModify={subTab === "change"} onReplace={onReplace} onDelete={onDelete}
        />
      )}

      {/* Upload panel (upload tab) */}
      {subTab === "upload" && (
        <UploadPanel
          reference={reference} multiUpload={multiUpload} uploading={uploading}
          onUpload={(files) => onUpload(reference, files)}
        />
      )}
    </div>
  );
}

// ─── Records table ──────────────────────────────────────────────────────────────

function RecordsTable({
  stage, stageKey, records, config, expandedReferences, selectedReference,
  documentsByReference, loadingReferences, subTab, uploading,
  onRowClick, onUpload, onReplace, onDelete,
}: {
  stage: Exclude<FrontendStageKey, "INV">; stageKey: StageKey;
  records: ProcurementRecord[]; config: StageModuleConfig;
  expandedReferences: string[]; selectedReference: string;
  documentsByReference: Record<string, StageDocument[]>; loadingReferences: Set<string>;
  subTab: "upload" | "change" | "view"; uploading: boolean;
  onRowClick: (ref: string) => void;
  onUpload: (ref: string, files: File[]) => Promise<void>;
  onReplace: (ref: string, docId: string) => void;
  onDelete: (docId: string) => Promise<void>;
}) {
  const headers = getHeaders(stage);

  return (
    <div style={{ border: "1px solid #d9d9d9", borderRadius: "12px", overflow: "hidden", backgroundColor: "#ffffff" }}>
      {/* Header bar */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", backgroundColor: "#ffffff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a" }}>
          {config.title}s ({records.length})
        </span>
        <span style={{ fontSize: "11px", color: "#94a3b8" }}>Click a row to open its detail page</span>
      </div>

      {/* Scrollable table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: stage === "PR" ? "900px" : stage === "PO" ? "1500px" : "750px" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #d9d9d9" }}>
              {headers.map((h) => <th key={h} style={TH}>{h}</th>)}
              <th style={{ ...TH, width: "44px", textAlign: "center", borderRight: "none" }} />
            </tr>
          </thead>

          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={headers.length + 1} style={{ padding: "28px 16px", textAlign: "center", fontSize: "12px", color: "#94a3b8" }}>
                  No records match the selected filters.
                </td>
              </tr>
            ) : records.map((record, idx) => {
              const ref = getReference(record);
              const expanded = expandedReferences.includes(ref);
              const isSelected = selectedReference === ref;
              const docs = documentsByReference[ref] ?? [];
              const docsLoading = loadingReferences.has(ref);
              const rowBg = isSelected ? "#EAF1FF" : idx % 2 === 0 ? "#ffffff" : "#fafafa";

              return (
                <Fragment key={ref}>
                  <tr
                    onClick={() => onRowClick(ref)}
                    style={{ cursor: "pointer", borderBottom: expanded ? "none" : "1px solid #eeeeee", backgroundColor: rowBg }}
                    onMouseEnter={(e) => { if (!isSelected && !expanded) (e.currentTarget as HTMLElement).style.backgroundColor = "#f0f7ff"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = rowBg; }}
                  >
                    <SummaryRowCells record={record} stage={stage} />
                    <td style={{ ...TD, width: "44px", textAlign: "center", borderRight: "none" }}>
                      {expanded ? <ChevronDown size={16} color="#0070F2" /> : <ChevronRight size={16} color="#94a3b8" />}
                    </td>
                  </tr>

                  {expanded && (
                    <tr style={{ borderBottom: "2px solid #bfdbfe" }}>
                      <td colSpan={headers.length + 1} style={{ padding: 0 }}>
                        <ExpandedRowContent
                          record={record} stage={stage} stageKey={stageKey}
                          docs={docs} docsLoading={docsLoading} subTab={subTab}
                          multiUpload={config.multiUpload} uploading={uploading}
                          onUpload={onUpload} onReplace={onReplace} onDelete={onDelete}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main export ────────────────────────────────────────────────────────────────

export function ProcurementStageModule({ config }: { config: StageModuleConfig }) {
  const stage = getStageFromFrontend(config.frontendStage);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialDocNumber = searchParams.get("doc") ?? "";
  const initialAction = (searchParams.get("action") as "upload" | "change" | "view" | null) ?? "upload";

  const [filters, setFilters] = useState<FilterValues>(createEmptyFilterValues({ docNumber: initialDocNumber }));
  const [hasSearched, setHasSearched] = useState(Boolean(initialDocNumber));
  const [subTab, setSubTab] = useState<"upload" | "change" | "view">(initialAction);

  const [valueHelpItems, setValueHelpItems] = useState<ValueHelpItem[]>([]);
  const [records, setRecords] = useState<ProcurementRecord[]>([]);
  const [documentsByReference, setDocumentsByReference] = useState<Record<string, StageDocument[]>>({});
  const [loadingReferences, setLoadingReferences] = useState<Set<string>>(new Set());
  const [expandedReferences, setExpandedReferences] = useState<string[]>([]);
  const [selectedReference, setSelectedReference] = useState("");

  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [lastValidation, setLastValidation] = useState<{ ocr_status: string; ocr_rejection_detail?: StageDocument["ocr_rejection_detail"] } | null>(null);

  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<{ referenceNumber: string; documentId: string } | null>(null);

  // ── Load summaries on mount ────────────────────────────────────────────────
  const loadSummaries = async () => {
    setLoading(true);
    setError(null);
    try {
      const [helpers, summaries] = await Promise.all([listValueHelp(config.frontendStage), listStageRecords(stage)]);
      setValueHelpItems(helpers);
      setRecords(summaries as ProcurementRecord[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadSummaries(); }, [config.frontendStage]); // eslint-disable-line

  // ── Sync URL params ────────────────────────────────────────────────────────
  useEffect(() => {
    const nextDoc = searchParams.get("doc") ?? "";
    const nextAction = (searchParams.get("action") as "upload" | "change" | "view" | null) ?? "upload";
    setFilters(createEmptyFilterValues({ docNumber: nextDoc }));
    setSubTab(nextAction);
    setHasSearched(Boolean(nextDoc));
    setExpandedReferences([]);
    setSelectedReference("");

    if (nextDoc) {
      navigate(`/documents/${config.frontendStage.toLowerCase()}/${encodeURIComponent(nextDoc)}?action=${nextAction}`, { replace: true });
    }
  }, [config.frontendStage, navigate, searchParams]);

  // ── Fetch docs on demand ───────────────────────────────────────────────────
  const fetchDocs = async (ref: string, force = false) => {
    if (!force && documentsByReference[ref] !== undefined) return;
    setLoadingReferences((prev) => new Set(prev).add(ref));
    try {
      const res = await listDocuments(stage, ref);
      const docs = "documents" in res ? res.documents : res.document ? [res.document] : [];
      setDocumentsByReference((prev) => ({ ...prev, [ref]: docs }));
    } catch {
      setDocumentsByReference((prev) => ({ ...prev, [ref]: [] }));
    } finally {
      setLoadingReferences((prev) => { const n = new Set(prev); n.delete(ref); return n; });
    }
  };

  // ── Row click → navigate to standalone detail page ─────────────────────────
  const handleRowClick = (ref: string) => {
    navigate(`/documents/${config.frontendStage.toLowerCase()}/${encodeURIComponent(ref)}?action=${subTab}`);
  };

  // ── Filters ────────────────────────────────────────────────────────────────
  const filteredRecords = useMemo(() => {
    if (!hasSearched) return [];
    return records.filter((r) => matchesFilters(r, filters, config.frontendStage));
  }, [config.frontendStage, filters, hasSearched, records]);

  const fieldOptions = useMemo(() => buildFieldOptions(records, config.frontendStage), [config.frontendStage, records]);

  const applyFilters = (next: FilterValues) => {
    setFilters(next);
    setHasSearched(true);
    setExpandedReferences([]);
    setSelectedReference("");
  };

  // ── Upload (inline expanded rows still work) ───────────────────────────────
  const handleUpload = async (ref: string, files: File[]) => {
    if (!ref || !files.length) return;
    setUploading(true);
    setError(null);
    setInfoMessage(null);
    try {
      const result = await uploadDocuments(stage, ref, files);
      if (stage === "PR") {
        const typed = result as Awaited<ReturnType<typeof uploadDocuments>> & { uploaded?: Array<{ ocr_status: string; ocr_rejection_detail?: StageDocument["ocr_rejection_detail"] }>; uploaded_count?: number };
        setLastValidation(typed.uploaded?.[0] ? { ocr_status: typed.uploaded[0].ocr_status, ocr_rejection_detail: typed.uploaded[0].ocr_rejection_detail } : null);
        setInfoMessage(`${typed.uploaded_count ?? 0} document(s) uploaded successfully.`);
      } else {
        const typed = result as StageDocument;
        setLastValidation({ ocr_status: typed.ocr_status, ocr_rejection_detail: typed.ocr_rejection_detail });
        setInfoMessage(`${config.title} document uploaded successfully.`);
      }
      await fetchDocs(ref, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  // ── Replace ────────────────────────────────────────────────────────────────
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
      const updated = await replaceDocument(stage, target.referenceNumber, target.documentId, file);
      setLastValidation({ ocr_status: updated.ocr_status, ocr_rejection_detail: updated.ocr_rejection_detail });
      setInfoMessage("Document replaced successfully.");
      await fetchDocs(target.referenceNumber, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Replacement failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
      replaceTargetRef.current = null;
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (docId: string) => {
    if (!window.confirm("Delete this document?")) return;
    setError(null);
    try {
      await deleteDocument(stage, docId);
      setInfoMessage("Document deleted.");
      await Promise.all(expandedReferences.map((ref) => fetchDocs(ref, true)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: "8px", color: "#6A6D70", fontSize: "13px" }}>
        <LoaderCircle className="animate-spin" size={18} />
        Loading {config.title.toLowerCase()} data…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <FilterBar
        docType={config.frontendStage}
        onSearch={applyFilters}
        valueHelpItems={valueHelpItems}
        values={filters}
        fieldOptions={fieldOptions}
      />

      {/* Scrollable content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {!hasSearched ? (
            <SelectionPlaceholder
              title={`Use Go to load ${config.title.toLowerCase()} records`}
              description="Leave all fields blank and press Go to display every record, or enter filters to narrow results."
            />
          ) : (
            <RecordsTable
              stage={config.frontendStage}
              stageKey={stage}
              records={filteredRecords}
              config={config}
              expandedReferences={expandedReferences}
              selectedReference={selectedReference}
              documentsByReference={documentsByReference}
              loadingReferences={loadingReferences}
              subTab={subTab}
              uploading={uploading}
              onRowClick={handleRowClick}
              onUpload={handleUpload}
              onReplace={handleReplace}
              onDelete={handleDelete}
            />
          )}
        </div>
      </div>

      <input ref={replaceInputRef} type="file" style={{ display: "none" }} onChange={(e) => void onReplaceFileSelected(e)} />

      <ModuleFooterAlerts
        error={error}
        infoMessage={infoMessage}
        validation={lastValidation}
        idleMessage={`Use Go to load ${config.frontendStage} records, then click any row to open its detail page.`}
      />
    </div>
  );
}
