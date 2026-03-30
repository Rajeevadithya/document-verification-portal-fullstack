import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { DocumentUploads } from "./components/DocumentUploads";
import { Reports } from "./components/Reports";
import { RouterErrorPage } from "./components/RouterErrorPage";
import { NotFoundPage } from "./components/NotFoundPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    ErrorBoundary: RouterErrorPage,
    children: [
      { index: true, Component: Dashboard },
      { path: "documents", Component: DocumentUploads },
      { path: "reports", Component: Reports },
      { path: "*", Component: NotFoundPage },
    ],
  },
]);
