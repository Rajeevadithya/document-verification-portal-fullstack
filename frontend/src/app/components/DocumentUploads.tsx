import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Edit, Eye, Upload } from "lucide-react";
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

  const currentAction = (searchParams.get("action") as "upload" | "change" | "view" | null) ?? "view";

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const changeTab = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    next.delete("doc");
    setActiveTab(tab);
    setSearchParams(next, { replace: true });
  };

  const changeAction = (action: "upload" | "change" | "view") => {
    const next = new URLSearchParams(searchParams);
    next.set("action", action);
    setSearchParams(next, { replace: true });
  };

  const activeTabConfig = MAIN_TABS.find((t) => t.id === activeTab) ?? MAIN_TABS[0];
  const actionLabel = currentAction === "upload" ? "Upload Document" : currentAction === "change" ? "Change Document" : "Display Document";

  return (
    <div className="flex flex-col min-h-full">
      {/* Page Title & Breadcrumbs */}
      <div className="px-5 py-3 border-b flex items-center justify-between flex-shrink-0" style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9" }}>
        <div>
          <div style={{ fontSize: "11px", color: "#8a8b8c" }}>
            Home &rsaquo; Invoice Verification &rsaquo; {activeTabConfig.label} &rsaquo; <span style={{ color: "#0070F2", fontWeight: "600" }}>{actionLabel}</span>
          </div>
          <h1 style={{ fontSize: "16px", fontWeight: "600", color: "#32363a", margin: 0 }}>Invoice Verification</h1>
        </div>
      </div>

      {/* Navigation Bar: Stage Tabs (Row 1) + Selection Options (Row 2 below for all 4) */}
      <div
        className="px-5 py-3 border-b flex-shrink-0"
        style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9" }}
      >
        <div className="flex flex-col gap-2.5">
          {/* Row 1: Main Stage Tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            {MAIN_TABS.map((tab, index) => {
              const isSelected = activeTab === tab.id;
              return (
                <div key={tab.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => changeTab(tab.id)}
                    className="px-3.5 py-1.5 transition-colors"
                    style={{
                      fontSize: "12px",
                      fontWeight: isSelected ? "700" : "500",
                      color: isSelected ? "#0070F2" : "#32363a",
                      backgroundColor: isSelected ? "#eef5ff" : "transparent",
                      border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                      borderRadius: "999px",
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                    }}
                  >
                    <span>{tab.label}</span>
                  </button>

                  {index < MAIN_TABS.length - 1 ? (
                    <span style={{ marginLeft: "8px", marginRight: "8px", color: "#cbd5e1" }}>|</span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Row 2: Selection Options - Placed strictly below for all 4 stages */}
          <div className="flex items-center">
            {activeTab !== "INV" ? (
              <div
                className="flex items-center gap-1 p-1 rounded-xl"
                style={{ backgroundColor: "#f1f5f9", border: "1px solid #e2e8f0" }}
              >
                {[
                  { id: "view", label: "Display Document", icon: Eye },
                  { id: "upload", label: "Upload Document", icon: Upload },
                  { id: "change", label: "Change Document", icon: Edit },
                ].map((act) => {
                  const isActActive = currentAction === act.id;
                  return (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => changeAction(act.id as "upload" | "change" | "view")}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
                      style={{
                        backgroundColor: isActActive ? "#0070F2" : "transparent",
                        color: isActActive ? "#ffffff" : "#475569",
                        boxShadow: isActActive ? "0 1px 3px rgba(0, 112, 242, 0.25)" : "none",
                        cursor: "pointer",
                        border: "none",
                      }}
                    >
                      <act.icon size={13} />
                      <span>{act.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                className="flex items-center gap-1 p-1 rounded-xl"
                style={{ backgroundColor: "#f1f5f9", border: "1px solid #e2e8f0" }}
              >
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg"
                  style={{
                    backgroundColor: "#0070F2",
                    color: "#ffffff",
                    boxShadow: "0 1px 3px rgba(0, 112, 242, 0.25)",
                    cursor: "default",
                    border: "none",
                  }}
                >
                  <Eye size={13} />
                  <span>Display Document</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Modules */}
      <div className="flex-1">
        {activeTab === "PR" && <PRModule />}
        {activeTab === "PO" && <POModule />}
        {activeTab === "GRN" && <GRNModule />}
        {activeTab === "INV" && <InvoiceModule />}
      </div>
    </div>
  );
}
