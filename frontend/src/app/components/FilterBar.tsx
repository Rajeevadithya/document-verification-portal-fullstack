import { useEffect, useMemo, useState } from "react";
import { HelpCircle, Search, X } from "lucide-react";
import { ValueHelpDialog } from "./ValueHelpDialog";
import type { FrontendStageKey, ValueHelpItem } from "../lib/types";

type FilterBarProps = {
  docType: Exclude<FrontendStageKey, never>;
  onSearch: (filters: FilterValues) => void;
  valueHelpItems: ValueHelpItem[];
  plants?: string[];
  values?: Partial<FilterValues>;
};

export type FilterValues = {
  docNumber: string;
  plant: string;
};

const DOC_LABELS: Record<FrontendStageKey, string> = {
  PR: "PR Number",
  PO: "PO Number",
  GRN: "GRN Number",
  INV: "Invoice Number",
};

const VH_TITLES: Record<FrontendStageKey, string> = {
  PR: "Purchase Requisition",
  PO: "Purchase Order",
  GRN: "Goods Receipt Note",
  INV: "Invoice",
};

export function FilterBar({ docType, onSearch, valueHelpItems, plants = [], values }: FilterBarProps) {
  const [docNumber, setDocNumber] = useState("");
  const [plant, setPlant] = useState("");
  const [vhOpen, setVhOpen] = useState(false);

  useEffect(() => {
    setDocNumber(values?.docNumber ?? "");
    setPlant(values?.plant ?? "");
  }, [values?.docNumber, values?.plant]);

  const availablePlants = useMemo(() => plants.filter(Boolean), [plants]);

  const handleSearch = () => {
    onSearch({ docNumber, plant });
  };

  const handleClear = () => {
    const cleared = { docNumber: "", plant: "" };
    setDocNumber("");
    setPlant("");
    onSearch(cleared);
  };

  return (
    <>
      <div className="px-4 py-3 border-b" style={{ backgroundColor: "#f5f5f5", borderColor: "#d9d9d9" }}>
        <div className="flex items-center gap-1 mb-2" style={{ fontSize: "11px", fontWeight: "600", color: "#32363a" }}>
          <Search size={12} />
          <span>FILTER BAR</span>
          <span style={{ color: "#8a8b8c", fontWeight: "400", marginLeft: "4px" }}>— Enter search criteria and press Search</span>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label style={{ fontSize: "11px", color: "#32363a", fontWeight: "500" }}>{DOC_LABELS[docType]}</label>
            <div className="flex">
              <input
                type="text"
                value={docNumber}
                onChange={(event) => setDocNumber(event.target.value)}
                placeholder={`e.g. ${docType === "PR" ? "PR-1001" : docType === "PO" ? "PO-2001" : docType === "GRN" ? "GRN-3001" : "INV-4001"}`}
                className="border px-2 py-1 outline-none"
                style={{ fontSize: "12px", borderColor: "#d9d9d9", borderRight: "none", width: "130px", color: "#32363a", borderRadius: "2px 0 0 2px", backgroundColor: "#ffffff" }}
              />
              <button onClick={() => setVhOpen(true)} title="Value Help" className="border flex items-center justify-center hover:bg-blue-50" style={{ width: "26px", height: "26px", borderColor: "#d9d9d9", backgroundColor: "#ffffff", borderRadius: "0 2px 2px 0", flexShrink: 0 }}>
                <HelpCircle size={13} color="#0070F2" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label style={{ fontSize: "11px", color: "#32363a", fontWeight: "500" }}>Plant</label>
            <select value={plant} onChange={(event) => setPlant(event.target.value)} className="border px-2 py-1 outline-none" style={{ fontSize: "12px", borderColor: "#d9d9d9", width: "120px", color: "#32363a", borderRadius: "2px", backgroundColor: "#ffffff", height: "26px" }}>
              <option value="">All Plants</option>
              {availablePlants.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          <div className="flex items-end gap-2 pb-0">
            <button onClick={handleSearch} className="flex items-center gap-1 px-4 py-1 border hover:opacity-90" style={{ fontSize: "12px", backgroundColor: "#0070F2", color: "#ffffff", borderColor: "#0070F2", borderRadius: "2px", height: "26px", fontWeight: "500" }}>
              <Search size={12} /> Search
            </button>
            <button onClick={handleClear} className="flex items-center gap-1 px-4 py-1 border hover:bg-gray-100" style={{ fontSize: "12px", backgroundColor: "#ffffff", color: "#32363a", borderColor: "#d9d9d9", borderRadius: "2px", height: "26px" }}>
              <X size={12} /> Clear
            </button>
          </div>
        </div>
      </div>

      {vhOpen && (
        <ValueHelpDialog
          title={VH_TITLES[docType]}
          items={valueHelpItems}
          onSelect={(item) => {
            setDocNumber(item.id);
            setVhOpen(false);
            onSearch({ docNumber: item.id, plant });
          }}
          onClose={() => setVhOpen(false)}
        />
      )}
    </>
  );
}
