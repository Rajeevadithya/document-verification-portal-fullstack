import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Bell, BarChart2, ChevronDown, FileUp, LayoutDashboard, LoaderCircle, LogOut, Settings, User, X } from "lucide-react";
import logo from "../../assets/logo.png";
import { getNotifications, getUnreadNotificationCount, markAllNotificationsRead, markNotificationRead } from "../lib/api";
import { formatDateTime, statusTone } from "../lib/format";
import type { NotificationItem } from "../lib/types";
import { ProcurementChatbot } from "./ProcurementChatbot";

const NAV_ITEMS = [
  { label: "Global Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Invoice Verification", path: "/documents", icon: FileUp },
  { label: "Reports", path: "/reports", icon: BarChart2 },
];

function stageToTab(stage: NotificationItem["stage"]) {
  return stage === "INVOICE" ? "INV" : stage;
}

function getProcurementDetailRoute(stage: "PR" | "PO" | "GRN", reference: string, action?: "upload" | "change" | "view") {
  const suffix = action ? `?action=${action}` : "";
  return `/documents/${stage.toLowerCase()}/${encodeURIComponent(reference)}${suffix}`;
}

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const [notificationResponse, countResponse] = await Promise.all([
        getNotifications(12),
        getUnreadNotificationCount(),
      ]);
      setNotifications(notificationResponse.notifications);
      setUnreadCount(countResponse.unread_count);
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isActive = (path: string) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path));

  const openNotification = async (notification: NotificationItem) => {
    if (!notification.is_read) {
      await markNotificationRead(notification._id);
    }
    await loadNotifications();
    setNotifOpen(false);
    const tab = stageToTab(notification.stage);
    if (tab === "PR" || tab === "PO" || tab === "GRN") {
      navigate(getProcurementDetailRoute(tab, notification.reference_number));
      return;
    }
    navigate(`/documents?tab=INV&doc=${encodeURIComponent(notification.reference_number)}`);
  };

  const markAllRead = async () => {
    await markAllNotificationsRead();
    await loadNotifications();
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ fontFamily: "'72', '72full', Arial, Helvetica, sans-serif", fontSize: "13px" }}>
      <header className="flex items-center justify-between px-4 flex-shrink-0" style={{ backgroundColor: "#003B62", height: "56px", minHeight: "56px" }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center"><img src={logo} alt="logo" className="h-10 w-auto object-contain rounded-md" /></div>
          <span className="text-white leading-none" style={{ fontSize: "15px", fontWeight: "600", letterSpacing: "0.02em" }}>Document Verification Portal</span>
        </div>

        <div className="flex items-center gap-1">
          <div className="relative" ref={notifRef}>
            <button onClick={() => { setNotifOpen((current) => !current); setProfileOpen(false); if (!notifOpen) void loadNotifications(); }} className="relative flex items-center justify-center rounded hover:bg-white/10 transition-colors" style={{ width: "36px", height: "36px" }}>
              <Bell size={18} color="#ffffff" />
              <span className="absolute flex items-center justify-center rounded-full text-white" style={{ top: "5px", right: "5px", width: "16px", height: "16px", backgroundColor: "#BB0000", fontSize: "9px", fontWeight: "700" }}>{unreadCount}</span>
            </button>
            {notifOpen && (
              <div className="absolute right-0 bg-white shadow-lg border z-50" style={{ top: "40px", width: "360px", borderColor: "#d9d9d9" }}>
                <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "#d9d9d9", backgroundColor: "#f5f5f5" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#32363a" }}>Notifications</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => void markAllRead()} style={{ fontSize: "11px", color: "#0070F2" }}>Mark all read</button>
                    <button onClick={() => setNotifOpen(false)}><X size={14} color="#6a6d70" /></button>
                  </div>
                </div>
                {loadingNotifications ? (
                  <div className="px-3 py-4 flex items-center gap-2" style={{ fontSize: "12px", color: "#6A6D70" }}><LoaderCircle size={14} className="animate-spin" /> Loading notifications...</div>
                ) : notifications.length === 0 ? (
                  <div className="px-3 py-4" style={{ fontSize: "12px", color: "#8a8b8c" }}>No notifications available.</div>
                ) : notifications.map((notification) => {
                  const tone = statusTone(notification.type.includes("FAILED") ? "INVALID" : notification.is_read ? "READ" : "PENDING");
                  return (
                    <button key={notification._id} onClick={() => void openNotification(notification)} className="flex items-start gap-2 px-3 py-2 border-b hover:bg-blue-50 cursor-pointer text-left w-full" style={{ borderColor: "#eeeeee" }}>
                      <div className="rounded-full mt-1 flex-shrink-0" style={{ width: "8px", height: "8px", backgroundColor: notification.is_read ? "#C7C7C7" : tone.color }} />
                      <div className="flex-1 min-w-0">
                        <div style={{ fontSize: "12px", color: "#32363a", fontWeight: notification.is_read ? "400" : "600" }}>{notification.message}</div>
                        <div style={{ fontSize: "11px", color: "#8a8b8c", marginTop: "2px" }}>{notification.reference_number} • {formatDateTime(notification.created_at)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mx-1" style={{ width: "1px", height: "20px", backgroundColor: "rgba(255,255,255,0.3)" }} />

          <div className="relative" ref={profileRef}>
            <button onClick={() => { setProfileOpen((current) => !current); setNotifOpen(false); }} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-white/10 transition-colors">
              <div className="rounded-full flex items-center justify-center text-white" style={{ width: "28px", height: "28px", backgroundColor: "#0070F2", fontSize: "11px", fontWeight: "600" }}>JD</div>
              <span className="text-white" style={{ fontSize: "12px" }}>John Doe</span>
              <ChevronDown size={12} color="#ffffff" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 bg-white shadow-lg border z-50" style={{ top: "40px", width: "180px", borderColor: "#d9d9d9" }}>
                <div className="px-3 py-2 border-b" style={{ borderColor: "#eeeeee", backgroundColor: "#f5f5f5" }}>
                  <div style={{ fontSize: "12px", fontWeight: "600", color: "#32363a" }}>John Doe</div>
                  <div style={{ fontSize: "11px", color: "#8a8b8c" }}>john.doe@company.com</div>
                </div>
                {[{ icon: User, label: "Profile" }, { icon: Settings, label: "Settings" }, { icon: LogOut, label: "Log Out" }].map((item) => (
                  <button key={item.label} className="flex items-center gap-2 w-full px-3 py-2 hover:bg-blue-50 text-left" style={{ fontSize: "12px", color: "#32363a" }}>
                    <item.icon size={13} color="#6a6d70" />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex-shrink-0 flex flex-col border-r overflow-y-auto" style={{ width: "220px", backgroundColor: "#ffffff", borderColor: "#d9d9d9" }}>
          <nav className="flex flex-col pt-2">
            {NAV_ITEMS.map((item) => (
              <button key={item.path} onClick={() => navigate(item.path)} className="flex items-center gap-3 px-4 py-2 text-left w-full transition-colors relative" style={{ fontSize: "13px", fontWeight: isActive(item.path) ? "600" : "400", color: isActive(item.path) ? "#0070F2" : "#32363A", backgroundColor: isActive(item.path) ? "#E8F1FB" : "transparent", borderLeft: isActive(item.path) ? "3px solid #0070F2" : "3px solid transparent", paddingLeft: "13px", minHeight: "36px" }}>
                <item.icon size={15} color={isActive(item.path) ? "#0070F2" : "#6A6D70"} />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto px-4 py-3 border-t" style={{ borderColor: "#eeeeee" }}>
            <div style={{ fontSize: "11px", color: "#8a8b8c" }}>DMS v1</div>
            <div style={{ fontSize: "11px", color: "#8a8b8c" }}>© 2026 Midwest Limited</div>
          </div>
        </aside>

        <main className="flex-1 overflow-hidden bg-[#f7f7f7]"><Outlet /></main>
      </div>

      <ProcurementChatbot apiBase="" />
    </div>
  );
}
