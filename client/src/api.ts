export type Supplier = {
  id: number;
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
  settlementType?: string;
  note?: string;
};

export type Product = {
  id: number;
  name: string;
  sku: string;
  costPrice: number;
  salePrice: number;
  supplierId?: number | null;
  supplierName?: string;
  status: "active" | "inactive";
  note?: string;
};

export type OrderListRow = {
  id: number;
  orderNo: string;
  customerName: string;
  customerPhone?: string;
  address: string;
  status: "pending" | "shipped" | "exception" | "cancelled";
  note?: string;
  itemCount: number;
  totalQuantity: number;
  createdAt: string;
};

export type PageOption = {
  key: "dashboard" | "orders" | "products" | "suppliers" | "permissionManagement";
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
    throw new Error(body.message ?? "请求失败");
  }
  return response.json();
}

export function downloadFile(path: string) {
  window.open(`/api${path}`, "_blank");
}
