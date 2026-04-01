import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { ChevronDown } from "lucide-react";
import { GRNModule } from "./modules/GRNModule";
import { InvoiceModule } from "./modules/InvoiceModule";
import { POModule } from "./modules/POModule";
import { PRModule } from "./modules/PRModule";

const MAIN_TABS = [
  { id: "PR", label: "Purchase Requisition (PR)" },
  { id: "PO", label: "Purchase Orders (PO)" },
  { id: "GRN", label: "Goods Receipt Note (GRN)" },
  { id: "INV", label: "Invoice Verification" },
] as const;

export function DocumentUploads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const defaultTab = useMemo(() => (MAIN_TABS.some((tab) => tab.id === requestedTab) ? requestedTab! : "PR"), [requestedTab]);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const changeTabAction = (tab: string, action: "upload" | "change" | "view") => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    next.delete("doc");
    next.set("action", action);
    setActiveTab(tab);
    setSearchParams(next, { replace: true });
    setOpenMenu(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b flex items-center justify-between flex-shrink-0" style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9" }}>
        <div>
          <div style={{ fontSize: "11px", color: "#8a8b8c" }}>Home &rsaquo; Invoice Verification</div>
          <h1 style={{ fontSize: "16px", fontWeight: "600", color: "#32363a", margin: 0 }}>Invoice Verification</h1>
        </div>
      </div>

      <div ref={menuRef} className="px-5 py-3 border-b flex-shrink-0" style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9" }}>
        <div className="flex items-center gap-1 flex-wrap">
          {MAIN_TABS.map((tab, index) => (
            <div key={tab.id} className="flex items-center">
              <div
                className="relative"
              >
                <button
                  onClick={() => setOpenMenu((current) => (current === tab.id ? null : tab.id))}
                  className="px-3 py-2 flex items-center gap-1 transition-colors"
                  style={{
                    fontSize: "12px",
                    fontWeight: activeTab === tab.id ? "700" : "500",
                    color: activeTab === tab.id ? "#0070F2" : "#32363a",
                    backgroundColor: openMenu === tab.id || activeTab === tab.id ? "#f1f5f9" : "transparent",
                    borderRadius: "999px",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>{tab.label}</span>
                  <ChevronDown size={14} />
                </button>

                {openMenu === tab.id && (
                  <div
                    className="absolute left-0 top-full mt-2 border"
                    style={{ minWidth: "190px", backgroundColor: "#ffffff", borderColor: "#d9d9d9", borderRadius: "12px", boxShadow: "0 12px 32px rgba(15, 23, 42, 0.12)", zIndex: 10 }}
                  >
                    {(tab.id === "INV"
                      ? [{ id: "view", label: "Display Data" }]
                      : [
                          { id: "upload", label: "Upload Document" },
                          { id: "change", label: "Change Document" },
                          { id: "view", label: "Display Document" },
                        ]).map((action) => (
                      <button
                        key={action.id}
                        onClick={() => changeTabAction(tab.id, action.id as "upload" | "change" | "view")}
                        className="w-full text-left px-4 py-3 hover:bg-slate-100 transition-colors"
                        style={{ fontSize: "12px", color: "#32363a", backgroundColor: "transparent" }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {index < MAIN_TABS.length - 1 ? (
                <span style={{ marginLeft: "10px", marginRight: "10px", color: "#94a3b8" }}>|</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "PR" && <PRModule />}
        {activeTab === "PO" && <POModule />}
        {activeTab === "GRN" && <GRNModule />}
        {activeTab === "INV" && <InvoiceModule />}
      </div>
    </div>
  );
}
