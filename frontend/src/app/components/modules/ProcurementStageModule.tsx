import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Edit, Eye, FileUp, LoaderCircle, Trash2, Upload } from "lucide-react";
import { FilterBar, type FilterValues } from "../FilterBar";
import { useSearchParams } from "react-router";
import {
  deleteDocument,
  getDocumentDownloadUrl,
  getStageFromFrontend,
  getStageRecord,
  listDocuments,
  listStageRecords,
  listValueHelp,
  replaceDocument,
  uploadDocuments,
} from "../../lib/api";
import { formatCurrency, formatDate, formatFileSize, statusTone } from "../../lib/format";
import { ModuleFooterAlerts, SelectionPlaceholder, SubTabPanel } from "./ModuleExperience";
import type {
  FrontendStageKey,
  GRNRecord,
  PORecord,
  PRRecord,
  StageDocument,
  StageKey,
  ValueHelpItem,
} from "../../lib/types";

type FlattenedRow = {
  key: string;
  referenceNumber: string;
  itemNumber: string;
  docType: string;
  material: string;
  unit: string;
  quantity: number;
  amount: number;
  date: string;
  postingDate?: string;
  plant: string;
  storageLocation: string;
  purchaseGroup?: string;
  vendor?: string;
  linkedReference?: string;
  companyCode?: string;
};

type StageModuleConfig = {
  frontendStage: Exclude<FrontendStageKey, "INV">;
  title: string;
  description: string;
  multiUpload: boolean;
  uploadLabel: string;
  changeLabel: string;
  viewLabel: string;
};

const TABLE_HEADERS = {
  PR: ["Document Type", "Item Number", "Material", "Unit", "Quantity", "Valuation Price", "Delivery Date", "Plant", "Storage Location", "Purchase Group"],
  PO: ["Document Type", "Item Number", "Material", "Quantity", "Net Price", "Delivery Date", "Plant", "Storage Location", "Vendor", "Linked PR", "Company Code"],
  GRN: ["GRN Number", "PO Number", "Item", "Material", "Unit", "Quantity", "Price", "Document Date", "Posting Date", "Plant", "Storage Location"],
} as const;

function flattenPR(record: PRRecord): FlattenedRow[] {
  return record.items.map((item) => ({
    key: `${record.pr_number}-${item.item_number}`,
    referenceNumber: record.pr_number,
    itemNumber: item.item_number,
    docType: record.document_type,
    material: item.material,
    unit: item.unit_of_measure,
    quantity: item.quantity,
    amount: item.valuation_price,
    date: item.delivery_date,
    plant: item.plant,
    storageLocation: item.storage_location,
    purchaseGroup: item.purchase_group,
  }));
}

function flattenPO(record: PORecord): FlattenedRow[] {
  return record.items.map((item) => ({
    key: `${record.po_number}-${item.item_number}`,
    referenceNumber: record.po_number,
    itemNumber: item.item_number,
    docType: record.document_type,
    material: item.material,
    unit: "—",
    quantity: item.quantity,
    amount: item.net_price,
    date: item.delivery_date,
    plant: item.plant,
    storageLocation: item.storage_location,
    vendor: record.vendor,
    linkedReference: record.pr_number,
    companyCode: record.company_code,
  }));
}

function flattenGRN(record: GRNRecord): FlattenedRow[] {
  return record.items.map((item) => ({
    key: `${record.grn_number}-${item.item}`,
    referenceNumber: record.grn_number,
    itemNumber: item.item,
    docType: record.grn_number,
    material: item.material,
    unit: item.unit_of_measure,
    quantity: item.quantity,
    amount: item.price,
    date: record.document_date,
    postingDate: record.posting_date,
    plant: item.plant,
    storageLocation: item.storage_location,
    linkedReference: record.po_number,
  }));
}

function getReference(record: PRRecord | PORecord | GRNRecord) {
  if ("grn_number" in record) return record.grn_number;
  if ("po_number" in record) return record.po_number;
  return record.pr_number;
}

function flattenRecord(record: PRRecord | PORecord | GRNRecord, stage: Exclude<FrontendStageKey, "INV">) {
  if (stage === "PR") return flattenPR(record as PRRecord);
  if (stage === "PO") return flattenPO(record as PORecord);
  return flattenGRN(record as GRNRecord);
}

function renderRow(row: FlattenedRow, stage: Exclude<FrontendStageKey, "INV">) {
  const cellStyle = { padding: "5px 10px", fontSize: "12px", color: "#32363a", borderRight: "1px solid #e5e5e5", whiteSpace: "nowrap" as const };
  if (stage === "PR") {
    return (
      <>
        <td style={cellStyle}>{row.docType}</td>
        <td style={{ ...cellStyle, color: "#0070F2" }}>{row.itemNumber}</td>
        <td style={cellStyle}>{row.material}</td>
        <td style={cellStyle}>{row.unit}</td>
        <td style={cellStyle}>{row.quantity}</td>
        <td style={cellStyle}>{formatCurrency(row.amount)}</td>
        <td style={cellStyle}>{formatDate(row.date)}</td>
        <td style={cellStyle}>{row.plant}</td>
        <td style={cellStyle}>{row.storageLocation}</td>
        <td style={cellStyle}>{row.purchaseGroup || "—"}</td>
      </>
    );
  }
  if (stage === "PO") {
    return (
      <>
        <td style={cellStyle}>{row.docType}</td>
        <td style={{ ...cellStyle, color: "#0070F2" }}>{row.itemNumber}</td>
        <td style={cellStyle}>{row.material}</td>
        <td style={cellStyle}>{row.quantity}</td>
        <td style={cellStyle}>{formatCurrency(row.amount)}</td>
        <td style={cellStyle}>{formatDate(row.date)}</td>
        <td style={cellStyle}>{row.plant}</td>
        <td style={cellStyle}>{row.storageLocation}</td>
        <td style={cellStyle}>{row.vendor || "—"}</td>
        <td style={cellStyle}>{row.linkedReference || "—"}</td>
        <td style={cellStyle}>{row.companyCode || "—"}</td>
      </>
    );
  }
  return (
    <>
      <td style={{ ...cellStyle, color: "#0070F2" }}>{row.referenceNumber}</td>
      <td style={{ ...cellStyle, color: "#0070F2" }}>{row.linkedReference || "—"}</td>
      <td style={cellStyle}>{row.itemNumber}</td>
      <td style={cellStyle}>{row.material}</td>
      <td style={cellStyle}>{row.unit}</td>
      <td style={cellStyle}>{row.quantity}</td>
      <td style={cellStyle}>{formatCurrency(row.amount)}</td>
      <td style={cellStyle}>{formatDate(row.date)}</td>
      <td style={cellStyle}>{formatDate(row.postingDate)}</td>
      <td style={cellStyle}>{row.plant}</td>
      <td style={cellStyle}>{row.storageLocation}</td>
    </>
  );
}

export function ProcurementStageModule({ config }: { config: StageModuleConfig }) {
  const stage = getStageFromFrontend(config.frontendStage);
  const [searchParams] = useSearchParams();
  const initialDocNumber = searchParams.get("doc") ?? "";
  const initialAction = searchParams.get("action") as "upload" | "change" | "view" | null;
  const [subTab, setSubTab] = useState<"upload" | "change" | "view">(initialAction ?? "upload");
  const [filters, setFilters] = useState<FilterValues>({ docNumber: initialDocNumber, plant: "" });
  const [valueHelpItems, setValueHelpItems] = useState<ValueHelpItem[]>([]);
  const [records, setRecords] = useState<Array<PRRecord | PORecord | GRNRecord>>([]);
  const [documentsByReference, setDocumentsByReference] = useState<Record<string, StageDocument[]>>({});
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadDocNumber, setUploadDocNumber] = useState(initialDocNumber);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [lastValidation, setLastValidation] = useState<{ ocr_status: string; ocr_rejection_detail?: StageDocument["ocr_rejection_detail"] } | null>(null);
  const [subTabTransitioning, setSubTabTransitioning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<{ referenceNumber: string; documentId: string } | null>(null);
  const initialRenderRef = useRef(true);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [helpers, recordSummaries] = await Promise.all([listValueHelp(config.frontendStage), listStageRecords(stage)]);
      const typedSummaries = recordSummaries as Array<PRRecord | PORecord | GRNRecord>;
      const details = (await Promise.all(typedSummaries.map((summary) => getDetail(stage, summary)))).filter(Boolean) as Array<PRRecord | PORecord | GRNRecord>;
      const docEntries = await Promise.all(
        details.map(async (detail) => {
          const reference = getReference(detail);
          if (!reference) return [reference, []] as const;
          const response = await listDocuments(stage, reference);
          const documents = "documents" in response ? response.documents : response.document ? [response.document] : [];
          return [reference, documents] as const;
        }),
      );

      setValueHelpItems(helpers);
      setRecords(details);
      setDocumentsByReference(Object.fromEntries(docEntries));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.frontendStage]);

  useEffect(() => {
    const nextDocNumber = searchParams.get("doc") ?? "";
    const nextAction = searchParams.get("action") as "upload" | "change" | "view" | null;
    setFilters((current) => ({ ...current, docNumber: nextDocNumber }));
    setUploadDocNumber(nextDocNumber);
    if (nextAction) setSubTab(nextAction);
  }, [searchParams]);

  const plants = useMemo(() => {
    const values = new Set(
      records
        .flatMap((record) => flattenRecord(record, config.frontendStage).map((row) => row.plant))
        .filter((value): value is string => Boolean(value)),
    );
    return Array.from(values).sort();
  }, [config.frontendStage, records]);

  const tableRows = useMemo(
    () => records.flatMap((record) => flattenRecord(record, config.frontendStage)).filter((row) => {
      if (!filters.docNumber) return false;
      if (filters.docNumber && row.referenceNumber !== filters.docNumber) return false;
      if (filters.plant && row.plant !== filters.plant) return false;
      return true;
    }),
    [config.frontendStage, filters.docNumber, filters.plant, records],
  );

  const filteredDocuments = useMemo(() => {
    if (!filters.docNumber) return [];
    return Object.entries(documentsByReference)
      .filter(([reference]) => reference === filters.docNumber)
      .flatMap(([reference, docs]) => docs.map((document) => ({ ...document, referenceNumber: reference })))
      .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
  }, [documentsByReference, filters.docNumber]);

  const activeDocNumber = uploadDocNumber || filters.docNumber;
  const hasSelectedReference = Boolean(filters.docNumber || activeDocNumber);

  useEffect(() => {
    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      return;
    }

    setSubTabTransitioning(true);
    const timeout = window.setTimeout(() => setSubTabTransitioning(false), 220);
    return () => window.clearTimeout(timeout);
  }, [subTab]);

  const changeSubTab = (nextTab: "upload" | "change" | "view") => {
    setSubTab(nextTab);
  };

  const applyFilters = (next: FilterValues) => {
    setFilters(next);
    setUploadDocNumber(next.docNumber || "");
    setSelectedRows([]);
  };

  const handleUpload = async () => {
    if (!activeDocNumber || selectedFiles.length === 0) return;
    setUploading(true);
    setError(null);
    setInfoMessage(null);
    try {
      const result = await uploadDocuments(stage, activeDocNumber, selectedFiles);
      if (stage === "PR") {
        const typed = result as Awaited<ReturnType<typeof uploadDocuments>> & { uploaded?: Array<{ ocr_status: string; ocr_rejection_detail?: StageDocument["ocr_rejection_detail"] }> ; uploaded_count?: number };
        const firstUploaded = typed.uploaded?.[0];
        setLastValidation(firstUploaded ? { ocr_status: firstUploaded.ocr_status, ocr_rejection_detail: firstUploaded.ocr_rejection_detail } : null);
        setInfoMessage(`${typed.uploaded_count ?? 0} document(s) uploaded successfully.`);
      } else {
        const typed = result as StageDocument;
        setLastValidation({ ocr_status: typed.ocr_status, ocr_rejection_detail: typed.ocr_rejection_detail });
        setInfoMessage(`${config.title} document uploaded successfully.`);
      }
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSubTab("view");
      await loadData();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleReplace = (referenceNumber: string, documentId: string) => {
    replaceTargetRef.current = { referenceNumber, documentId };
    replaceInputRef.current?.click();
  };

  const onReplaceFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const target = replaceTargetRef.current;
    if (!file || !target) return;
    setUploading(true);
    setError(null);
    try {
      const updated = await replaceDocument(stage, target.referenceNumber, target.documentId, file);
      setLastValidation({ ocr_status: updated.ocr_status, ocr_rejection_detail: updated.ocr_rejection_detail });
      setInfoMessage("Document replaced successfully.");
      await loadData();
    } catch (replaceError) {
      setError(replaceError instanceof Error ? replaceError.message : "Replacement failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
      replaceTargetRef.current = null;
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!window.confirm("Delete this document?")) return;
    setError(null);
    try {
      await deleteDocument(stage, documentId);
      setInfoMessage("Document deleted successfully.");
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2" style={{ color: "#6A6D70" }}>
        <LoaderCircle className="animate-spin" size={18} /> Loading {config.title.toLowerCase()} data...
      </div>
    );
  }

  const headers = TABLE_HEADERS[config.frontendStage];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex border-b flex-shrink-0" style={{ backgroundColor: "#f0f0f0", borderColor: "#d9d9d9" }}>
        {[
          { id: "upload", label: config.uploadLabel },
          { id: "change", label: config.changeLabel },
          { id: "view", label: config.viewLabel },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => changeSubTab(tab.id as "upload" | "change" | "view")}
            className="px-4 py-2"
            style={{
              fontSize: "12px",
              fontWeight: subTab === tab.id ? "600" : "400",
              color: subTab === tab.id ? "#0070F2" : "#32363a",
              backgroundColor: subTab === tab.id ? "#ffffff" : "transparent",
              borderBottom: subTab === tab.id ? "2px solid #0070F2" : "2px solid transparent",
              borderRight: "1px solid #d9d9d9",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <FilterBar docType={config.frontendStage} onSearch={applyFilters} valueHelpItems={valueHelpItems} plants={plants} values={filters} />

      <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
        {!filters.docNumber ? (
          <SelectionPlaceholder
            title={`Select a ${config.frontendStage} number to view items`}
            description={`The ${config.description.toLowerCase()} table stays hidden until you choose a reference number from the filter bar or the upload form.`}
          />
        ) : (
          <div className="border" style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9", borderRadius: "2px" }}>
            <div className="px-4 py-2 border-b flex items-center justify-between" style={{ backgroundColor: "#f5f5f5", borderColor: "#d9d9d9" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: "#32363a" }}>{config.description} ({tableRows.length})</span>
              <span style={{ fontSize: "11px", color: "#8a8b8c" }}>{records.length} reference record(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f5f5f5", borderBottom: "1px solid #d9d9d9" }}>
                    {headers.map((header) => (
                      <th key={header} className="text-left" style={{ padding: "6px 10px", fontSize: "11px", fontWeight: "600", color: "#32363a", borderRight: "1px solid #e5e5e5", whiteSpace: "nowrap" }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length === 0 ? (
                    <tr><td colSpan={headers.length} style={{ padding: "20px", textAlign: "center", fontSize: "12px", color: "#8a8b8c" }}>No records match the selected number and plant.</td></tr>
                  ) : tableRows.map((row, index) => (
                    <tr key={row.key} style={{ borderBottom: "1px solid #eeeeee", backgroundColor: selectedRows.includes(row.key) ? "#EAF1FF" : index % 2 === 0 ? "#ffffff" : "#fafafa" }} onClick={() => setSelectedRows((current) => current.includes(row.key) ? current.filter((item) => item !== row.key) : [...current, row.key])}>
                      {renderRow(row, config.frontendStage)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <SubTabPanel transitioning={subTabTransitioning}>
          {subTab === "upload" && (
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 border" style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9", borderRadius: "2px", minWidth: "320px" }}>
                <div className="px-4 py-2 border-b" style={{ backgroundColor: "#f5f5f5", borderColor: "#d9d9d9" }}>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "#32363a" }}>{config.uploadLabel}</span>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label style={{ fontSize: "11px", fontWeight: "500", color: "#32363a" }}>Reference Number</label>
                    <select
                      value={activeDocNumber}
                      onChange={(event) => {
                        const nextDocNumber = event.target.value;
                        setUploadDocNumber(nextDocNumber);
                        setFilters((current) => ({ ...current, docNumber: nextDocNumber }));
                        setSelectedRows([]);
                      }}
                      className="border px-2 py-1 outline-none"
                      style={{ fontSize: "12px", borderColor: "#d9d9d9", borderRadius: "2px", backgroundColor: "#ffffff", height: "30px", color: "#32363a" }}
                    >
                      <option value="">Select</option>
                      {valueHelpItems.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
                    </select>
                  </div>
                  <button onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed flex flex-col items-center justify-center cursor-pointer px-4 py-6" style={{ borderColor: "#B0B0B0", backgroundColor: "#FAFAFA", borderRadius: "2px" }}>
                    <Upload size={20} color="#6A6D70" />
                    <div style={{ fontSize: "12px", color: "#32363a", marginTop: "8px" }}>{selectedFiles.length > 0 ? selectedFiles.map((file) => file.name).join(", ") : `Choose ${config.multiUpload ? "one or more files" : "a file"}`}</div>
                    <div style={{ fontSize: "11px", color: "#8a8b8c", marginTop: "4px" }}>Supported: PDF, PNG, JPG, JPEG, TIFF, BMP</div>
                  </button>
                  <input ref={fileInputRef} type="file" multiple={config.multiUpload} className="hidden" onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))} />
                  <button onClick={() => void handleUpload()} disabled={!activeDocNumber || selectedFiles.length === 0 || uploading} className="px-4 py-2 border w-fit flex items-center gap-2" style={{ fontSize: "12px", backgroundColor: !activeDocNumber || selectedFiles.length === 0 || uploading ? "#d9d9d9" : "#0070F2", color: "#ffffff", borderColor: !activeDocNumber || selectedFiles.length === 0 || uploading ? "#d9d9d9" : "#0070F2", borderRadius: "2px" }}>
                    {uploading ? <LoaderCircle size={14} className="animate-spin" /> : <FileUp size={14} />}
                    Upload Document
                  </button>
                </div>
              </div>
            </div>
          )}

          {(subTab === "change" || subTab === "view") && (
            !hasSelectedReference ? (
              <SelectionPlaceholder
                title={`Select a ${config.frontendStage} number to ${subTab === "change" ? "manage" : "view"} documents`}
                description="Document actions stay hidden until a single reference number is selected."
              />
            ) : (
              <div className="border" style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9", borderRadius: "2px" }}>
                <div className="px-4 py-2 border-b" style={{ backgroundColor: "#f5f5f5", borderColor: "#d9d9d9" }}><span style={{ fontSize: "12px", fontWeight: "600", color: "#32363a" }}>{subTab === "change" ? "Manage Documents" : "Uploaded Documents"} ({filteredDocuments.length})</span></div>
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f5f5f5", borderBottom: "1px solid #d9d9d9" }}>
                        {["File Name", "Reference", "Version", "OCR Status", "Upload Date", "Uploaded By", "Size", "Actions"].map((header) => <th key={header} className="text-left" style={{ padding: "6px 12px", fontSize: "11px", fontWeight: "600", color: "#32363a", borderRight: "1px solid #e5e5e5" }}>{header}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDocuments.length === 0 ? <tr><td colSpan={8} style={{ padding: "20px", textAlign: "center", fontSize: "12px", color: "#8a8b8c" }}>No documents found for the selected reference.</td></tr> : filteredDocuments.map((document, index) => (
                        <tr key={document._id} style={{ borderBottom: "1px solid #eeeeee", backgroundColor: index % 2 === 0 ? "#ffffff" : "#fafafa" }}>
                          <td style={{ padding: "6px 12px", fontSize: "12px", color: "#0070F2", borderRight: "1px solid #e5e5e5" }}>{document.original_filename}</td>
                          <td style={{ padding: "6px 12px", fontSize: "12px", color: "#32363a", borderRight: "1px solid #e5e5e5" }}>{document.referenceNumber}</td>
                          <td style={{ padding: "6px 12px", fontSize: "12px", color: "#32363a", borderRight: "1px solid #e5e5e5" }}>v{document.version}</td>
                          <td style={{ padding: "6px 12px", borderRight: "1px solid #e5e5e5" }}><span style={{ fontSize: "11px", color: statusTone(document.ocr_status).color, backgroundColor: statusTone(document.ocr_status).bg, padding: "2px 6px", borderRadius: "2px", fontWeight: "600" }}>{document.ocr_status}</span></td>
                          <td style={{ padding: "6px 12px", fontSize: "12px", color: "#32363a", borderRight: "1px solid #e5e5e5" }}>{formatDate(document.uploaded_at)}</td>
                          <td style={{ padding: "6px 12px", fontSize: "12px", color: "#32363a", borderRight: "1px solid #e5e5e5" }}>{document.uploaded_by || "system"}</td>
                          <td style={{ padding: "6px 12px", fontSize: "12px", color: "#32363a", borderRight: "1px solid #e5e5e5" }}>{formatFileSize(document.file_size)}</td>
                          <td style={{ padding: "6px 12px" }}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <a href={getDocumentDownloadUrl(stage, document._id, true)} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2 py-1 border hover:bg-blue-50" style={{ fontSize: "11px", borderColor: "#0070F2", color: "#0070F2", borderRadius: "2px" }}><Eye size={11} />View</a>
                              <a href={getDocumentDownloadUrl(stage, document._id)} className="flex items-center gap-1 px-2 py-1 border hover:bg-gray-50" style={{ fontSize: "11px", borderColor: "#d9d9d9", color: "#32363a", borderRadius: "2px" }}><Download size={11} />Download</a>
                              {subTab === "change" ? <><button onClick={() => handleReplace(document.referenceNumber, document._id)} className="flex items-center gap-1 px-2 py-1 border hover:bg-blue-50" style={{ fontSize: "11px", borderColor: "#0070F2", color: "#0070F2", borderRadius: "2px" }}><Edit size={11} />Replace</button><button onClick={() => void handleDelete(document._id)} className="flex items-center gap-1 px-2 py-1 border hover:bg-red-50" style={{ fontSize: "11px", borderColor: "#BB0000", color: "#BB0000", borderRadius: "2px" }}><Trash2 size={11} />Delete</button></> : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </SubTabPanel>
      </div>

      <input ref={replaceInputRef} type="file" className="hidden" onChange={(event) => void onReplaceFileSelected(event)} />
      <ModuleFooterAlerts
        error={error}
        infoMessage={infoMessage}
        validation={lastValidation}
        idleMessage={`Select a ${config.frontendStage} number to load its items, manage documents, and see OCR feedback here in the footer.`}
      />
    </div>
  );
}

async function getDetail(stage: StageKey, summary: PRRecord | PORecord | GRNRecord) {
  let reference = "";
  if (stage === "PR" && "pr_number" in summary) {
    reference = summary.pr_number;
  } else if (stage === "PO" && "po_number" in summary) {
    reference = summary.po_number;
  } else if (stage === "GRN" && "grn_number" in summary) {
    reference = summary.grn_number;
  }

  if (!reference) return null;
  return getStageRecord(stage, reference) as Promise<PRRecord | PORecord | GRNRecord>;
}
