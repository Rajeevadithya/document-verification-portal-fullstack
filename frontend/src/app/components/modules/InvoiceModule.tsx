import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, Edit, ExternalLink, Eye, FileUp, LoaderCircle, Trash2, Upload } from "lucide-react";
import { useSearchParams } from "react-router";
import { FilterBar, type FilterValues } from "../FilterBar";
import {
  deleteDocument,
  getDocumentDownloadUrl,
  getStageRecord,
  listDocuments,
  listStageRecords,
  listValueHelp,
  replaceDocument,
  sendInvoiceToMiro,
  uploadDocuments,
} from "../../lib/api";
import { formatCurrency, formatDate, formatFileSize, statusTone } from "../../lib/format";
import { ModuleFooterAlerts, SelectionPlaceholder, SubTabPanel } from "./ModuleExperience";
import type { InvoiceAggregate, InvoiceRecord, StageDocument, ValueHelpItem } from "../../lib/types";

type InvoiceRow = {
  invoiceNumber: string;
  prNumber: string;
  poNumber: string;
  grnNumber: string;
  createdAt: string;
};

function asRows(invoices: InvoiceRecord[]): InvoiceRow[] {
  return invoices.map((invoice) => ({
    invoiceNumber: invoice.invoice_number,
    prNumber: invoice.pr_number,
    poNumber: invoice.po_number,
    grnNumber: invoice.grn_number,
    createdAt: invoice.created_at,
  }));
}

function SectionTable({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <div className="border" style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9", borderRadius: "2px" }}>
      <div className="px-4 py-2 border-b flex items-center justify-between" style={{ backgroundColor: "#f5f5f5", borderColor: "#d9d9d9" }}>
        <span style={{ fontSize: "12px", fontWeight: "600", color: "#32363a" }}>{title}</span>
        {badge ? <span style={{ fontSize: "11px", color: "#8a8b8c" }}>{badge}</span> : null}
      </div>
      {children}
    </div>
  );
}

const TH_STYLE = { padding: "6px 10px", fontSize: "11px", fontWeight: "600", color: "#32363a", borderRight: "1px solid #e5e5e5", whiteSpace: "nowrap" as const };
const TD_STYLE = { padding: "5px 10px", fontSize: "12px", color: "#32363a", borderRight: "1px solid #e5e5e5", whiteSpace: "nowrap" as const };

export function InvoiceModule() {
  const [searchParams] = useSearchParams();
  const initialDocNumber = searchParams.get("doc") || "";
  const initialAction = searchParams.get("action") as "upload" | "change" | "view" | null;
  const [subTab, setSubTab] = useState<"upload" | "change" | "view">(initialAction ?? "upload");
  const [filters, setFilters] = useState<FilterValues>({ docNumber: initialDocNumber, plant: "" });
  const [valueHelpItems, setValueHelpItems] = useState<ValueHelpItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [invoiceDocuments, setInvoiceDocuments] = useState<Record<string, StageDocument[]>>({});
  const [selectedInvoice, setSelectedInvoice] = useState<string>(initialDocNumber);
  const [aggregate, setAggregate] = useState<InvoiceAggregate | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [lastValidation, setLastValidation] = useState<{ ocr_status: string; ocr_rejection_detail?: StageDocument["ocr_rejection_detail"] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [subTabTransitioning, setSubTabTransitioning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<{ invoiceNumber: string; documentId: string } | null>(null);
  const initialRenderRef = useRef(true);

  const loadData = async (preferredInvoice?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [helpers, invoiceList] = await Promise.all([listValueHelp("INV"), listStageRecords("INVOICE")]);
      const typedInvoices = invoiceList as InvoiceRecord[];
      const docEntries = await Promise.all(
        typedInvoices.map(async (invoice) => {
          const response = await listDocuments("INVOICE", invoice.invoice_number);
          return [invoice.invoice_number, "document" in response && response.document ? [response.document] : []] as const;
        }),
      );
      setValueHelpItems(helpers);
      setInvoices(typedInvoices);
      setInvoiceDocuments(Object.fromEntries(docEntries));

      const nextInvoice = preferredInvoice !== undefined ? preferredInvoice : selectedInvoice;
      if (nextInvoice) {
        setSelectedInvoice(nextInvoice);
        const details = await getStageRecord("INVOICE", nextInvoice) as InvoiceAggregate;
        setAggregate(details);
      } else {
        setSelectedInvoice("");
        setAggregate(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load invoice data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const nextDocNumber = searchParams.get("doc") ?? "";
    const nextAction = searchParams.get("action") as "upload" | "change" | "view" | null;
    setFilters((current) => ({ ...current, docNumber: nextDocNumber }));
    setSelectedInvoice(nextDocNumber);
    if (nextAction) setSubTab(nextAction);
    void loadData(nextDocNumber);
  }, [searchParams]);

  useEffect(() => {
    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      return;
    }

    setSubTabTransitioning(true);
    const timeout = window.setTimeout(() => setSubTabTransitioning(false), 220);
    return () => window.clearTimeout(timeout);
  }, [subTab]);

  const invoiceRows = useMemo(() => asRows(invoices).filter((row) => {
    if (!filters.docNumber) return false;
    if (filters.docNumber && row.invoiceNumber !== filters.docNumber) return false;
    return true;
  }), [filters.docNumber, invoices]);

  const currentDocuments = selectedInvoice ? invoiceDocuments[selectedInvoice] || [] : [];
  const hasSelectedInvoice = Boolean(selectedInvoice);

  const selectInvoice = async (invoiceNumber: string) => {
    setSelectedInvoice(invoiceNumber);
    setFilters((current) => ({ ...current, docNumber: invoiceNumber }));
    if (!invoiceNumber) {
      setAggregate(null);
      return;
    }
    setAggregate(await getStageRecord("INVOICE", invoiceNumber) as InvoiceAggregate);
  };

  const handleUpload = async () => {
    if (!selectedInvoice || selectedFiles.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const document = await uploadDocuments("INVOICE", selectedInvoice, selectedFiles) as StageDocument;
      setLastValidation({ ocr_status: document.ocr_status, ocr_rejection_detail: document.ocr_rejection_detail });
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setInfoMessage("Invoice document uploaded successfully.");
      setSubTab("view");
      await loadData(selectedInvoice);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const onReplaceFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const target = replaceTargetRef.current;
    if (!file || !target) return;
    setUploading(true);
    setError(null);
    try {
      const updated = await replaceDocument("INVOICE", target.invoiceNumber, target.documentId, file);
      setLastValidation({ ocr_status: updated.ocr_status, ocr_rejection_detail: updated.ocr_rejection_detail });
      setInfoMessage("Invoice document replaced successfully.");
      await loadData(target.invoiceNumber);
    } catch (replaceError) {
      setError(replaceError instanceof Error ? replaceError.message : "Replacement failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
      replaceTargetRef.current = null;
    }
  };

  const handleMiro = async () => {
    if (!selectedInvoice) return;
    setError(null);
    try {
      const response = await sendInvoiceToMiro(selectedInvoice);
      setInfoMessage("Invoice sent to MIRO successfully.");
      if (response.miro_redirect_url) {
        window.open(response.miro_redirect_url, "_blank", "noopener,noreferrer");
      }
      await loadData(selectedInvoice);
    } catch (miroError) {
      setError(miroError instanceof Error ? miroError.message : "Unable to send invoice to MIRO.");
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!window.confirm("Delete this invoice document?")) return;
    setError(null);
    try {
      await deleteDocument("INVOICE", documentId);
      setInfoMessage("Invoice document deleted successfully.");
      await loadData(selectedInvoice);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed.");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full" style={{ color: "#6A6D70" }}>Loading invoice data...</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex border-b flex-shrink-0" style={{ backgroundColor: "#f0f0f0", borderColor: "#d9d9d9" }}>
        {[{ id: "upload", label: "Upload Document" }, { id: "change", label: "Change Document" }, { id: "view", label: "View Document" }].map((tab) => (
          <button key={tab.id} onClick={() => setSubTab(tab.id as "upload" | "change" | "view")} className="px-4 py-2" style={{ fontSize: "12px", fontWeight: subTab === tab.id ? "600" : "400", color: subTab === tab.id ? "#0070F2" : "#32363a", backgroundColor: subTab === tab.id ? "#ffffff" : "transparent", borderBottom: subTab === tab.id ? "2px solid #0070F2" : "2px solid transparent", borderRight: "1px solid #d9d9d9" }}>{tab.label}</button>
        ))}
      </div>

      <FilterBar
        docType="INV"
        onSearch={(next) => {
          setFilters(next);
          void selectInvoice(next.docNumber || "");
        }}
        valueHelpItems={valueHelpItems}
        values={filters}
      />

      <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
        {!hasSelectedInvoice ? (
          <SelectionPlaceholder
            title="Select an invoice number to view items"
            description="Invoice tables stay hidden until you choose an invoice number from the filter bar or the upload form."
          />
        ) : (
          <>
            <SectionTable title="Invoice Overview" badge={`${invoiceRows.length} invoice(s)`}>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead><tr style={{ backgroundColor: "#f5f5f5", borderBottom: "1px solid #d9d9d9" }}>{["Invoice Number", "PR Number", "PO Number", "GRN Number", "Created"].map((header) => <th key={header} className="text-left" style={TH_STYLE}>{header}</th>)}</tr></thead>
                  <tbody>
                    {invoiceRows.length === 0 ? <tr><td colSpan={5} style={{ padding: "20px", textAlign: "center", fontSize: "12px", color: "#8a8b8c" }}>No invoices found for the selected number.</td></tr> : invoiceRows.map((row, index) => {
                      return (
                        <tr key={row.invoiceNumber} onClick={() => void selectInvoice(row.invoiceNumber)} style={{ borderBottom: "1px solid #eeeeee", backgroundColor: selectedInvoice === row.invoiceNumber ? "#EAF1FF" : index % 2 === 0 ? "#ffffff" : "#fafafa", cursor: "pointer" }}>
                          <td style={{ ...TD_STYLE, color: "#0070F2" }}>{row.invoiceNumber}</td>
                          <td style={{ ...TD_STYLE, color: "#0070F2" }}>{row.prNumber}</td>
                          <td style={{ ...TD_STYLE, color: "#0070F2" }}>{row.poNumber}</td>
                          <td style={{ ...TD_STYLE, color: "#0070F2" }}>{row.grnNumber}</td>
                          <td style={TD_STYLE}>{formatDate(row.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionTable>

            <SectionTable title="Linked Purchase Requisition (PR) Details" badge={aggregate?.purchase_requisition?.items.length ? `${aggregate.purchase_requisition.items.length} item(s)` : undefined}>
              {!aggregate?.purchase_requisition ? <div style={{ padding: "16px 20px", fontSize: "12px", color: "#8a8b8c" }}>Select an invoice to view linked PR details.</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: "collapse" }}>
                    <thead><tr style={{ backgroundColor: "#f5f5f5", borderBottom: "1px solid #d9d9d9" }}>{["PR Number", "Item", "Material", "Unit", "Quantity", "Valuation Price", "Delivery Date", "Plant", "Storage Location", "Purchase Group"].map((header) => <th key={header} className="text-left" style={TH_STYLE}>{header}</th>)}</tr></thead>
                    <tbody>{aggregate.purchase_requisition.items.map((item, index) => <tr key={item.item_number} style={{ borderBottom: "1px solid #eeeeee", backgroundColor: index % 2 === 0 ? "#ffffff" : "#fafafa" }}><td style={{ ...TD_STYLE, color: "#0070F2" }}>{aggregate.purchase_requisition?.pr_number}</td><td style={TD_STYLE}>{item.item_number}</td><td style={TD_STYLE}>{item.material}</td><td style={TD_STYLE}>{item.unit_of_measure}</td><td style={TD_STYLE}>{item.quantity}</td><td style={TD_STYLE}>{formatCurrency(item.valuation_price)}</td><td style={TD_STYLE}>{formatDate(item.delivery_date)}</td><td style={TD_STYLE}>{item.plant}</td><td style={TD_STYLE}>{item.storage_location}</td><td style={TD_STYLE}>{item.purchase_group}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </SectionTable>

            <SectionTable title="Linked Purchase Order (PO) Details" badge={aggregate?.purchase_order?.items.length ? `${aggregate.purchase_order.items.length} item(s)` : undefined}>
              {!aggregate?.purchase_order ? <div style={{ padding: "16px 20px", fontSize: "12px", color: "#8a8b8c" }}>Select an invoice to view linked PO details.</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: "collapse" }}>
                    <thead><tr style={{ backgroundColor: "#f5f5f5", borderBottom: "1px solid #d9d9d9" }}>{["PO Number", "PR Number", "Item", "Material", "Quantity", "Net Price", "Delivery Date", "Plant", "Storage Location", "Vendor"].map((header) => <th key={header} className="text-left" style={TH_STYLE}>{header}</th>)}</tr></thead>
                    <tbody>{aggregate.purchase_order.items.map((item, index) => <tr key={item.item_number} style={{ borderBottom: "1px solid #eeeeee", backgroundColor: index % 2 === 0 ? "#ffffff" : "#fafafa" }}><td style={{ ...TD_STYLE, color: "#0070F2" }}>{aggregate.purchase_order?.po_number}</td><td style={{ ...TD_STYLE, color: "#0070F2" }}>{aggregate.purchase_order?.pr_number}</td><td style={TD_STYLE}>{item.item_number}</td><td style={TD_STYLE}>{item.material}</td><td style={TD_STYLE}>{item.quantity}</td><td style={TD_STYLE}>{formatCurrency(item.net_price)}</td><td style={TD_STYLE}>{formatDate(item.delivery_date)}</td><td style={TD_STYLE}>{item.plant}</td><td style={TD_STYLE}>{item.storage_location}</td><td style={TD_STYLE}>{aggregate.purchase_order?.vendor}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </SectionTable>

            <SectionTable title="Linked Goods Receipt Note (GRN) Details" badge={aggregate?.goods_receipt?.items.length ? `${aggregate.goods_receipt.items.length} item(s)` : undefined}>
              {!aggregate?.goods_receipt ? <div style={{ padding: "16px 20px", fontSize: "12px", color: "#8a8b8c" }}>Select an invoice to view linked GRN details.</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: "collapse" }}>
                    <thead><tr style={{ backgroundColor: "#f5f5f5", borderBottom: "1px solid #d9d9d9" }}>{["GRN Number", "PO Number", "Item", "Material", "Unit", "Quantity", "Price", "Document Date", "Posting Date", "Plant", "Storage Location"].map((header) => <th key={header} className="text-left" style={TH_STYLE}>{header}</th>)}</tr></thead>
                    <tbody>{aggregate.goods_receipt.items.map((item, index) => <tr key={item.item} style={{ borderBottom: "1px solid #eeeeee", backgroundColor: index % 2 === 0 ? "#ffffff" : "#fafafa" }}><td style={{ ...TD_STYLE, color: "#0070F2" }}>{aggregate.goods_receipt?.grn_number}</td><td style={{ ...TD_STYLE, color: "#0070F2" }}>{aggregate.goods_receipt?.po_number}</td><td style={TD_STYLE}>{item.item}</td><td style={TD_STYLE}>{item.material}</td><td style={TD_STYLE}>{item.unit_of_measure}</td><td style={TD_STYLE}>{item.quantity}</td><td style={TD_STYLE}>{formatCurrency(item.price)}</td><td style={TD_STYLE}>{formatDate(aggregate.goods_receipt?.document_date)}</td><td style={TD_STYLE}>{formatDate(aggregate.goods_receipt?.posting_date)}</td><td style={TD_STYLE}>{item.plant}</td><td style={TD_STYLE}>{item.storage_location}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </SectionTable>
          </>
        )}

        <SubTabPanel transitioning={subTabTransitioning}>
          {subTab === "upload" && (
            <div className="flex gap-4 flex-wrap">
              <SectionTable title="Upload Invoice Document" badge="Single document per invoice">
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label style={{ fontSize: "11px", fontWeight: "500", color: "#32363a" }}>Invoice Number</label>
                    <select value={selectedInvoice} onChange={(event) => void selectInvoice(event.target.value)} className="border px-2 py-1 outline-none" style={{ fontSize: "12px", borderColor: "#d9d9d9", borderRadius: "2px", backgroundColor: "#ffffff", height: "30px", color: "#32363a" }}>
                      <option value="">Select</option>
                      {valueHelpItems.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
                    </select>
                  </div>
                  <button onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed flex flex-col items-center justify-center cursor-pointer px-4 py-6" style={{ borderColor: "#B0B0B0", backgroundColor: "#FAFAFA", borderRadius: "2px" }}>
                    <Upload size={20} color="#6A6D70" />
                    <div style={{ fontSize: "12px", color: "#32363a", marginTop: "8px" }}>{selectedFiles.length > 0 ? selectedFiles.map((file) => file.name).join(", ") : "Choose a file"}</div>
                  </button>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))} />
                  <button onClick={() => void handleUpload()} disabled={!selectedInvoice || selectedFiles.length === 0 || uploading} className="px-4 py-2 border w-fit flex items-center gap-2" style={{ fontSize: "12px", backgroundColor: !selectedInvoice || selectedFiles.length === 0 || uploading ? "#d9d9d9" : "#0070F2", color: "#ffffff", borderColor: !selectedInvoice || selectedFiles.length === 0 || uploading ? "#d9d9d9" : "#0070F2", borderRadius: "2px" }}>{uploading ? <LoaderCircle size={14} className="animate-spin" /> : <FileUp size={14} />}Upload Document</button>
                </div>
              </SectionTable>
            </div>
          )}

          {(subTab === "change" || subTab === "view") && (
            !hasSelectedInvoice ? (
              <SelectionPlaceholder
                title={`Select an invoice number to ${subTab === "change" ? "manage" : "view"} documents`}
                description="Invoice document actions stay hidden until a single invoice number is selected."
              />
            ) : (
              <SectionTable title={subTab === "change" ? "Manage Invoice Document" : "Uploaded Invoice Document"} badge={`${currentDocuments.length} document(s)`}>
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: "collapse" }}>
                    <thead><tr style={{ backgroundColor: "#f5f5f5", borderBottom: "1px solid #d9d9d9" }}>{["File Name", "Version", "OCR Status", "Upload Date", "Uploaded By", "Size", "Actions"].map((header) => <th key={header} className="text-left" style={TH_STYLE}>{header}</th>)}</tr></thead>
                    <tbody>
                      {currentDocuments.length === 0 ? <tr><td colSpan={7} style={{ padding: "20px", textAlign: "center", fontSize: "12px", color: "#8a8b8c" }}>No invoice document found for the selected invoice.</td></tr> : currentDocuments.map((document) => (
                        <tr key={document._id} style={{ borderBottom: "1px solid #eeeeee", backgroundColor: "#ffffff" }}>
                          <td style={{ ...TD_STYLE, color: "#0070F2" }}>{document.original_filename}</td>
                          <td style={TD_STYLE}>v{document.version}</td>
                          <td style={TD_STYLE}><span style={{ fontSize: "11px", color: statusTone(document.ocr_status).color, backgroundColor: statusTone(document.ocr_status).bg, padding: "2px 6px", borderRadius: "2px", fontWeight: "600" }}>{document.ocr_status}</span></td>
                          <td style={TD_STYLE}>{formatDate(document.uploaded_at)}</td>
                          <td style={TD_STYLE}>{document.uploaded_by || "system"}</td>
                          <td style={TD_STYLE}>{formatFileSize(document.file_size)}</td>
                          <td style={TD_STYLE}><div className="flex items-center gap-2 flex-wrap"><a href={getDocumentDownloadUrl("INVOICE", document._id, true)} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2 py-1 border hover:bg-blue-50" style={{ fontSize: "11px", borderColor: "#0070F2", color: "#0070F2", borderRadius: "2px" }}><Eye size={11} />View</a><a href={getDocumentDownloadUrl("INVOICE", document._id)} className="flex items-center gap-1 px-2 py-1 border hover:bg-gray-50" style={{ fontSize: "11px", borderColor: "#d9d9d9", color: "#32363a", borderRadius: "2px" }}><Download size={11} />Download</a>{subTab === "change" ? <><button onClick={() => { replaceTargetRef.current = { invoiceNumber: selectedInvoice, documentId: document._id }; replaceInputRef.current?.click(); }} className="flex items-center gap-1 px-2 py-1 border hover:bg-blue-50" style={{ fontSize: "11px", borderColor: "#0070F2", color: "#0070F2", borderRadius: "2px" }}><Edit size={11} />Replace</button><button onClick={() => void handleDelete(document._id)} className="flex items-center gap-1 px-2 py-1 border hover:bg-red-50" style={{ fontSize: "11px", borderColor: "#BB0000", color: "#BB0000", borderRadius: "2px" }}><Trash2 size={11} />Delete</button></> : null}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionTable>
            )
          )}
        </SubTabPanel>

        <div className="flex justify-end">
          <button onClick={() => void handleMiro()} disabled={!selectedInvoice} className="flex items-center gap-2 px-4 py-2 border" style={{ fontSize: "12px", backgroundColor: selectedInvoice ? "#107E3E" : "#d9d9d9", color: "#ffffff", borderColor: selectedInvoice ? "#107E3E" : "#d9d9d9", borderRadius: "2px" }}><ExternalLink size={14} /> Send to MIRO</button>
        </div>
      </div>

      <input ref={replaceInputRef} type="file" className="hidden" onChange={(event) => void onReplaceFileSelected(event)} />
      <ModuleFooterAlerts
        error={error}
        infoMessage={infoMessage}
        validation={lastValidation}
        idleMessage="Select an invoice number to load linked records, manage documents, and see OCR feedback here in the footer."
      />
    </div>
  );
}
