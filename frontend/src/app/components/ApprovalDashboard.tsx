import { useState } from "react";
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";

type ApprovalStatus = "Pending" | "Approved" | "Rejected";

type ApprovalRecord = {
  id: string;
  docNumber: string;
  type: string;
  submittedBy: string;
  date: string;
  amount: string;
  priority: "High" | "Medium" | "Low";
  status: ApprovalStatus;
  remarks: string;
};

const INITIAL_DATA: ApprovalRecord[] = [
  { id: "1", docNumber: "PO2001", type: "Purchase Order", submittedBy: "Ravi Kumar", date: "2025-03-20", amount: "₹73,000", priority: "High", status: "Pending", remarks: "" },
  { id: "2", docNumber: "PO2002", type: "Purchase Order", submittedBy: "Jane Smith", date: "2025-03-21", amount: "₹62,500", priority: "High", status: "Pending", remarks: "" },
  { id: "3", docNumber: "PR1001", type: "Purchase Requisition", submittedBy: "Sree Reddy Malireddy", date: "2025-03-18", amount: "₹45,000", priority: "Medium", status: "Pending", remarks: "" },
  { id: "4", docNumber: "PR1002", type: "Purchase Requisition", submittedBy: "Priya Nair", date: "2025-03-19", amount: "₹32,000", priority: "High", status: "Pending", remarks: "" },
  { id: "5", docNumber: "GR3001", type: "Goods Receipt Note", submittedBy: "Ravi Kumar", date: "2025-03-22", amount: "₹73,000", priority: "Medium", status: "Approved", remarks: "Verified and approved" },
  { id: "6", docNumber: "PR1003", type: "Purchase Requisition", submittedBy: "Sree Reddy Malireddy", date: "2025-03-17", amount: "₹28,000", priority: "Low", status: "Approved", remarks: "Standard procurement" },
  { id: "7", docNumber: "INV4001", type: "Invoice Verification", submittedBy: "Priya Nair", date: "2025-03-23", amount: "₹1,00,000", priority: "High", status: "Pending", remarks: "" },
  { id: "8", docNumber: "GR3002", type: "Goods Receipt Note", submittedBy: "Jane Smith", date: "2025-03-24", amount: "₹37,500", priority: "Medium", status: "Rejected", remarks: "Partial delivery - quantity mismatch" },
];

const STATUS_STYLE: Record<ApprovalStatus, { color: string; bg: string }> = {
  Pending: { color: "#E9730C", bg: "#FEF3E8" },
  Approved: { color: "#107E3E", bg: "#EEF5EC" },
  Rejected: { color: "#BB0000", bg: "#FBEAEA" },
};

const PRIORITY_STYLE: Record<string, { color: string }> = {
  High: { color: "#BB0000" },
  Medium: { color: "#E9730C" },
  Low: { color: "#32363a" },
};

type SortKey = keyof ApprovalRecord;

export function ApprovalDashboard() {
  const [records, setRecords] = useState(INITIAL_DATA);
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [remarksModal, setRemarksModal] = useState<{ id: string; action: "Approve" | "Reject" } | null>(null);
  const [remarksText, setRemarksText] = useState("");
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const filtered = records
    .filter((r) => (statusFilter === "All" || r.status === statusFilter) && (typeFilter === "All" || r.type === typeFilter))
    .sort((a, b) => {
      const av = a[sortKey] as string;
      const bv = b[sortKey] as string;
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });

  const handleAction = (id: string, action: "Approve" | "Reject") => {
    setRemarksModal({ id, action });
    setRemarksText("");
  };

  const confirmAction = () => {
    if (!remarksModal) return;
    setRecords((prev) =>
      prev.map((r) =>
        r.id === remarksModal.id
          ? { ...r, status: remarksModal.action === "Approve" ? "Approved" : "Rejected", remarks: remarksText || (remarksModal.action === "Approve" ? "Approved" : "Rejected") }
          : r
      )
    );
    setRemarksModal(null);
    setRemarksText("");
  };

  const toggleRow = (id: string) =>
    setSelectedRows((prev) => prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]);

  const bulkApprove = () => {
    setRecords((prev) =>
      prev.map((r) => selectedRows.includes(r.id) && r.status === "Pending" ? { ...r, status: "Approved", remarks: "Bulk approved" } : r)
    );
    setSelectedRows([]);
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? (sortAsc ? <ChevronUp size={10} className="inline ml-1" /> : <ChevronDown size={10} className="inline ml-1" />) : <ChevronDown size={10} className="inline ml-1 opacity-30" />;

  const counts = {
    pending: records.filter((r) => r.status === "Pending").length,
    approved: records.filter((r) => r.status === "Approved").length,
    rejected: records.filter((r) => r.status === "Rejected").length,
  };

  const docTypes = ["All", ...Array.from(new Set(records.map((r) => r.type)))];

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="px-5 py-3 border-b flex items-center justify-between flex-shrink-0" style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9" }}>
        <div>
          <div style={{ fontSize: "11px", color: "#8a8b8c" }}>Home &rsaquo; Approval Dashboard</div>
          <h1 style={{ fontSize: "16px", fontWeight: "600", color: "#32363a", margin: 0 }}>Approval Dashboard</h1>
        </div>
        {selectedRows.length > 0 && (
          <button onClick={bulkApprove} className="flex items-center gap-1 px-3 py-1 border"
            style={{ fontSize: "12px", backgroundColor: "#107E3E", color: "#ffffff", borderColor: "#107E3E", borderRadius: "2px" }}>
            <CheckCircle size={13} />
            Approve Selected ({selectedRows.length})
          </button>
        )}
      </div>

      {/* Stats Row */}
      <div className="flex gap-0 border-b flex-shrink-0" style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9" }}>
        {[
          { label: "Pending", count: counts.pending, color: "#E9730C", bg: "#FEF3E8", icon: Clock },
          { label: "Approved", count: counts.approved, color: "#107E3E", bg: "#EEF5EC", icon: CheckCircle },
          { label: "Rejected", count: counts.rejected, color: "#BB0000", bg: "#FBEAEA", icon: XCircle },
        ].map((s) => (
          <button
            key={s.label}
            onClick={() => setStatusFilter(statusFilter === s.label ? "All" : s.label)}
            className="flex items-center gap-2 px-5 py-3 border-r hover:opacity-80"
            style={{
              borderColor: "#d9d9d9",
              backgroundColor: statusFilter === s.label ? s.bg : "#ffffff",
              borderBottom: statusFilter === s.label ? `2px solid ${s.color}` : "2px solid transparent",
            }}
          >
            <s.icon size={14} color={s.color} />
            <span style={{ fontSize: "20px", fontWeight: "700", color: s.color }}>{s.count}</span>
            <span style={{ fontSize: "11px", color: "#32363a", fontWeight: "500" }}>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="px-4 py-2 border-b flex items-center gap-3 flex-shrink-0" style={{ backgroundColor: "#f5f5f5", borderColor: "#d9d9d9" }}>
        <div className="flex items-center gap-2">
          <label style={{ fontSize: "11px", fontWeight: "500", color: "#32363a" }}>Status:</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border px-2 py-1 outline-none" style={{ fontSize: "12px", borderColor: "#d9d9d9", color: "#32363a", borderRadius: "2px", backgroundColor: "#ffffff", height: "26px" }}>
            <option value="All">All</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label style={{ fontSize: "11px", fontWeight: "500", color: "#32363a" }}>Document Type:</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="border px-2 py-1 outline-none" style={{ fontSize: "12px", borderColor: "#d9d9d9", color: "#32363a", borderRadius: "2px", backgroundColor: "#ffffff", height: "26px" }}>
            {docTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <span style={{ fontSize: "11px", color: "#8a8b8c", marginLeft: "auto" }}>{filtered.length} record(s)</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
            <tr style={{ backgroundColor: "#f5f5f5", borderBottom: "1px solid #d9d9d9" }}>
              <th style={{ width: "32px", padding: "6px 8px", borderRight: "1px solid #e5e5e5" }}>
                <input type="checkbox"
                  onChange={(e) => {
                    if (e.target.checked) setSelectedRows(filtered.filter((r) => r.status === "Pending").map((r) => r.id));
                    else setSelectedRows([]);
                  }}
                />
              </th>
              {(["docNumber", "type", "submittedBy", "date", "amount", "priority", "status"] as SortKey[]).map((col) => {
                const labels: Record<string, string> = {
                  docNumber: "Document Number", type: "Type", submittedBy: "Submitted By",
                  date: "Date", amount: "Amount", priority: "Priority", status: "Status"
                };
                return (
                  <th key={col} onClick={() => handleSort(col)} className="text-left cursor-pointer select-none"
                    style={{ padding: "6px 12px", fontSize: "11px", fontWeight: "600", color: "#32363a", borderRight: "1px solid #e5e5e5", whiteSpace: "nowrap" }}>
                    {labels[col]}<SortIcon col={col} />
                  </th>
                );
              })}
              <th className="text-left" style={{ padding: "6px 12px", fontSize: "11px", fontWeight: "600", color: "#32363a", borderRight: "1px solid #e5e5e5" }}>Remarks</th>
              <th className="text-left" style={{ padding: "6px 12px", fontSize: "11px", fontWeight: "600", color: "#32363a" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: "24px", textAlign: "center", fontSize: "12px", color: "#8a8b8c" }}>No records found for current filter.</td></tr>
            ) : filtered.map((row, i) => {
              const st = STATUS_STYLE[row.status];
              const isSelected = selectedRows.includes(row.id);
              return (
                <tr key={row.id} style={{ borderBottom: "1px solid #eeeeee", backgroundColor: isSelected ? "#EAF1FF" : i % 2 === 0 ? "#ffffff" : "#fafafa" }}>
                  <td style={{ padding: "5px 8px", borderRight: "1px solid #e5e5e5", textAlign: "center" }}>
                    {row.status === "Pending" && (
                      <input type="checkbox" checked={isSelected} onChange={() => toggleRow(row.id)} />
                    )}
                  </td>
                  <td style={{ padding: "5px 12px", fontSize: "12px", color: "#0070F2", fontWeight: "500", borderRight: "1px solid #e5e5e5", whiteSpace: "nowrap" }}>{row.docNumber}</td>
                  <td style={{ padding: "5px 12px", fontSize: "12px", color: "#32363a", borderRight: "1px solid #e5e5e5", whiteSpace: "nowrap" }}>{row.type}</td>
                  <td style={{ padding: "5px 12px", fontSize: "12px", color: "#32363a", borderRight: "1px solid #e5e5e5" }}>{row.submittedBy}</td>
                  <td style={{ padding: "5px 12px", fontSize: "12px", color: "#32363a", borderRight: "1px solid #e5e5e5", whiteSpace: "nowrap" }}>{row.date}</td>
                  <td style={{ padding: "5px 12px", fontSize: "12px", color: "#32363a", borderRight: "1px solid #e5e5e5", textAlign: "right", whiteSpace: "nowrap" }}>{row.amount}</td>
                  <td style={{ padding: "5px 12px", borderRight: "1px solid #e5e5e5" }}>
                    <span style={{ fontSize: "11px", color: PRIORITY_STYLE[row.priority].color, fontWeight: "600" }}>
                      {row.priority === "High" ? "● " : row.priority === "Medium" ? "○ " : "· "}{row.priority}
                    </span>
                  </td>
                  <td style={{ padding: "5px 12px", borderRight: "1px solid #e5e5e5" }}>
                    <span style={{ fontSize: "11px", color: st.color, backgroundColor: st.bg, padding: "1px 6px", borderRadius: "2px", fontWeight: "500" }}>{row.status}</span>
                  </td>
                  <td style={{ padding: "5px 12px", fontSize: "11px", color: "#6a6d70", borderRight: "1px solid #e5e5e5", maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.remarks || "—"}
                  </td>
                  <td style={{ padding: "5px 12px" }}>
                    {row.status === "Pending" ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleAction(row.id, "Approve")}
                          className="flex items-center gap-1 px-3 py-1 border hover:opacity-80"
                          style={{ fontSize: "11px", backgroundColor: "#107E3E", color: "#ffffff", borderColor: "#107E3E", borderRadius: "2px", whiteSpace: "nowrap" }}>
                          <CheckCircle size={11} />Approve
                        </button>
                        <button onClick={() => handleAction(row.id, "Reject")}
                          className="flex items-center gap-1 px-3 py-1 border hover:opacity-80"
                          style={{ fontSize: "11px", backgroundColor: "#BB0000", color: "#ffffff", borderColor: "#BB0000", borderRadius: "2px", whiteSpace: "nowrap" }}>
                          <XCircle size={11} />Reject
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: "11px", color: "#8a8b8c" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Remarks Modal */}
      {remarksModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="border shadow-xl" style={{ width: "400px", backgroundColor: "#ffffff", borderColor: "#d9d9d9", borderRadius: "2px" }}>
            <div className="px-4 py-3 border-b flex items-center gap-2"
              style={{ backgroundColor: remarksModal.action === "Approve" ? "#107E3E" : "#BB0000", borderColor: "#d9d9d9" }}>
              {remarksModal.action === "Approve" ? <CheckCircle size={16} color="#ffffff" /> : <XCircle size={16} color="#ffffff" />}
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#ffffff" }}>
                {remarksModal.action} Document
              </span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div style={{ fontSize: "12px", color: "#32363a" }}>
                You are about to <strong>{remarksModal.action.toLowerCase()}</strong> document <strong>{records.find((r) => r.id === remarksModal.id)?.docNumber}</strong>.
              </div>
              <div className="flex flex-col gap-1">
                <label style={{ fontSize: "11px", fontWeight: "500", color: "#32363a" }}>Remarks (Optional)</label>
                <textarea
                  value={remarksText}
                  onChange={(e) => setRemarksText(e.target.value)}
                  placeholder="Enter remarks..."
                  rows={3}
                  className="border px-2 py-1 outline-none resize-none"
                  style={{ fontSize: "12px", borderColor: "#d9d9d9", borderRadius: "2px", color: "#32363a" }}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setRemarksModal(null)}
                  className="px-4 py-1 border hover:bg-gray-100"
                  style={{ fontSize: "12px", borderColor: "#d9d9d9", color: "#32363a", borderRadius: "2px" }}>
                  Cancel
                </button>
                <button onClick={confirmAction}
                  className="px-4 py-1 border"
                  style={{
                    fontSize: "12px",
                    backgroundColor: remarksModal.action === "Approve" ? "#107E3E" : "#BB0000",
                    color: "#ffffff",
                    borderColor: remarksModal.action === "Approve" ? "#107E3E" : "#BB0000",
                    borderRadius: "2px",
                  }}>
                  Confirm {remarksModal.action}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
