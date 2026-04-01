import { useState } from "react";
import { Search, X } from "lucide-react";

export type ValueHelpItem = {
  id: string;
  description: string;
  plant?: string;
  vendor?: string;
  status?: string;
};

type Props = {
  title: string;
  items: ValueHelpItem[];
  onSelect: (item: ValueHelpItem) => void;
  onClose: () => void;
  columns?: { key: keyof ValueHelpItem; label: string }[];
};

const defaultColumns: { key: keyof ValueHelpItem; label: string }[] = [
  { key: "id", label: "Number" },
];

export function ValueHelpDialog({ title, items, onSelect, onClose, columns = defaultColumns }: Props) {
  const [search, setSearch] = useState("");

  const filtered = items.filter((item) => {
    const matchSearch =
      !search ||
      Object.values(item).some((v) => v && String(v).toLowerCase().includes(search.toLowerCase()));
    return matchSearch;
  });

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex flex-col border shadow-xl"
        style={{
          width: "600px",
          maxHeight: "500px",
          backgroundColor: "#ffffff",
          borderColor: "#d9d9d9",
          borderRadius: "2px",
        }}
      >
        {/* Dialog Header */}
        <div
          className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0"
          style={{ backgroundColor: "#003B62", borderColor: "#d9d9d9" }}
        >
          <div className="flex items-center gap-2">
            <Search size={14} color="#ffffff" />
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#ffffff" }}>
              {title}
            </span>
          </div>
          <button onClick={onClose}>
            <X size={14} color="#ffffff" />
          </button>
        </div>

        {/* Filter Row */}
        <div
          className="px-4 py-2 border-b flex items-center gap-3 flex-shrink-0"
          style={{ backgroundColor: "#f5f5f5", borderColor: "#d9d9d9" }}
        >
          <div className="flex items-center gap-1 flex-1">
            <span style={{ fontSize: "11px", color: "#32363a", fontWeight: "500", whiteSpace: "nowrap" }}>Search:</span>
            <div className="relative flex-1">
              <Search size={12} color="#8a8b8c" className="absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by number..."
                className="w-full border pl-6 pr-2 py-1 outline-none"
                style={{
                  fontSize: "12px",
                  borderColor: "#d9d9d9",
                  borderRadius: "2px",
                }}
              />
            </div>
          </div>
          <button
            onClick={() => { setSearch(""); }}
            className="border px-3 py-1 hover:bg-gray-100"
            style={{ fontSize: "11px", borderColor: "#d9d9d9", color: "#32363a", borderRadius: "2px" }}
          >
            Clear
          </button>
        </div>

        {/* Results count */}
        <div className="px-4 py-1 flex-shrink-0" style={{ backgroundColor: "#ffffff", borderBottom: "1px solid #eeeeee" }}>
          <span style={{ fontSize: "11px", color: "#8a8b8c" }}>{filtered.length} result(s) found</span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
              <tr style={{ backgroundColor: "#f5f5f5", borderBottom: "1px solid #d9d9d9" }}>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="text-left"
                    style={{
                      padding: "6px 12px",
                      fontSize: "11px",
                      fontWeight: "600",
                      color: "#32363a",
                      borderRight: "1px solid #e5e5e5",
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} style={{ padding: "20px", textAlign: "center", fontSize: "12px", color: "#8a8b8c" }}>
                    No records found
                  </td>
                </tr>
              ) : (
                filtered.map((item, i) => (
                  <tr
                    key={item.id}
                    onClick={() => onSelect(item)}
                    className="cursor-pointer hover:bg-blue-50"
                    style={{
                      borderBottom: "1px solid #eeeeee",
                      backgroundColor: i % 2 === 0 ? "#ffffff" : "#fafafa",
                    }}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        style={{
                          padding: "5px 12px",
                          fontSize: "12px",
                          color: col.key === "id" ? "#0070F2" : "#32363a",
                          fontWeight: col.key === "id" ? "500" : "400",
                          borderRight: "1px solid #e5e5e5",
                        }}
                      >
                        {item[col.key] || "—"}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t flex justify-end gap-2 flex-shrink-0" style={{ borderColor: "#d9d9d9", backgroundColor: "#f5f5f5" }}>
          <button
            onClick={onClose}
            className="border px-4 py-1 hover:bg-gray-100"
            style={{ fontSize: "12px", borderColor: "#d9d9d9", color: "#32363a", borderRadius: "2px" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
