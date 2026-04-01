import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronDown, HelpCircle, Search, X } from "lucide-react";
import { ValueHelpDialog } from "./ValueHelpDialog";
import type { FrontendStageKey, ValueHelpItem } from "../lib/types";

type FilterBarProps = {
  docType: FrontendStageKey;
  onSearch: (filters: FilterValues) => void;
  valueHelpItems: ValueHelpItem[];
  valueHelpSources?: Partial<Record<keyof FilterValues, ValueHelpItem[]>>;
  values?: Partial<FilterValues>;
  fieldOptions?: Partial<Record<keyof FilterValues, string[]>>;
};

export type FilterValues = {
  search: string;
  docNumber: string;
  plant: string;
  editingStatus: string;
  documentType: string;
  supplier: string;
  purchaseOrder: string;
  purchasingGroup: string;
  companyCode: string;
  status: string;
  material: string;
  purchaseOrderDate: string;
  stockChange: string;
  storageLocation: string;
  stockType: string;
  materialDocument: string;
  materialDocumentYear: string;
  postingDate: string;
  documentDate: string;
  prNumber: string;
  poNumber: string;
  grnNumber: string;
};

type FilterFieldConfig = {
  key: keyof FilterValues;
  label: string;
  type: "text" | "select" | "date" | "search" | "valueHelp";
  placeholder?: string;
  width?: string;
};

const EMPTY_FILTERS: FilterValues = {
  search: "",
  docNumber: "",
  plant: "",
  editingStatus: "",
  documentType: "",
  supplier: "",
  purchaseOrder: "",
  purchasingGroup: "",
  companyCode: "",
  status: "",
  material: "",
  purchaseOrderDate: "",
  stockChange: "",
  storageLocation: "",
  stockType: "",
  materialDocument: "",
  materialDocumentYear: "",
  postingDate: "",
  documentDate: "",
  prNumber: "",
  poNumber: "",
  grnNumber: "",
};

const DOC_LABELS: Record<FrontendStageKey, string> = {
  PR: "Purchase Requisition",
  PO: "Purchase Order",
  GRN: "Material Document",
  INV: "Invoice Number",
};

const FIELD_LAYOUTS: Record<FrontendStageKey, FilterFieldConfig[]> = {
  PR: [
    { key: "search", label: "Search", type: "search", placeholder: "Search", width: "280px" },
    { key: "editingStatus", label: "Editing Status", type: "select", width: "280px" },
    { key: "docNumber", label: "Purchase Requisition", type: "valueHelp", width: "280px" },
    { key: "documentType", label: "Document Type", type: "select", width: "280px" },
  ],
  PO: [
    { key: "search", label: "Search", type: "search", placeholder: "Search", width: "220px" },
    { key: "editingStatus", label: "Editing Status", type: "select", width: "220px" },
    { key: "supplier", label: "Supplier", type: "text", width: "220px" },
    { key: "purchaseOrder", label: "Purchase Order", type: "valueHelp", width: "220px" },
    { key: "purchasingGroup", label: "Purchasing Group", type: "text", width: "220px" },
    { key: "companyCode", label: "Company Code", type: "text", width: "220px" },
    { key: "status", label: "Status", type: "select", width: "220px" },
    { key: "material", label: "Material", type: "text", width: "220px" },
    { key: "plant", label: "Plant", type: "text", width: "220px" },
    { key: "purchaseOrderDate", label: "Purchase Order Date", type: "date", width: "220px" },
  ],
  GRN: [
    { key: "stockChange", label: "Stock Change", type: "select", width: "220px" },
    { key: "plant", label: "Plant", type: "text", width: "220px" },
    { key: "storageLocation", label: "Storage Location", type: "text", width: "220px" },
    { key: "stockType", label: "Stock Type", type: "text", width: "220px" },
    { key: "materialDocument", label: "Material Document", type: "valueHelp", width: "220px" },
    { key: "materialDocumentYear", label: "Material Document Year", type: "text", width: "220px" },
    { key: "material", label: "Material", type: "text", width: "220px" },
    { key: "postingDate", label: "Posting Date", type: "date", width: "220px" },
    { key: "documentDate", label: "Document Date", type: "date", width: "220px" },
  ],
  INV: [
    { key: "search", label: "Search", type: "search", placeholder: "Search", width: "220px" },
    { key: "docNumber", label: "Invoice Number", type: "valueHelp", width: "220px" },
    { key: "prNumber", label: "PR Number", type: "valueHelp", width: "220px" },
    { key: "poNumber", label: "PO Number", type: "valueHelp", width: "220px" },
    { key: "grnNumber", label: "GRN Number", type: "valueHelp", width: "220px" },
  ],
};

export function createEmptyFilterValues(overrides: Partial<FilterValues> = {}): FilterValues {
  return { ...EMPTY_FILTERS, ...overrides };
}

function hasAnyFilter(values: FilterValues): boolean {
  return Object.values(values).some((v) => v !== "");
}

function FieldInput({
  field,
  value,
  onChange,
  options,
  onValueHelp,
}: {
  field: FilterFieldConfig;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  onValueHelp: (key: keyof FilterValues) => void;
}) {
  const baseStyle = {
    fontSize: "12px",
    borderColor: "#cbd5e1",
    color: "#334155",
    backgroundColor: "#ffffff",
    height: "40px",
    width: field.width ?? "220px",
    borderRadius: "8px",
  } as const;

  if (field.type === "select") {
    return (
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="border px-3 py-2 outline-none appearance-none"
          style={baseStyle}
        >
          <option value="">All</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown size={16} color="#334155" style={{ position: "absolute", right: "12px", top: "12px", pointerEvents: "none" }} />
      </div>
    );
  }

  if (field.type === "valueHelp") {
    return (
      <div className="relative flex">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="border px-3 py-2 outline-none"
          style={{ ...baseStyle, borderTopRightRadius: "0", borderBottomRightRadius: "0", borderRight: "none" }}
        />
        <button
          type="button"
          onClick={() => onValueHelp(field.key)}
          className="border flex items-center justify-center hover:bg-slate-50"
          style={{ width: "40px", height: "40px", borderColor: "#cbd5e1", backgroundColor: "#ffffff", borderRadius: "0 8px 8px 0" }}
        >
          <HelpCircle size={16} color="#1d4ed8" />
        </button>
      </div>
    );
  }

  if (field.type === "search") {
    return (
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="border pl-4 pr-10 py-2 outline-none"
          style={baseStyle}
        />
        <Search size={18} color="#334155" style={{ position: "absolute", right: "12px", top: "11px" }} />
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <div className="relative">
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="border px-3 py-2 outline-none"
          style={baseStyle}
        />
        <CalendarDays size={16} color="#334155" style={{ position: "absolute", right: "12px", top: "12px", pointerEvents: "none" }} />
      </div>
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="border px-3 py-2 outline-none"
      style={baseStyle}
    />
  );
}

export function FilterBar({ docType, onSearch, valueHelpItems, valueHelpSources = {}, values, fieldOptions = {} }: FilterBarProps) {
  const [draft, setDraft] = useState<FilterValues>(createEmptyFilterValues(values));
  const [activeVhField, setActiveVhField] = useState<keyof FilterValues | null>(null);

  useEffect(() => {
    setDraft(createEmptyFilterValues(values));
  }, [values]);

  const fields = FIELD_LAYOUTS[docType];
  const title = DOC_LABELS[docType];
  const availableDocNumbers = useMemo(() => valueHelpItems.map((item) => item.id), [valueHelpItems]);
  const isDirty = hasAnyFilter(draft);
  const activeVhItems = activeVhField ? valueHelpSources[activeVhField] ?? valueHelpItems : valueHelpItems;
  const activeVhTitle = activeVhField ? fields.find((field) => field.key === activeVhField)?.label ?? title : title;

  const handleClearFilters = () => {
    const cleared = createEmptyFilterValues();
    setDraft(cleared);
    onSearch(cleared);
  };

  return (
    <>
      <div
        className="px-6 py-5 border-b"
        style={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", boxShadow: "0 1px 0 rgba(15, 23, 42, 0.04)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a" }}>Standard</div>
          <div style={{ fontSize: "12px", color: "#2563eb", fontWeight: "600" }}>{title}</div>
        </div>

        <div className="flex items-end gap-x-6 gap-y-4 flex-wrap">
          {fields.map((field) => (
            <div key={field.key} className="flex flex-col gap-1" style={{ minWidth: field.width }}>
              <label style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>{field.label}</label>
              <FieldInput
                field={field}
                value={draft[field.key]}
                onChange={(nextValue) => setDraft((current) => ({ ...current, [field.key]: nextValue }))}
                options={
                  field.key === "docNumber" || field.key === "purchaseOrder" || field.key === "materialDocument" || field.key === "prNumber" || field.key === "poNumber" || field.key === "grnNumber"
                    ? availableDocNumbers
                    : fieldOptions[field.key] ?? []
                }
                onValueHelp={(key) => setActiveVhField(key)}
              />
            </div>
          ))}

          <div className="flex items-center gap-4 ml-auto">
            <button
              type="button"
              onClick={() => onSearch(draft)}
              className="px-4 py-2"
              style={{
                fontSize: "12px",
                backgroundColor: "#1d4ed8",
                color: "#ffffff",
                borderRadius: "12px",
                minWidth: "56px",
                height: "40px",
                fontWeight: "700",
              }}
            >
              Go
            </button>

            {isDirty ? (
              <button
                type="button"
                onClick={handleClearFilters}
                className="flex items-center gap-1 text-left"
                style={{ fontSize: "12px", color: "#BB0000", fontWeight: "600" }}
              >
                <X size={13} />
                Clear Filters
              </button>
            ) : (
              <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: "500" }}>Clear Filters</span>
            )}
          </div>
        </div>
      </div>

      {activeVhField && (
        <ValueHelpDialog
          title={activeVhTitle}
          items={activeVhItems}
          onSelect={(item) => {
            setDraft((current) => ({
              ...current,
              [activeVhField]: item.id,
            }));
            setActiveVhField(null);
          }}
          onClose={() => setActiveVhField(null)}
        />
      )}
    </>
  );
}
