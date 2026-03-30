import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router";

export function RouterErrorPage() {
  const navigate = useNavigate();
  const error = useRouteError();

  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Something went wrong";

  const description = isRouteErrorResponse(error)
    ? error.status === 404
      ? "The page you requested does not exist in this portal."
      : "The app hit a routing error while loading this page."
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred while rendering this page.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f7f7] px-6">
      <div
        className="w-full max-w-xl border bg-white p-8 text-center shadow-sm"
        style={{ borderColor: "#d9d9d9", borderRadius: "4px" }}
      >
        <div style={{ fontSize: "12px", color: "#8a8b8c", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Document Verification Portal
        </div>
        <h1 className="mt-3" style={{ fontSize: "24px", fontWeight: 700, color: "#32363a" }}>
          {title}
        </h1>
        <p className="mt-3" style={{ fontSize: "14px", color: "#6A6D70", lineHeight: 1.6 }}>
          {description}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 text-white"
            style={{ backgroundColor: "#0070F2", borderRadius: "3px" }}
          >
            Back to dashboard
          </button>
          <button
            onClick={() => navigate(-1)}
            className="border px-4 py-2"
            style={{ borderColor: "#d9d9d9", borderRadius: "3px", color: "#32363a" }}
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
