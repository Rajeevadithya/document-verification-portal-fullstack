import { useNavigate } from "react-router";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full items-center justify-center px-6">
      <div
        className="w-full max-w-lg border bg-white p-8 text-center"
        style={{ borderColor: "#d9d9d9", borderRadius: "4px" }}
      >
        <div style={{ fontSize: "12px", color: "#8a8b8c", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          404
        </div>
        <h1 className="mt-3" style={{ fontSize: "22px", fontWeight: 700, color: "#32363a" }}>
          Page not found
        </h1>
        <p className="mt-3" style={{ fontSize: "14px", color: "#6A6D70", lineHeight: 1.6 }}>
          That route is not available in this portal. Use the navigation menu or head back to the dashboard.
        </p>
        <button
          onClick={() => navigate("/")}
          className="mt-6 px-4 py-2 text-white"
          style={{ backgroundColor: "#0070F2", borderRadius: "3px" }}
        >
          Open dashboard
        </button>
      </div>
    </div>
  );
}
