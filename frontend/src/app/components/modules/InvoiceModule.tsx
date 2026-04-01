import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, Eye, Link2, LoaderCircle, Paperclip } from "lucide-react";
import { useSearchParams } from "react-router";
import { FilterBar, createEmptyFilterValues, type FilterValues } from "../FilterBar";
import { getDocumentDownloadUrl, getStageRecord, listDocuments, listStageRecords, listValueHelp } from "../../lib/api";
import { formatCurrency, formatDate, formatFileSize } from "../../lib/format";
import { ModuleFooterAlerts, SelectionPlaceholder } from "./ModuleExperience";
import type {
  GRNRecord,
  InvoiceAggregate,
  InvoiceRecord,
  PORecord,
  PRRecord,
  StageDocument,
  StageKey,
  ValueHelpItem,
} from "../../lib/types";

type InvoiceRow = {
  invoiceNumber: string;
  prNumber: string;
  poNumber: string;
  grnNumber: string;
  createdAt: string;
  status: string;
  synthetic?: boolean;
};

const TH_STYLE: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: "12px",
  fontWeight: "700",
  color: "#475569",
  borderBottom: "1px solid #e2e8f0",
  borderRight: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
  backgroundColor: "#f8fafc",
  textAlign: "left",
};

const TD_STYLE: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: "12px",
  color: "#334155",
  borderBottom: "1px solid #f1f5f9",
  borderRight: "1px solid #f1f5f9",
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

function asRows(invoices: InvoiceRecord[]): InvoiceRow[] {
  return invoices.map((invoice) => ({
    invoiceNumber: invoice.invoice_number,
    prNumber: invoice.pr_number,
    poNumber: invoice.po_number,
    grnNumber: invoice.grn_number,
    createdAt: invoice.created_at,
    status: invoice.status,
  }));
}

function statusBadge(status: string, synthetic = false) {
  const normalized = status.toLowerCase();
  const tone = synthetic
    ? { color: "#1d4ed8", bg: "#dbeafe" }
    : normalized.includes("sent")
      ? { color: "#7c2d12", bg: "#ffedd5" }
      : normalized.includes("pending")
        ? { color: "#b45309", bg: "#fef3c7" }
        : { color: "#107E3E", bg: "#eef5ec" };

  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: "700",
        color: tone.color,
        backgroundColor: tone.bg,
        padding: "3px 10px",
        borderRadius: "999px",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
      }}
    >
      {synthetic ? "Demo linkage" : status}
    </span>
  );
}

function SectionTable({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #f1f5f9",
          backgroundColor: "#fafcff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <span style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a" }}>{title}</span>
        {badge ? <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "500" }}>{badge}</span> : null}
      </div>
      {children}
    </div>
  );
}

function AttachmentSubCard({
  title,
  stage,
  reference,
  docs,
  loading,
}: {
  title: string;
  stage: StageKey;
  reference: string;
  docs: StageDocument[];
  loading: boolean;
}) {
  return (
    <div
      style={{
        margin: "16px 20px 20px",
        border: "1px solid #dbeafe",
        borderRadius: "14px",
        overflow: "hidden",
        backgroundColor: "#f8fbff",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #dbeafe",
          backgroundColor: "#eff6ff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Paperclip size={14} color="#1d4ed8" />
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#1e40af" }}>{title}</span>
        </div>
        <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>{reference}</span>
      </div>

      {loading ? (
        <div style={{ padding: "16px", display: "flex", alignItems: "center", gap: "8px", color: "#6A6D70", fontSize: "12px" }}>
          <LoaderCircle size={14} className="animate-spin" />
          Loading attachments...
        </div>
      ) : docs.length === 0 ? (
        <div style={{ padding: "16px", fontSize: "12px", color: "#94a3b8" }}>No attachments uploaded for this record.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "760px" }}>
            <thead>
              <tr>
                {["File Name", "Version", "Uploaded", "Size", "Actions"].map((header, index, arr) => (
                  <th
                    key={header}
                    style={{ ...TH_STYLE, fontSize: "11px", backgroundColor: "#f8fbff", borderRight: index === arr.length - 1 ? "none" : TH_STYLE.borderRight }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((doc, index) => (
                <tr key={doc._id} style={{ backgroundColor: index % 2 === 0 ? "#ffffff" : "#fafcff" }}>
                  <td style={{ ...TD_STYLE, color: "#2563eb", fontWeight: "600" }}>{doc.original_filename}</td>
                  <td style={TD_STYLE}>v{doc.version}</td>
                  <td style={TD_STYLE}>{formatDate(doc.uploaded_at)}</td>
                  <td style={TD_STYLE}>{formatFileSize(doc.file_size)}</td>
                  <td style={{ ...TD_STYLE, borderRight: "none" }}>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <a
                        href={getDocumentDownloadUrl(stage, doc._id, true)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#0070F2", textDecoration: "none", fontSize: "11px", fontWeight: "600" }}
                      >
                        <Eye size={11} />
                        View
                      </a>
                      <a
                        href={getDocumentDownloadUrl(stage, doc._id)}
                        style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#475569", textDecoration: "none", fontSize: "11px", fontWeight: "600" }}
                      >
                        <Download size={11} />
                        Download
                      </a>
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

function MetaChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "3px",
        padding: "10px 16px",
        backgroundColor: highlight ? "#eff6ff" : "#f8fafc",
        border: `1px solid ${highlight ? "#bfdbfe" : "#e2e8f0"}`,
        borderRadius: "10px",
        minWidth: "148px",
      }}
    >
      <span
        style={{
          fontSize: "10px",
          fontWeight: "700",
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: "13px", fontWeight: "600", color: highlight ? "#1d4ed8" : "#0f172a" }}>{value}</span>
    </div>
  );
}

function DataTable({
  headers,
  emptyMessage,
  children,
}: {
  headers: string[];
  emptyMessage?: string;
  children?: ReactNode;
}) {
  const hasContent = Boolean(children);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "920px" }}>
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th
                key={header}
                style={{ ...TH_STYLE, borderRight: index === headers.length - 1 ? "none" : TH_STYLE.borderRight }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hasContent ? (
            children
          ) : (
            <tr>
              <td colSpan={headers.length} style={{ padding: "22px 16px", textAlign: "center", fontSize: "12px", color: "#94a3b8" }}>
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function matchesInvoiceFilters(row: InvoiceRow, filters: FilterValues) {
  if (filters.search) {
    const haystack = [row.invoiceNumber, row.prNumber, row.poNumber, row.grnNumber].join(" ").toLowerCase();
    if (!haystack.includes(filters.search.toLowerCase())) return false;
  }
  if (filters.docNumber && row.invoiceNumber !== filters.docNumber) return false;
  if (filters.prNumber && row.prNumber !== filters.prNumber) return false;
  if (filters.poNumber && row.poNumber !== filters.poNumber) return false;
  if (filters.grnNumber && row.grnNumber !== filters.grnNumber) return false;
  return true;
}

function buildSyntheticAggregate(filters: FilterValues, prs: PRRecord[], pos: PORecord[], grns: GRNRecord[]): InvoiceAggregate | null {
  const explicitPr = filters.prNumber.trim();
  const explicitPo = filters.poNumber.trim();
  const explicitGrn = filters.grnNumber.trim();

  let pr = explicitPr ? prs.find((item) => item.pr_number === explicitPr) ?? null : null;
  let po = explicitPo ? pos.find((item) => item.po_number === explicitPo) ?? null : null;
  let grn = explicitGrn ? grns.find((item) => item.grn_number === explicitGrn) ?? null : null;

  if (!po && pr) {
    const linkedPr = pr;
    po = pos.find((item) => item.pr_number === linkedPr.pr_number) ?? null;
  }
  if (!grn && po) {
    const linkedPo = po;
    grn = grns.find((item) => item.po_number === linkedPo.po_number) ?? null;
  }
  if (!po && grn) po = pos.find((item) => item.po_number === grn.po_number) ?? null;
  if (!pr && po) pr = prs.find((item) => item.pr_number === po.pr_number) ?? null;
  if (!pr && grn && po) pr = prs.find((item) => item.pr_number === po.pr_number) ?? null;

  if (!pr && !po && !grn) return null;

  const anchor = grn?.grn_number || po?.po_number || pr?.pr_number || "DEMO";
  const now = new Date().toISOString();

  return {
    invoice: {
      _id: `synthetic-${anchor}`,
      invoice_number: `INV-${anchor}`,
      pr_number: pr?.pr_number || "",
      po_number: po?.po_number || "",
      grn_number: grn?.grn_number || "",
      status: "DEMO_LINKED",
      miro_redirect_url: "",
      created_at: now,
      updated_at: now,
    },
    purchase_requisition: pr,
    purchase_order: po,
    goods_receipt: grn,
    uploaded_document: null,
    has_document: false,
    miro_redirect_url: "",
  };
}

function aggregateToRow(aggregate: InvoiceAggregate, synthetic = false): InvoiceRow {
  return {
    invoiceNumber: aggregate.invoice.invoice_number,
    prNumber: aggregate.invoice.pr_number,
    poNumber: aggregate.invoice.po_number,
    grnNumber: aggregate.invoice.grn_number,
    createdAt: aggregate.invoice.created_at,
    status: aggregate.invoice.status,
    synthetic,
  };
}

export function InvoiceModule() {
  const [searchParams] = useSearchParams();
  const initialDocNumber = searchParams.get("doc") || "";

  const [filters, setFilters] = useState<FilterValues>(createEmptyFilterValues({ docNumber: initialDocNumber }));
  const [hasSearched, setHasSearched] = useState(Boolean(initialDocNumber));
  const [valueHelpItems, setValueHelpItems] = useState<ValueHelpItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [prRecords, setPrRecords] = useState<PRRecord[]>([]);
  const [poRecords, setPoRecords] = useState<PORecord[]>([]);
  const [grnRecords, setGrnRecords] = useState<GRNRecord[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<string>(initialDocNumber);
  const [aggregate, setAggregate] = useState<InvoiceAggregate | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [linkedDocs, setLinkedDocs] = useState<Record<"PR" | "PO" | "GRN", StageDocument[]>>({ PR: [], PO: [], GRN: [] });
  const [docsLoading, setDocsLoading] = useState<Record<"PR" | "PO" | "GRN", boolean>>({ PR: false, PO: false, GRN: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [helpers, invoiceList, prs, pos, grns] = await Promise.all([
        listValueHelp("INV"),
        listStageRecords("INVOICE"),
        listStageRecords("PR"),
        listStageRecords("PO"),
        listStageRecords("GRN"),
      ]);

      setValueHelpItems(helpers);
      setInvoices(invoiceList as InvoiceRecord[]);
      setPrRecords(prs as PRRecord[]);
      setPoRecords(pos as PORecord[]);
      setGrnRecords(grns as GRNRecord[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load invoice data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const nextDocNumber = searchParams.get("doc") ?? "";
    setFilters(createEmptyFilterValues({ docNumber: nextDocNumber }));
    setHasSearched(Boolean(nextDocNumber));
    setSelectedInvoice(nextDocNumber);
  }, [searchParams]);

  const baseRows = useMemo(() => asRows(invoices), [invoices]);

  const filteredRows = useMemo(() => {
    if (!hasSearched) return [];
    return baseRows.filter((row) => matchesInvoiceFilters(row, filters));
  }, [baseRows, filters, hasSearched]);

  const syntheticAggregate = useMemo(() => {
    if (!hasSearched) return null;
    if (filters.docNumber) return null;
    if (!filters.prNumber && !filters.poNumber && !filters.grnNumber) return null;
    return buildSyntheticAggregate(filters, prRecords, poRecords, grnRecords);
  }, [filters, grnRecords, hasSearched, poRecords, prRecords]);

  const displayRows = useMemo(() => {
    if (!hasSearched) return [];
    if (filteredRows.length > 0) return filteredRows;
    if (syntheticAggregate) return [aggregateToRow(syntheticAggregate, true)];
    return [];
  }, [filteredRows, hasSearched, syntheticAggregate]);

  useEffect(() => {
    if (!hasSearched) {
      setAggregate(null);
      setSelectedInvoice("");
      return;
    }

    if (displayRows.length === 0) {
      setAggregate(null);
      setSelectedInvoice("");
      return;
    }

    const preferredRow =
      displayRows.find((row) => row.invoiceNumber === filters.docNumber) ??
      displayRows.find((row) => row.invoiceNumber === selectedInvoice) ??
      displayRows[0];

    if (preferredRow.synthetic) {
      setSelectedInvoice(preferredRow.invoiceNumber);
      setAggregate(syntheticAggregate);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setSelectedInvoice(preferredRow.invoiceNumber);

    void getStageRecord("INVOICE", preferredRow.invoiceNumber)
      .then((result) => {
        if (!cancelled) setAggregate(result as InvoiceAggregate);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setAggregate(null);
          setError(loadError instanceof Error ? loadError.message : "Unable to load invoice details.");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [displayRows, filters.docNumber, hasSearched, selectedInvoice, syntheticAggregate]);

  const selectInvoice = async (row: InvoiceRow) => {
    setSelectedInvoice(row.invoiceNumber);
    setFilters((current) => ({ ...current, docNumber: row.synthetic ? "" : row.invoiceNumber }));
    setError(null);

    if (row.synthetic) {
      setAggregate(syntheticAggregate);
      return;
    }

    setDetailLoading(true);
    try {
      setAggregate(await getStageRecord("INVOICE", row.invoiceNumber) as InvoiceAggregate);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load invoice details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const activeAggregate = aggregate;
  const activeInvoice = activeAggregate?.invoice ?? null;
  const linkedItemCount =
    (activeAggregate?.purchase_requisition?.items.length ?? 0) +
    (activeAggregate?.purchase_order?.items.length ?? 0) +
    (activeAggregate?.goods_receipt?.items.length ?? 0);
  const usesSyntheticLinkage = activeInvoice?.status === "DEMO_LINKED";

  useEffect(() => {
    if (!activeAggregate) {
      setLinkedDocs({ PR: [], PO: [], GRN: [] });
      setDocsLoading({ PR: false, PO: false, GRN: false });
      return;
    }

    const refs: Array<{ key: "PR" | "PO" | "GRN"; reference: string }> = [
      { key: "PR", reference: activeAggregate.purchase_requisition?.pr_number || "" },
      { key: "PO", reference: activeAggregate.purchase_order?.po_number || "" },
      { key: "GRN", reference: activeAggregate.goods_receipt?.grn_number || "" },
    ];

    let cancelled = false;

    refs.forEach(({ key, reference }) => {
      if (!reference) {
        setLinkedDocs((current) => ({ ...current, [key]: [] }));
        setDocsLoading((current) => ({ ...current, [key]: false }));
        return;
      }

      setDocsLoading((current) => ({ ...current, [key]: true }));

      void listDocuments(key, reference)
        .then((result) => {
          if (cancelled) return;
          const docs = "documents" in result ? result.documents : result.document ? [result.document] : [];
          setLinkedDocs((current) => ({ ...current, [key]: docs }));
        })
        .catch(() => {
          if (!cancelled) setLinkedDocs((current) => ({ ...current, [key]: [] }));
        })
        .finally(() => {
          if (!cancelled) setDocsLoading((current) => ({ ...current, [key]: false }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [activeAggregate]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: "8px", color: "#6A6D70", fontSize: "13px" }}>
        <LoaderCircle className="animate-spin" size={18} />
        Loading invoice data...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <FilterBar
        docType="INV"
        onSearch={(next) => {
          setFilters(next);
          setHasSearched(true);
          setSelectedInvoice("");
          setAggregate(null);
          setError(null);
        }}
        valueHelpItems={valueHelpItems}
        valueHelpSources={{
          docNumber: valueHelpItems,
          prNumber: prRecords.map((record) => ({ id: record.pr_number, description: "" })),
          poNumber: poRecords.map((record) => ({ id: record.po_number, description: "" })),
          grnNumber: grnRecords.map((record) => ({ id: record.grn_number, description: "" })),
        }}
        values={filters}
        fieldOptions={{}}
      />

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {!hasSearched ? (
            <SelectionPlaceholder
              title="Use Go to load invoice records"
              description="Leave all invoice filter fields blank and press Go to display every invoice, or enter PR, PO, or GRN values to surface the linked verification view."
            />
          ) : (
            <SectionTable title="Invoice Overview" badge={`${displayRows.length} invoice record(s)`}>
              <DataTable
                headers={["Invoice Number", "PR Number", "PO Number", "GRN Number", "Status", "Created"]}
                emptyMessage="No invoices found for the selected filters."
              >
                {displayRows.map((row, index) => (
                  <tr
                    key={`${row.synthetic ? "synthetic" : "live"}-${row.invoiceNumber}`}
                    onClick={() => void selectInvoice(row)}
                    style={{
                      borderBottom: "1px solid #eeeeee",
                      backgroundColor: selectedInvoice === row.invoiceNumber ? "#EAF1FF" : index % 2 === 0 ? "#ffffff" : "#fafcff",
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ ...TD_STYLE, color: "#2563eb", fontWeight: "700" }}>{row.invoiceNumber}</td>
                    <td style={{ ...TD_STYLE, color: "#2563eb" }}>{row.prNumber || ""}</td>
                    <td style={{ ...TD_STYLE, color: "#2563eb" }}>{row.poNumber || ""}</td>
                    <td style={{ ...TD_STYLE, color: "#2563eb" }}>{row.grnNumber || ""}</td>
                    <td style={TD_STYLE}>{statusBadge(row.status, row.synthetic)}</td>
                    <td style={{ ...TD_STYLE, borderRight: "none" }}>{formatDate(row.createdAt)}</td>
                  </tr>
                ))}
              </DataTable>
            </SectionTable>
          )}

          {hasSearched && !selectedInvoice ? (
            <SelectionPlaceholder
              title="Select an invoice row to view linked records"
              description="Once an invoice row is selected, the linked PR, PO, and GRN tables will be shown together in a single consistent detail view."
            />
          ) : null}

          {hasSearched && selectedInvoice && activeAggregate ? (
            <>
              <div
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "18px",
                  overflow: "hidden",
                  boxShadow: "0 2px 8px rgba(15,23,42,0.07)",
                }}
              >
                <div
                  style={{
                    padding: "20px 24px 16px",
                    borderBottom: "1px solid #f1f5f9",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ fontSize: "12px", fontWeight: "700", color: "#1d4ed8", display: "flex", alignItems: "center", gap: "8px" }}>
                      <Link2 size={14} />
                      Invoice verification linkage
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
                      <div style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", letterSpacing: "-0.5px" }}>
                        {activeInvoice?.invoice_number}
                      </div>
                      {statusBadge(activeInvoice?.status || "PENDING", usesSyntheticLinkage)}
                    </div>
                  </div>
                  <div style={{ fontSize: "12px", color: usesSyntheticLinkage ? "#1d4ed8" : "#64748b", fontWeight: "600" }}>
                    {usesSyntheticLinkage ? "Showing generated demo linkage from the selected PR/PO/GRN chain." : "Showing live invoice linkage from the current dataset."}
                  </div>
                </div>

                <div style={{ padding: "20px 24px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  <MetaChip label="Invoice" value={activeInvoice?.invoice_number || ""} highlight />
                  <MetaChip label="Purchase Requisition" value={activeInvoice?.pr_number || ""} />
                  <MetaChip label="Purchase Order" value={activeInvoice?.po_number || ""} />
                  <MetaChip label="Goods Receipt" value={activeInvoice?.grn_number || ""} />
                  <MetaChip label="Linked Items" value={`${linkedItemCount}`} />
                  <MetaChip label="Invoice Document" value={activeAggregate.has_document ? "Uploaded" : "Not uploaded"} />
                </div>
              </div>

              {detailLoading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px", gap: "8px", color: "#6A6D70", fontSize: "13px" }}>
                  <LoaderCircle className="animate-spin" size={18} />
                  Loading linked invoice details...
                </div>
              ) : null}

              <SectionTable
                title="Linked Purchase Requisition (PR)"
                badge={activeAggregate.purchase_requisition?.items.length ? `${activeAggregate.purchase_requisition.items.length} item(s)` : undefined}
              >
                {activeAggregate.purchase_requisition ? (
                  <>
                    <DataTable headers={["PR Number", "Item Number", "Material", "Material Description", "Plant", "Quantity", "Price", "Amount", "Purchase Organization"]}>
                      {activeAggregate.purchase_requisition.items.map((item, index) => (
                        <tr key={item.item_number} style={{ backgroundColor: index % 2 === 0 ? "#ffffff" : "#fafcff" }}>
                          <td style={{ ...TD_STYLE, color: "#2563eb", fontWeight: "700" }}>{index === 0 ? activeAggregate.purchase_requisition?.pr_number : ""}</td>
                          <td style={TD_STYLE}>{item.item_number}</td>
                          <td style={TD_STYLE}>{item.material || ""}</td>
                          <td style={TD_STYLE}>{item.material_description || ""}</td>
                          <td style={TD_STYLE}>{item.plant}</td>
                          <td style={{ ...TD_STYLE, textAlign: "right" }}>{item.quantity}</td>
                          <td style={{ ...TD_STYLE, textAlign: "right" }}>{formatCurrency(item.price)}</td>
                          <td style={{ ...TD_STYLE, textAlign: "right" }}>{formatCurrency(item.amount)}</td>
                          <td style={{ ...TD_STYLE, borderRight: "none" }}>{item.purchase_organization || ""}</td>
                        </tr>
                      ))}
                    </DataTable>
                    <AttachmentSubCard
                      title="PR Attachments"
                      stage="PR"
                      reference={activeAggregate.purchase_requisition.pr_number}
                      docs={linkedDocs.PR}
                      loading={docsLoading.PR}
                    />
                  </>
                ) : (
                  <div style={{ padding: "18px 20px", fontSize: "12px", color: "#8a8b8c" }}>No linked PR details found for this invoice.</div>
                )}
              </SectionTable>

              <SectionTable
                title="Linked Purchase Order (PO)"
                badge={activeAggregate.purchase_order?.items.length ? `${activeAggregate.purchase_order.items.length} item(s)` : undefined}
              >
                {activeAggregate.purchase_order ? (
                  <>
                    <DataTable headers={["PO Number", "Item Number", "Material", "Material Description", "Quantity", "Price", "Amount", "Plant"]}>
                      {activeAggregate.purchase_order.items.map((item, index) => (
                        <tr key={item.item_number} style={{ backgroundColor: index % 2 === 0 ? "#ffffff" : "#fafcff" }}>
                          <td style={{ ...TD_STYLE, color: "#2563eb", fontWeight: "700" }}>{index === 0 ? activeAggregate.purchase_order?.po_number : ""}</td>
                          <td style={TD_STYLE}>{item.item_number}</td>
                          <td style={TD_STYLE}>{item.material || ""}</td>
                          <td style={TD_STYLE}>{item.material_description || ""}</td>
                          <td style={{ ...TD_STYLE, textAlign: "right" }}>{item.quantity}</td>
                          <td style={{ ...TD_STYLE, textAlign: "right" }}>{formatCurrency(item.price)}</td>
                          <td style={{ ...TD_STYLE, textAlign: "right" }}>{formatCurrency(item.amount)}</td>
                          <td style={{ ...TD_STYLE, borderRight: "none" }}>{item.plant}</td>
                        </tr>
                      ))}
                    </DataTable>
                    <AttachmentSubCard
                      title="PO Attachments"
                      stage="PO"
                      reference={activeAggregate.purchase_order.po_number}
                      docs={linkedDocs.PO}
                      loading={docsLoading.PO}
                    />
                  </>
                ) : (
                  <div style={{ padding: "18px 20px", fontSize: "12px", color: "#8a8b8c" }}>No linked PO details found for this invoice.</div>
                )}
              </SectionTable>

              <SectionTable
                title="Linked Goods Receipt Note (GRN)"
                badge={activeAggregate.goods_receipt?.items.length ? `${activeAggregate.goods_receipt.items.length} item(s)` : undefined}
              >
                {activeAggregate.goods_receipt ? (
                  <>
                    <DataTable headers={["GRN Number", "Item Number", "Material", "Material Description", "Quantity", "Price", "Amount", "Plant", "Purchase Order"]}>
                      {activeAggregate.goods_receipt.items.map((item, index) => (
                        <tr key={item.item_number} style={{ backgroundColor: index % 2 === 0 ? "#ffffff" : "#fafcff" }}>
                          <td style={{ ...TD_STYLE, color: "#2563eb", fontWeight: "700" }}>{index === 0 ? activeAggregate.goods_receipt?.grn_number : ""}</td>
                          <td style={TD_STYLE}>{item.item_number}</td>
                          <td style={TD_STYLE}>{item.material || ""}</td>
                          <td style={TD_STYLE}>{item.material_description || ""}</td>
                          <td style={{ ...TD_STYLE, textAlign: "right" }}>{item.quantity}</td>
                          <td style={{ ...TD_STYLE, textAlign: "right" }}>{formatCurrency(item.price)}</td>
                          <td style={{ ...TD_STYLE, textAlign: "right" }}>{formatCurrency(item.amount)}</td>
                          <td style={TD_STYLE}>{item.plant}</td>
                          <td style={{ ...TD_STYLE, borderRight: "none" }}>{item.purchase_order || activeAggregate.goods_receipt?.po_number || ""}</td>
                        </tr>
                      ))}
                    </DataTable>
                    <AttachmentSubCard
                      title="GRN Attachments"
                      stage="GRN"
                      reference={activeAggregate.goods_receipt.grn_number}
                      docs={linkedDocs.GRN}
                      loading={docsLoading.GRN}
                    />
                  </>
                ) : (
                  <div style={{ padding: "18px 20px", fontSize: "12px", color: "#8a8b8c" }}>No linked GRN details found for this invoice.</div>
                )}
              </SectionTable>
            </>
          ) : null}

          {hasSearched && selectedInvoice && !activeAggregate && !detailLoading ? (
            <SelectionPlaceholder
              title="No linked invoice chain available"
              description="The selected filters did not resolve to a complete invoice view yet. Try a linked PR, PO, or GRN that belongs to the same chain."
            />
          ) : null}
        </div>
      </div>

      <ModuleFooterAlerts
        error={error}
        infoMessage={usesSyntheticLinkage ? "A generated demo invoice linkage is being shown so the complete PR, PO, and GRN view can still be reviewed." : null}
        validation={null}
        idleMessage="Use Go to load invoice records. Searching by PR, PO, or GRN will now surface the linked invoice verification view automatically when a matching chain is available."
      />
    </div>
  );
}
