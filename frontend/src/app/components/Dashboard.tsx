import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FileText, ShoppingCart } from "lucide-react";
import { getDashboardStages, getDashboardSummary, getRecentActivity } from "../lib/api";
import { formatDateTime, statusTone } from "../lib/format";
import type { DashboardSummary, RecentActivityItem, StageKey, StageStatusRecord } from "../lib/types";
import { ProcurementChatbot } from "./ProcurementChatbot";

type SortKey = "type" | "total" | "uploaded" | "missing" | "ocrReview";

type SummaryRow = {
  type: string;
  total: number;
  uploaded: number;
  missing: number;
  ocrReview: number;
};

function stageLabel(stage: StageKey) {
  if (stage === "PR") return "Purchase Requisition (PR)";
  if (stage === "PO") return "Purchase Order (PO)";
  if (stage === "GRN") return "Goods Receipt Note (GRN)";
  return "Invoice Verification";
}

export function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [stages, setStages] = useState<Record<StageKey, StageStatusRecord[]> | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("type");
  const [sortAsc, setSortAsc] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, stageResponse, activityResponse] = await Promise.all([
        getDashboardSummary(),
        getDashboardStages(),
        getRecentActivity(10),
      ]);
      setSummary(summaryResponse);
      setStages(stageResponse);
      setRecentActivity(activityResponse.activities);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const summaryRows = useMemo<SummaryRow[]>(() => {
    if (!summary || !stages) return [];
    const rows: SummaryRow[] = ["PR", "PO", "GRN", "INVOICE"].map((stage) => ({
      type: stageLabel(stage as StageKey),
      total: summary.document_upload_status[stage as StageKey].total,
      uploaded: summary.document_upload_status[stage as StageKey].with_docs,
      missing: summary.document_upload_status[stage as StageKey].missing,
      ocrReview: stages[stage as StageKey].filter((item) =>
        item.documents.some((d) => d.ocr_status === "REVIEW" || d.ocr_status === "INVALID")
      ).length,
    }));

    const totals = rows.reduce(
      (acc, row) => ({
        type: "Total",
        total: acc.total + row.total,
        uploaded: acc.uploaded + row.uploaded,
        missing: acc.missing + row.missing,
        ocrReview: acc.ocrReview + row.ocrReview,
      }),
      { type: "Total", total: 0, uploaded: 0, missing: 0, ocrReview: 0 }
    );

    return [...rows, totals];
  }, [stages, summary]);

  const sortedRows = useMemo(() => {
    return [...summaryRows].sort((a, b) => {
      if (a.type === "Total") return 1;
      if (b.type === "Total") return -1;
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string")
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
  }, [sortAsc, sortKey, summaryRows]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((c) => !c);
    else { setSortKey(key); setSortAsc(true); }
  };

  /**
   * Called by ProcurementChatbot when the user clicks a "Navigate" action.
   * Maps chatbot screen names → your app routes.
   */
  const handleNavigate = (screen: string, id?: string) => {
    const routes: Record<string, string> = {
      PR_LIST: "/documents?tab=PR",
      PO_LIST: "/documents?tab=PO",
      GRN_LIST: "/documents?tab=GRN",
      INVOICE_LIST: "/documents?tab=INV",
      DASHBOARD: "/",
      NOTIFICATIONS: "/documents?tab=INV",
    };

    if (screen === "PR_DETAIL" && id) window.location.href = `/documents?tab=PR&doc=${id}&action=upload`;
    else if (screen === "PO_DETAIL" && id) window.location.href = `/documents?tab=PO&doc=${id}&action=upload`;
    else if (screen === "GRN_DETAIL" && id) window.location.href = `/documents?tab=GRN&doc=${id}&action=upload`;
    else if (screen === "INVOICE_DETAIL" && id) window.location.href = `/documents?tab=INV&doc=${id}&action=upload`;
    else if (routes[screen]) window.location.href = routes[screen];
  };

  const SortIcon = ({ column }: { column: SortKey }) =>
    sortKey === column ? (
      sortAsc ? <ChevronUp size={11} className="inline ml-1" /> : <ChevronDown size={11} className="inline ml-1" />
    ) : (
      <ChevronDown size={11} className="inline ml-1 opacity-30" />
    );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: "#6A6D70" }}>
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="p-0 h-full flex flex-col">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div
        className="px-5 py-3 border-b flex items-center justify-between flex-shrink-0"
        style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9" }}
      >
        <div>
          <div style={{ fontSize: "11px", color: "#8a8b8c" }}>Home</div>
          <h1 style={{ fontSize: "16px", fontWeight: "600", color: "#32363a", margin: 0 }}>Dashboard</h1>
        </div>
        <div style={{ fontSize: "11px", color: "#8a8b8c" }}>Live backend summary</div>
      </div>

      <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
        {error && (
          <div
            className="border px-4 py-3"
            style={{ borderColor: "#F0B2B2", backgroundColor: "#FBEAEA", color: "#BB0000", borderRadius: "2px", fontSize: "12px" }}
          >
            {error}
          </div>
        )}

        {/* ── KPI cards ─────────────────────────────────────────────── */}
        {summary && (
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total PR Documents", value: summary.document_upload_status.PR.with_docs,  sub: `${summary.document_upload_status.PR.missing} missing`,  icon: FileText,     color: "#0070F2", bg: "#E8F1FB" },
              { label: "Total PO Documents", value: summary.document_upload_status.PO.with_docs,  sub: `${summary.document_upload_status.PO.missing} missing`,  icon: ShoppingCart, color: "#107E3E", bg: "#EEF5EC" },
              { label: "OCR Reviews",        value: summary.ocr_summary.review + summary.ocr_summary.invalid, sub: `${summary.ocr_summary.valid} valid`,        icon: AlertTriangle, color: "#E9730C", bg: "#FEF3E8" },
              { label: "Unread Notifications", value: summary.notifications.unread, sub: `${summary.miro_sent} sent to MIRO`, icon: CheckCircle2, color: "#BB0000", bg: "#FBEAEA" },
            ].map((card) => (
              <div
                key={card.label}
                className="border flex items-center gap-3 p-3"
                style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9", borderRadius: "2px" }}
              >
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ width: "40px", height: "40px", backgroundColor: card.bg, borderRadius: "2px" }}
                >
                  <card.icon size={18} color={card.color} />
                </div>
                <div>
                  <div style={{ fontSize: "22px", fontWeight: "700", color: card.color, lineHeight: "1.1" }}>{card.value}</div>
                  <div style={{ fontSize: "11px", color: "#32363a", fontWeight: "500" }}>{card.label}</div>
                  <div style={{ fontSize: "10px", color: "#8a8b8c" }}>{card.sub}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tables ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          {/* Document summary */}
          <div className="border" style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9", borderRadius: "2px" }}>
            <div className="px-4 py-2 border-b flex items-center justify-between" style={{ borderColor: "#d9d9d9", backgroundColor: "#f5f5f5" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#32363a" }}>Document Summary</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f5f5f5", borderBottom: "1px solid #d9d9d9" }}>
                    {(["type", "total", "uploaded", "missing", "ocrReview"] as SortKey[]).map((col) => (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        className="text-left cursor-pointer select-none"
                        style={{ padding: "6px 12px", fontSize: "12px", fontWeight: "600", color: "#32363a", borderRight: "1px solid #e5e5e5", whiteSpace: "nowrap" }}
                      >
                        {col === "type" ? "Document Type" : col === "ocrReview" ? "OCR Review" : col.charAt(0).toUpperCase() + col.slice(1)}
                        <SortIcon column={col} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, i) => (
                    <tr key={row.type} style={{ borderBottom: "1px solid #eeeeee", backgroundColor: row.type === "Total" ? "#f5f5f5" : i % 2 === 0 ? "#ffffff" : "#fafafa" }}>
                      <td style={{ padding: "6px 12px", fontSize: "12px", color: "#32363a", fontWeight: row.type === "Total" ? "600" : "400", borderRight: "1px solid #e5e5e5" }}>{row.type}</td>
                      <td style={{ padding: "6px 12px", fontSize: "12px", color: "#32363a", borderRight: "1px solid #e5e5e5", textAlign: "right" }}>{row.total}</td>
                      <td style={{ padding: "6px 12px", fontSize: "12px", color: "#107E3E", borderRight: "1px solid #e5e5e5", textAlign: "right" }}>{row.uploaded}</td>
                      <td style={{ padding: "6px 12px", fontSize: "12px", color: row.missing > 0 ? "#BB0000" : "#32363a", borderRight: "1px solid #e5e5e5", textAlign: "right" }}>{row.missing}</td>
                      <td style={{ padding: "6px 12px", fontSize: "12px", color: row.ocrReview > 0 ? "#E9730C" : "#32363a", textAlign: "right" }}>{row.ocrReview}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="border" style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9", borderRadius: "2px" }}>
            <div className="px-4 py-2 border-b" style={{ borderColor: "#d9d9d9", backgroundColor: "#f5f5f5" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#32363a" }}>Recent Activity</span>
            </div>
            <div>
              {recentActivity.length === 0 ? (
                <div style={{ padding: "16px", fontSize: "12px", color: "#8a8b8c" }}>No recent document activity.</div>
              ) : (
                recentActivity.map((activity, index) => {
                  const tone = statusTone(activity.ocr_status);
                  return (
                    <div
                      key={activity._id}
                      className="px-4 py-3 border-b flex items-center justify-between"
                      style={{ borderColor: index === recentActivity.length - 1 ? "transparent" : "#eeeeee" }}
                    >
                      <div>
                        <div style={{ fontSize: "12px", color: "#32363a", fontWeight: "500" }}>{activity.original_filename}</div>
                        <div style={{ fontSize: "11px", color: "#8a8b8c" }}>{activity.stage} {activity.reference_number} • {formatDateTime(activity.uploaded_at)}</div>
                      </div>
                      <span style={{ fontSize: "11px", color: tone.color, backgroundColor: tone.bg, padding: "2px 6px", borderRadius: "2px", fontWeight: "600" }}>{activity.ocr_status}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Chatbot (floating button + window, powered by Gemini 2.0 Flash) ── */}
      <ProcurementChatbot onNavigate={handleNavigate} apiBase="" />
    </div>
  );
}
