import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppShell } from "./ui/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { ProductsPage } from "./pages/ProductsPage";
import { OrdersPage } from "./pages/OrdersPage";
import { AccessoryRegistrationPage } from "./pages/AccessoryRegistrationPage";
import { PermissionsPage } from "./pages/PermissionsPage";
import { TrackingNumbersPage } from "./pages/TrackingNumbersPage";
import { ShippingSchedulePage } from "./pages/ShippingSchedulePage";
import { PurchaseOrdersPage } from "./pages/PurchaseOrdersPage";
import { DropshipSummaryPage } from "./pages/DropshipSummaryPage";
import { ReturnRegistrationPage } from "./pages/ReturnRegistrationPage";
import { ReturnOperationPage } from "./pages/ReturnOperationPage";
import { ReturnReceiptPage } from "./pages/ReturnReceiptPage";
import { StoreLibraryPage } from "./pages/StoreLibraryPage";
import { CarrierLibraryPage } from "./pages/CarrierLibraryPage";
import "./styles.css";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "drop-shipping", element: <OrdersPage /> },
      { path: "accessories", element: <AccessoryRegistrationPage /> },
      { path: "tracking-numbers", element: <TrackingNumbersPage /> },
      { path: "carriers", element: <CarrierLibraryPage /> },
      { path: "shipping-schedule", element: <ShippingSchedulePage /> },
      { path: "purchase-orders", element: <PurchaseOrdersPage /> },
      { path: "dropship-summary", element: <DropshipSummaryPage /> },
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
  { path: "*", element: <Navigate to="/" replace /> }
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
