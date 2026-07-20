import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, RouterProvider, useRouteError } from "react-router-dom";
import { AppShell } from "./ui/AppShell";
import { AppNotifications } from "./ui/AppNotifications";
import { LoginPage } from "./pages/LoginPage";
import "./styles.css";

const CHUNK_RELOAD_KEY = "daifa:chunk-reload";

function lazyPage(loader: () => Promise<Record<string, unknown>>, exportName: string) {
  return lazy(async () => {
    try {
      const module = await loader();
      const component = module[exportName];
      if (!component) throw new Error(`Page export not found: ${exportName}`);
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return { default: component as React.ComponentType };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isChunkFailure = /dynamically imported module|module script|loading chunk|failed to fetch/i.test(message);
      if (isChunkFailure && sessionStorage.getItem(CHUNK_RELOAD_KEY) !== location.pathname) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, location.pathname);
        location.reload();
        return new Promise<never>(() => undefined);
      }
      throw error;
    }
  });
}

const OrdersPage = lazyPage(() => import("./pages/OrdersPage"), "OrdersPage");
const AccessoryRegistrationPage = lazyPage(() => import("./pages/AccessoryRegistrationPage"), "AccessoryRegistrationPage");
const AccessoryShippingPage = lazyPage(() => import("./pages/AccessoryShippingPage"), "AccessoryShippingPage");
const TrackingNumbersPage = lazyPage(() => import("./pages/TrackingNumbersPage"), "TrackingNumbersPage");
const CarrierLibraryPage = lazyPage(() => import("./pages/CarrierLibraryPage"), "CarrierLibraryPage");
const ShippingSchedulePage = lazyPage(() => import("./pages/ShippingSchedulePage"), "ShippingSchedulePage");
const PurchaseOrdersPage = lazyPage(() => import("./pages/PurchaseOrdersPage"), "PurchaseOrdersPage");
const DropshipSummaryPage = lazyPage(() => import("./pages/DropshipSummaryPage"), "DropshipSummaryPage");
const AccessorySummaryPage = lazyPage(() => import("./pages/DropshipSummaryPage"), "AccessorySummaryPage");
const ReturnRegistrationPage = lazyPage(() => import("./pages/ReturnRegistrationPage"), "ReturnRegistrationPage");
const ReturnOperationPage = lazyPage(() => import("./pages/ReturnOperationPage"), "ReturnOperationPage");
const ReturnReceiptPage = lazyPage(() => import("./pages/ReturnReceiptPage"), "ReturnReceiptPage");
const RepairRegistrationPage = lazyPage(() => import("./pages/RepairRegistrationPage"), "RepairRegistrationPage");
const RepairFeedbackPage = lazyPage(() => import("./pages/RepairFeedbackPage"), "RepairFeedbackPage");
const RepairRecordPage = lazyPage(() => import("./pages/RepairRecordPage"), "RepairRecordPage");
const OperationRecordsPage = lazyPage(() => import("./pages/OperationRecordsPage"), "OperationRecordsPage");
const OperationFlowPage = lazyPage(() => import("./pages/OperationFlowPage"), "OperationFlowPage");
const BackupCenterPage = lazyPage(() => import("./pages/BackupCenterPage"), "BackupCenterPage");
const SuppliersPage = lazyPage(() => import("./pages/SuppliersPage"), "SuppliersPage");
const ProductsPage = lazyPage(() => import("./pages/ProductsPage"), "ProductsPage");
const StoreLibraryPage = lazyPage(() => import("./pages/StoreLibraryPage"), "StoreLibraryPage");
const PermissionsPage = lazyPage(() => import("./pages/PermissionsPage"), "PermissionsPage");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

function RouteErrorFallback() {
  const error = useRouteError() as Error | { message?: string } | unknown;
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "页面加载失败";
  return (
    <div className="route-error-page">
      <section className="route-error-card">
        <h1>页面出现错误</h1>
        <p>{message}</p>
        <button type="button" className="primary-button" onClick={() => window.location.reload()}>
          刷新页面
        </button>
      </section>
    </div>
  );
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage />, errorElement: <RouteErrorFallback /> },
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteErrorFallback />,
    children: [
      { index: true, element: <Navigate to="/drop-shipping" replace /> },
      { path: "drop-shipping", element: <OrdersPage /> },
      { path: "accessories", element: <AccessoryRegistrationPage /> },
      { path: "accessory-shipping", element: <AccessoryShippingPage /> },
      { path: "tracking-numbers", element: <TrackingNumbersPage /> },
      { path: "carriers", element: <CarrierLibraryPage /> },
      { path: "shipping-schedule", element: <ShippingSchedulePage /> },
      { path: "purchase-orders", element: <PurchaseOrdersPage /> },
      { path: "dropship-summary", element: <DropshipSummaryPage /> },
      { path: "accessory-summary", element: <AccessorySummaryPage /> },
      { path: "operation-records", element: <OperationRecordsPage /> },
      { path: "operation-flow", element: <OperationFlowPage /> },
      { path: "backups", element: <BackupCenterPage /> },
      { path: "returns", element: <ReturnRegistrationPage /> },
      { path: "return-operations", element: <ReturnOperationPage /> },
      { path: "return-receipts", element: <ReturnReceiptPage /> },
      { path: "repair-registration", element: <RepairRegistrationPage /> },
      { path: "repair-feedback", element: <RepairFeedbackPage /> },
      { path: "repair-record", element: <RepairRecordPage /> },
      { path: "suppliers", element: <SuppliersPage /> },
      { path: "products", element: <ProductsPage /> },
      { path: "orders", element: <Navigate to="/drop-shipping" replace /> },
      { path: "stores", element: <StoreLibraryPage /> },
      { path: "permissions", element: <PermissionsPage /> }
    ]
  },
  { path: "*", element: <Navigate to="/drop-shipping" replace />, errorElement: <RouteErrorFallback /> }
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppNotifications />
      <Suspense fallback={<div className="loading-screen">加载中...</div>}>
        <RouterProvider router={router} />
      </Suspense>
    </QueryClientProvider>
  </React.StrictMode>
);
