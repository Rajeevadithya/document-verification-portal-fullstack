import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export type TablePaginationProps = {
  totalItems: number;
  currentPage: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export function TablePagination({
  totalItems,
  currentPage,
  pageSize,
  pageSizeOptions = [10, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  // Generate page numbers with smart sliding window
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) pages.push("...");

      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);

      for (let i = start; i <= end; i++) pages.push(i);

      if (safeCurrentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const pageNumbers = getPageNumbers();

  const btnBaseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: "30px",
    minWidth: "30px",
    padding: "0 6px",
    fontSize: "12px",
    fontWeight: "600",
    borderRadius: "6px",
    border: "1px solid #d9d9d9",
    backgroundColor: "#ffffff",
    color: "#334155",
    cursor: "pointer",
    transition: "all 0.15s ease",
  };

  const btnDisabledStyle: React.CSSProperties = {
    ...btnBaseStyle,
    borderColor: "#e2e8f0",
    color: "#94a3b8",
    backgroundColor: "#f8fafc",
    cursor: "not-allowed",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "12px",
        padding: "10px 16px",
        backgroundColor: "#ffffff",
        borderTop: "1px solid #e2e8f0",
        fontSize: "12px",
        color: "#64748b",
      }}
    >
      {/* Left: Summary text */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <span>
          Showing <strong style={{ color: "#0f172a" }}>{startItem}</strong>–<strong style={{ color: "#0f172a" }}>{endItem}</strong> of{" "}
          <strong style={{ color: "#0f172a" }}>{totalItems}</strong> records
        </span>

        {/* Rows per page selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              const newSize = Number(e.target.value);
              onPageSizeChange(newSize);
              onPageChange(1);
            }}
            style={{
              padding: "3px 8px",
              fontSize: "12px",
              fontWeight: "600",
              color: "#0f172a",
              borderColor: "#cbd5e1",
              borderRadius: "6px",
              backgroundColor: "#ffffff",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right: Page navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        {/* First page */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={safeCurrentPage <= 1}
          style={safeCurrentPage <= 1 ? btnDisabledStyle : btnBaseStyle}
          title="First page"
        >
          <ChevronsLeft size={14} />
        </button>

        {/* Previous page */}
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage - 1)}
          disabled={safeCurrentPage <= 1}
          style={safeCurrentPage <= 1 ? btnDisabledStyle : btnBaseStyle}
          title="Previous page"
        >
          <ChevronLeft size={14} />
        </button>

        {/* Page numbers */}
        {pageNumbers.map((p, idx) => {
          if (p === "...") {
            return (
              <span key={`ellipsis-${idx}`} style={{ padding: "0 4px", color: "#94a3b8" }}>
                …
              </span>
            );
          }

          const isActive = p === safeCurrentPage;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              style={
                isActive
                  ? {
                      ...btnBaseStyle,
                      backgroundColor: "#0070F2",
                      borderColor: "#0070F2",
                      color: "#ffffff",
                    }
                  : btnBaseStyle
              }
            >
              {p}
            </button>
          );
        })}

        {/* Next page */}
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage + 1)}
          disabled={safeCurrentPage >= totalPages}
          style={safeCurrentPage >= totalPages ? btnDisabledStyle : btnBaseStyle}
          title="Next page"
        >
          <ChevronRight size={14} />
        </button>

        {/* Last page */}
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={safeCurrentPage >= totalPages}
          style={safeCurrentPage >= totalPages ? btnDisabledStyle : btnBaseStyle}
          title="Last page"
        >
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  );
}
