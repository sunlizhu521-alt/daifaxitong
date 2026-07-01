export type Supplier = {
  id: number;
  name: string;
  shortName?: string;
  contact?: string;
  phone?: string;
  storeAddress?: string;
  note?: string;
};

export type Product = {
  id: number;
  materialCode?: string;
  productLine?: string;
  series?: string;
  ssku: string;
  name: string;
  sku: string;
  supplierModel?: string;
  costPrice?: number;
  salePrice?: number;
  supplierId?: number | null;
  supplierName?: string;
  status?: "active" | "inactive";
  note?: string;
};

export type Store = {
  id: number;
  name: string;
  shortName?: string;
  platform: string;
  operator?: string;
  note?: string;
};

export type Carrier = {
  id: number;
  name: string;
  contact?: string;
  address?: string;
};

export type OrderListRow = {
  id: number;
  orderNo: string;
  customerName: string;
  customerPhone?: string;
  address: string;
  supplierId?: number | null;
  storeName?: string | null;
  supplierName?: string | null;
  registrationSupplierName?: string | null;
  registrarName?: string | null;
  status: "pending" | "shipped" | "exception" | "cancelled";
  note?: string;
  itemCount: number;
  totalQuantity: number;
  productSeries?: string | null;
  productSku?: string | null;
  carrierId?: number | null;
  carrier?: string | null;
  trackingNo?: string | null;
  shippedAt?: string | null;
  shipmentNote?: string | null;
  createdAt: string;
};

export type ReturnRecord = {
  id: number;
  storeName: string;
  operator?: string;
  orderNo: string;
  model: string;
  customerName: string;
  customerPhone?: string;
  address: string;
  status: string;
  action: "拦截" | "召回" | "寄回";
  trackingNo?: string;
  reason: "七天无理由" | "质量问题";
  note?: string;
  supplierName?: string | null;
  productSeries?: string | null;
  productSku?: string | null;
  attachments: string[];
  createdAt: string;
};

export type PageOption = {
  key:
    | "dashboard"
    | "dropShippingRegistration"
    | "trackingNumbers"
    | "carrierLibrary"
    | "shippingSchedule"
    | "returnRegistration"
    | "suppliers"
    | "productLibrary"
    | "storeLibrary"
    | "permissionManagement";
  label: string;
  path: string;
};

export type User = {
  id: string;
  username: string;
  role: string;
  pageAccess: PageOption["key"][];
  createdAt?: string;
  updatedAt?: string;
};

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options
  });
  if (response.status === 401 && location.pathname !== "/login") {
    location.href = "/login";
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: "请求失败" }));
    const details = Array.isArray(body.errors)
      ? body.errors
          .slice(0, 5)
          .map((item: { row?: number; message?: string }) => `第${item.row ?? "-"}行：${item.message ?? "解析失败"}`)
          .join("；")
      : "";
    throw new Error(details ? `${body.message ?? "请求失败"}：${details}` : body.message ?? "请求失败");
  }
  return response.json();
}

export function downloadFile(path: string) {
  window.open(`/api${path}`, "_blank");
}
