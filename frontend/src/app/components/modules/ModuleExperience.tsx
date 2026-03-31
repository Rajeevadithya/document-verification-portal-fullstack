import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "../ui/skeleton";
import type { StageDocument } from "../../lib/types";

type ValidationState = {
  ocr_status: string;
  ocr_rejection_detail?: StageDocument["ocr_rejection_detail"];
} | null;

type AlertTone = "error" | "success" | "warning" | "neutral";

type FooterAlert = {
  key: string;
  title: string;
  description: string;
  tone: AlertTone;
};

function toneStyles(tone: AlertTone) {
  if (tone === "error") return { borderColor: "#F0B2B2", backgroundColor: "#FBEAEA", color: "#BB0000", icon: AlertCircle };
  if (tone === "success") return { borderColor: "#B7E0C1", backgroundColor: "#EEF5EC", color: "#107E3E", icon: CheckCircle2 };
  if (tone === "warning") return { borderColor: "#F5D2A8", backgroundColor: "#FEF3E8", color: "#E9730C", icon: AlertTriangle };
  return { borderColor: "#d9d9d9", backgroundColor: "#f7f7f7", color: "#6A6D70", icon: AlertCircle };
}

function getValidationAlert(validation: ValidationState): FooterAlert | null {
  if (!validation) return null;

  if (validation.ocr_status === "VALID") {
    return {
      key: "ocr-valid",
      title: "OCR validation passed",
      description: validation.ocr_rejection_detail?.summary || "All OCR checks passed for the latest uploaded document.",
      tone: "success",
    };
  }

  if (validation.ocr_status === "INVALID" || validation.ocr_status === "REVIEW") {
    return {
      key: "ocr-review",
      title: validation.ocr_status === "INVALID" ? "Document rejected by OCR" : "OCR review required",
      description:
        validation.ocr_rejection_detail?.summary ||
        validation.ocr_rejection_detail?.overall_advice ||
        "The latest document needs attention before it can move forward.",
      tone: "warning",
    };
  }

  return {
    key: "ocr-pending",
    title: "OCR validation pending",
    description: "The latest document is still waiting for OCR validation.",
    tone: "neutral",
  };
}

export function ModuleFooterAlerts({
  error,
  infoMessage,
  validation,
  idleMessage,
}: {
  error?: string | null;
  infoMessage?: string | null;
  validation?: ValidationState;
  idleMessage: string;
}) {
  const alerts: FooterAlert[] = [];

  if (error) {
    alerts.push({
      key: "error",
      title: "Action could not be completed",
      description: error,
      tone: "error",
    });
  }

  if (infoMessage) {
    alerts.push({
      key: "info",
      title: "Latest update",
      description: infoMessage,
      tone: "success",
    });
  }

  const validationAlert = getValidationAlert(validation ?? null);
  if (validationAlert) alerts.push(validationAlert);

  return (
    <div className="border-t px-4 py-3 flex-shrink-0" style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9" }}>
      <div className="flex items-center gap-2 mb-2" style={{ fontSize: "11px", fontWeight: "600", color: "#32363a" }}>
        <AlertCircle size={12} />
        <span>FOOTER ALERTS</span>
      </div>
      {alerts.length === 0 ? (
        <div className="border px-3 py-2" style={{ borderColor: "#d9d9d9", backgroundColor: "#f7f7f7", borderRadius: "2px", fontSize: "12px", color: "#6A6D70" }}>
          {idleMessage}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {alerts.map((alert) => {
            const tone = toneStyles(alert.tone);
            const Icon = tone.icon;
            return (
              <div key={alert.key} className="border px-3 py-2 flex items-start gap-2 flex-1 min-w-[260px]" style={{ borderColor: tone.borderColor, backgroundColor: tone.backgroundColor, borderRadius: "2px" }}>
                <Icon size={14} color={tone.color} className="mt-[2px] flex-shrink-0" />
                <div>
                  <div style={{ fontSize: "12px", fontWeight: "600", color: tone.color }}>{alert.title}</div>
                  <div style={{ fontSize: "11px", color: "#32363a", marginTop: "2px" }}>{alert.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SubTabPanel({
  transitioning,
  children,
}: {
  transitioning: boolean;
  children: ReactNode;
}) {
  if (transitioning) {
    return (
      <div className="border p-4 animate-pulse" style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9", borderRadius: "2px" }}>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-8 w-36" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: "module-tab-fade 0.22s ease" }}>
      {children}
      <style>{`@keyframes module-tab-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

export function SelectionPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border px-5 py-8 text-center" style={{ backgroundColor: "#ffffff", borderColor: "#d9d9d9", borderRadius: "2px" }}>
      <div style={{ fontSize: "13px", fontWeight: "600", color: "#32363a" }}>{title}</div>
      <div style={{ fontSize: "12px", color: "#8a8b8c", marginTop: "6px" }}>{description}</div>
    </div>
  );
}
