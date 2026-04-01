import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import {
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  MessageSquare,
  Minus,
  Send,
  X,
  XCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type NavigateAction = {
  type: "NAVIGATE" | "NONE";
  screen: string;
  id?: string;
};

type BotResponse = {
  message: string;
  action: NavigateAction;
  data: Record<string, unknown>[];
};

type Message = {
  id: string;
  from: "user" | "bot" | "error";
  text: string;
  response?: BotResponse;
  timestamp: Date;
};

type Props = {
  apiBase?: string;
};

// ── Suggestion chips ───────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "Show dashboard summary",
  "Which PRs are missing documents?",
  "Show OCR validation issues",
  "Recent upload activity",
  "Show unread notifications",
  "Show PO-2001",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2);

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ocrColor(status: string): { color: string; bg: string } {
  if (status === "VALID") return { color: "#107E3E", bg: "#EEF5EC" };
  if (status === "INVALID") return { color: "#BB0000", bg: "#FBEAEA" };
  if (status === "REVIEW") return { color: "#E9730C", bg: "#FEF3E8" };
  return { color: "#6A6D70", bg: "#f5f5f5" };
}

// ── Route resolver ─────────────────────────────────────────────────────────────
// Maps chatbot action { screen, id } → React Router path
function resolveRoute(screen: string, id?: string): string | null {
  if (!screen || screen === "NONE") return null;

  // Detail pages — id is the document number e.g. "9000000000", "PR-1001", "GRN-5"
  if (screen === "PR_DETAIL" && id) {
    // Strip any "PR-" prefix so the URL matches the route param format
    const ref = id.replace(/^PR-?/i, "");
    return `/documents/pr/${encodeURIComponent(ref)}`;
  }
  if (screen === "PO_DETAIL" && id) {
    const ref = id.replace(/^PO-?/i, "");
    return `/documents/po/${encodeURIComponent(ref)}`;
  }
  if (screen === "GRN_DETAIL" && id) {
    const ref = id.replace(/^GRN-?/i, "");
    return `/documents/grn/${encodeURIComponent(ref)}`;
  }
  if (screen === "INVOICE_DETAIL") {
    // Invoice detail lives on the documents page with a ?tab=INV&doc= param
    const ref = id ? id.replace(/^INV-?/i, "") : "";
    return ref ? `/documents?tab=INV&doc=${encodeURIComponent(ref)}` : `/documents?tab=INV`;
  }

  // List pages — navigate to the documents page with the correct tab selected
  if (screen === "PR_LIST") return "/documents?tab=PR";
  if (screen === "PO_LIST") return "/documents?tab=PO";
  if (screen === "GRN_LIST") return "/documents?tab=GRN";
  if (screen === "INVOICE_LIST") return "/documents?tab=INV";

  // Other screens
  if (screen === "DASHBOARD") return "/";
  if (screen === "NOTIFICATIONS") return "/";

  return null;
}

// ── Data card renderer ─────────────────────────────────────────────────────────
function DataCard({ item }: { item: Record<string, unknown> }) {
  const stage = String(item.stage ?? item.type ?? "");
  const ref =
    String(
      item.reference ??
        item.pr_number ??
        item.po_number ??
        item.grn_number ??
        item.invoice_number ??
        item.reference_number ??
        ""
    ) || "—";
  const status = String(item.status ?? item.ocr_status ?? "");
  const name = String(item.original_filename ?? item.message ?? "");
  const { color, bg } = ocrColor(status);

  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: "3px",
        padding: "6px 10px",
        marginBottom: "4px",
        backgroundColor: "#fafafa",
        fontSize: "11px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "6px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
        <FileText size={11} color="#8a8b8c" style={{ flexShrink: 0 }} />
        <span style={{ color: "#0070F2", fontWeight: 600, flexShrink: 0 }}>
          {stage} {ref}
        </span>
        {name && (
          <span
            style={{
              color: "#6A6D70",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "120px",
            }}
          >
            {name}
          </span>
        )}
      </div>
      {status && (
        <span
          style={{
            color,
            backgroundColor: bg,
            padding: "1px 5px",
            borderRadius: "2px",
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {status}
        </span>
      )}
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────
function MessageBubble({
  msg,
  onNavigateTo,
}: {
  msg: Message;
  onNavigateTo: (screen: string, id?: string) => void;
}) {
  const isUser = msg.from === "user";
  const isError = msg.from === "error";
  const resp = msg.response;
  const hasData = resp && resp.data && resp.data.length > 0;
  const canNavigate = resp?.action?.type === "NAVIGATE" && resp.action.screen !== "NONE";
  const route = canNavigate ? resolveRoute(resp!.action.screen, resp!.action.id) : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        gap: "2px",
        marginBottom: "8px",
      }}
    >
      <div
        style={{
          maxWidth: "88%",
          padding: "8px 12px",
          borderRadius: isUser ? "12px 12px 2px 12px" : "2px 12px 12px 12px",
          backgroundColor: isUser ? "#0070F2" : isError ? "#FBEAEA" : "#f5f5f5",
          color: isUser ? "#ffffff" : isError ? "#BB0000" : "#32363a",
          fontSize: "12px",
          lineHeight: "1.5",
          whiteSpace: "pre-wrap",
        }}
      >
        {isError && (
          <span style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px" }}>
            <XCircle size={12} /> Error
          </span>
        )}
        {msg.text}
      </div>

      {hasData && (
        <div style={{ maxWidth: "88%", width: "100%" }}>
          {resp!.data.slice(0, 6).map((item, i) => (
            <DataCard key={i} item={item} />
          ))}
          {resp!.data.length > 6 && (
            <div style={{ fontSize: "11px", color: "#8a8b8c", padding: "2px 6px" }}>
              +{resp!.data.length - 6} more records
            </div>
          )}
        </div>
      )}

      {/* Navigation button — only shown when we have a valid route */}
      {route && (
        <button
          onClick={() => onNavigateTo(resp!.action.screen, resp!.action.id)}
          style={{
            fontSize: "11px",
            color: "#0070F2",
            backgroundColor: "#E8F1FB",
            border: "1px solid #B5D4F4",
            borderRadius: "12px",
            padding: "3px 10px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <CheckCircle2 size={10} />
          Open {resp!.action.screen.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          {resp!.action.id ? ` → ${resp!.action.id}` : ""}
        </button>
      )}

      <div style={{ fontSize: "10px", color: "#b0b0b0" }}>{formatTime(msg.timestamp)}</div>
    </div>
  );
}

// ── Main chatbot component ─────────────────────────────────────────────────────
export function ProcurementChatbot({ apiBase = "" }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uid(),
      from: "bot",
      text: "Hello! I'm your DVP Assistant.\n\nAsk me about any PR, PO, GRN, or Invoice — I'll fetch live data from the system.",
      timestamp: new Date(),
    },
  ]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !minimized) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [messages, open, minimized]);

  // ── Navigation handler — uses React Router ─────────────────────────────────
  const handleNavigate = (screen: string, id?: string) => {
    const route = resolveRoute(screen, id);
    if (route) {
      navigate(route);
      // Close or minimise the chatbot so the page is visible
      setMinimized(true);
    }
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { id: uid(), from: "user", text: trimmed, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/chatbot/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const json = await res.json();
      const botResp: BotResponse = json?.data?.chatbot_response ?? {
        message: "Unexpected response from server.",
        action: { type: "NONE", screen: "NONE" },
        data: [],
      };

      const botMsg: Message = {
        id: uid(),
        from: "bot",
        text: botResp.message,
        response: botResp,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMsg]);

      // Auto-navigate for direct document lookups (NAVIGATE action with a detail screen)
      if (
        botResp.action?.type === "NAVIGATE" &&
        botResp.action.screen !== "NONE" &&
        // Only auto-navigate for specific detail pages, not list pages
        botResp.action.screen.endsWith("_DETAIL")
      ) {
        setTimeout(() => {
          handleNavigate(botResp.action.screen, botResp.action.id);
        }, 800);
      }
    } catch (err) {
      const errMsg: Message = {
        id: uid(),
        from: "error",
        text: err instanceof Error ? err.message : "Failed to reach the chatbot service.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: uid(),
        from: "bot",
        text: "Chat cleared. How can I help you?",
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setMinimized(false); }}
          title="Open DVP Assistant"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            width: "52px",
            height: "52px",
            borderRadius: "50%",
            backgroundColor: "#003B62",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 16px rgba(0,59,98,0.35)",
            zIndex: 9999,
          }}
        >
          <MessageSquare size={22} color="#ffffff" />
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            width: "340px",
            height: minimized ? "42px" : "520px",
            backgroundColor: "#ffffff",
            border: "1px solid #d9d9d9",
            borderRadius: "6px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 9999,
            transition: "height 0.2s ease",
          }}
        >
          {/* Header */}
          <div
            style={{
              backgroundColor: "#003B62",
              padding: "0 12px",
              height: "42px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "#4ADE80",
                flexShrink: 0,
              }}
            />
            <MessageSquare size={14} color="#ffffff" />
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#ffffff", flex: 1 }}>
              DVP Assistant
            </span>
            <button
              onClick={() => setMinimized((v) => !v)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}
              title={minimized ? "Expand" : "Minimize"}
            >
              {minimized ? (
                <ChevronDown size={14} color="#ffffff" />
              ) : (
                <Minus size={14} color="#ffffff" />
              )}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}
              title="Close"
            >
              <X size={14} color="#ffffff" />
            </button>
          </div>

          {!minimized && (
            <>
              {/* Message list */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} onNavigateTo={handleNavigate} />
                ))}
                {loading && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                    <Loader2 size={14} color="#0070F2" style={{ animation: "spin 1s linear infinite" }} />
                    <span style={{ fontSize: "11px", color: "#8a8b8c" }}>Fetching from system...</span>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Suggestion chips */}
              <div
                style={{
                  padding: "6px 12px 0",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "4px",
                  backgroundColor: "#fafafa",
                  borderTop: "1px solid #eeeeee",
                }}
              >
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    disabled={loading}
                    style={{
                      fontSize: "10px",
                      padding: "3px 8px",
                      border: "1px solid #d9d9d9",
                      borderRadius: "10px",
                      backgroundColor: "#ffffff",
                      color: "#32363a",
                      cursor: "pointer",
                      opacity: loading ? 0.5 : 1,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Input row */}
              <div
                style={{
                  padding: "8px 12px",
                  borderTop: "1px solid #eeeeee",
                  backgroundColor: "#ffffff",
                  display: "flex",
                  gap: "6px",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="Ask about a document..."
                  disabled={loading}
                  style={{
                    flex: 1,
                    border: "1px solid #d9d9d9",
                    borderRadius: "3px",
                    padding: "6px 10px",
                    fontSize: "12px",
                    outline: "none",
                    color: "#32363a",
                    backgroundColor: "#ffffff",
                  }}
                />
                <button
                  onClick={() => void send(input)}
                  disabled={!input.trim() || loading}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "3px",
                    border: "none",
                    backgroundColor: !input.trim() || loading ? "#d9d9d9" : "#0070F2",
                    color: "#ffffff",
                    cursor: !input.trim() || loading ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Send size={14} />
                </button>
              </div>

              {/* Footer clear */}
              <div
                style={{
                  padding: "4px 12px 6px",
                  backgroundColor: "#fafafa",
                  display: "flex",
                  justifyContent: "flex-end",
                  borderTop: "1px solid #f0f0f0",
                }}
              >
                <button
                  onClick={clearChat}
                  style={{
                    fontSize: "10px",
                    color: "#8a8b8c",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Clear chat
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Keyframe for spinner */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}