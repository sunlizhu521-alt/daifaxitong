import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, RouterProvider, useRouteError } from "react-router-dom";
import { AppShell } from "./ui/AppShell";
import { AppNotifications } from "./ui/AppNotifications";
import { LoginPage } from "./pages/LoginPage";
import { OrdersPage } from "./pages/OrdersPage";
import { AccessoryRegistrationPage } from "./pages/AccessoryRegistrationPage";
import { AccessoryShippingPage } from "./pages/AccessoryShippingPage";
import { TrackingNumbersPage } from "./pages/TrackingNumbersPage";
import { CarrierLibraryPage } from "./pages/CarrierLibraryPage";
import { ShippingSchedulePage } from "./pages/ShippingSchedulePage";
import { PurchaseOrdersPage } from "./pages/PurchaseOrdersPage";
import { AccessorySummaryPage, DropshipSummaryPage } from "./pages/DropshipSummaryPage";
import { ReturnRegistrationPage } from "./pages/ReturnRegistrationPage";
import { ReturnOperationPage } from "./pages/ReturnOperationPage";
import { ReturnReceiptPage } from "./pages/ReturnReceiptPage";
import { OperationRecordsPage } from "./pages/OperationRecordsPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { ProductsPage } from "./pages/ProductsPage";
import { StoreLibraryPage } from "./pages/StoreLibraryPage";
import { PermissionsPage } from "./pages/PermissionsPage";
import "./styles.css";

const queryClient = new QueryClient();

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
      { path: "returns", element: <ReturnRegistrationPage /> },
      { path: "return-operations", element: <ReturnOperationPage /> },
      { path: "return-receipts", element: <ReturnReceiptPage /> },
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
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
