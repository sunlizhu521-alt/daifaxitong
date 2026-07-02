import React from "react";
import { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppShell } from "./ui/AppShell";
import { LoginPage } from "./pages/LoginPage";
import "./styles.css";

const queryClient = new QueryClient();

const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const OrdersPage = lazy(() => import("./pages/OrdersPage").then((module) => ({ default: module.OrdersPage })));
const AccessoryRegistrationPage = lazy(() =>
  import("./pages/AccessoryRegistrationPage").then((module) => ({ default: module.AccessoryRegistrationPage }))
);
const TrackingNumbersPage = lazy(() => import("./pages/TrackingNumbersPage").then((module) => ({ default: module.TrackingNumbersPage })));
const CarrierLibraryPage = lazy(() => import("./pages/CarrierLibraryPage").then((module) => ({ default: module.CarrierLibraryPage })));
const ShippingSchedulePage = lazy(() => import("./pages/ShippingSchedulePage").then((module) => ({ default: module.ShippingSchedulePage })));
const PurchaseOrdersPage = lazy(() => import("./pages/PurchaseOrdersPage").then((module) => ({ default: module.PurchaseOrdersPage })));
const DropshipSummaryPage = lazy(() => import("./pages/DropshipSummaryPage").then((module) => ({ default: module.DropshipSummaryPage })));
const ReturnRegistrationPage = lazy(() => import("./pages/ReturnRegistrationPage").then((module) => ({ default: module.ReturnRegistrationPage })));
const ReturnOperationPage = lazy(() => import("./pages/ReturnOperationPage").then((module) => ({ default: module.ReturnOperationPage })));
const ReturnReceiptPage = lazy(() => import("./pages/ReturnReceiptPage").then((module) => ({ default: module.ReturnReceiptPage })));
const SuppliersPage = lazy(() => import("./pages/SuppliersPage").then((module) => ({ default: module.SuppliersPage })));
const ProductsPage = lazy(() => import("./pages/ProductsPage").then((module) => ({ default: module.ProductsPage })));
const StoreLibraryPage = lazy(() => import("./pages/StoreLibraryPage").then((module) => ({ default: module.StoreLibraryPage })));
const PermissionsPage = lazy(() => import("./pages/PermissionsPage").then((module) => ({ default: module.PermissionsPage })));

const loadingFallback = <div className="loading-screen">加载中...</div>;
const lazyElement = (element: React.ReactNode) => <Suspense fallback={loadingFallback}>{element}</Suspense>;

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: lazyElement(<DashboardPage />) },
      { path: "drop-shipping", element: lazyElement(<OrdersPage />) },
      { path: "accessories", element: lazyElement(<AccessoryRegistrationPage />) },
      { path: "tracking-numbers", element: lazyElement(<TrackingNumbersPage />) },
      { path: "carriers", element: lazyElement(<CarrierLibraryPage />) },
      { path: "shipping-schedule", element: lazyElement(<ShippingSchedulePage />) },
      { path: "purchase-orders", element: lazyElement(<PurchaseOrdersPage />) },
      { path: "dropship-summary", element: lazyElement(<DropshipSummaryPage />) },
      { path: "returns", element: lazyElement(<ReturnRegistrationPage />) },
      { path: "return-operations", element: lazyElement(<ReturnOperationPage />) },
      { path: "return-receipts", element: lazyElement(<ReturnReceiptPage />) },
      { path: "suppliers", element: lazyElement(<SuppliersPage />) },
      { path: "products", element: lazyElement(<ProductsPage />) },
      { path: "orders", element: <Navigate to="/drop-shipping" replace /> },
      { path: "stores", element: lazyElement(<StoreLibraryPage />) },
      { path: "permissions", element: lazyElement(<PermissionsPage />) }
    ]
  },
  { path: "*", element: <Navigate to="/" replace /> }
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
