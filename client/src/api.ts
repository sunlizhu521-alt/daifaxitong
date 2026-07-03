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
  note?: string;
};

export type OrderListRow = {
  id: number;
  orderNo: string;
  purchaseOrderNo?: string | null;
  purchaseOrderUser?: string | null;
  orderType?: "dropship" | "accessory" | null;
  customerName: string;
  customerPhone?: string;
  address: string;
  supplierId?: number | null;
  storeName?: string | null;
  supplierName?: string | null;
  registrationSupplierName?: string | null;
  registrarName?: string | null;
  status: "pending" | "filled" | "purchased" | "shipped" | "exception" | "cancelled";
  note?: string;
  itemCount: number;
  totalQuantity: number;
  materialCode?: string | null;
  productName?: string | null;
  productSeries?: string | null;
  productSku?: string | null;
  supplierModel?: string | null;
  carrierId?: number | null;
  carrier?: string | null;
  trackingNo?: string | null;
  shippedAt?: string | null;
  shipmentNote?: string | null;
  returnStatus?: string | null;
  returnAction?: string | null;
  returnReason?: string | null;
  operationLogs?: string | null;
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
  action: "拦截" | "自行寄回" | "上门取件" | "寄回";
  trackingNo?: string;
  reason: "七天无理由" | "质量问题";
  note?: string;
  supplierName?: string | null;
  productSeries?: string | null;
  productSku?: string | null;
  productName?: string | null;
  totalQuantity?: number | null;
  shipmentTrackingNo?: string | null;
  attachments: string[];
  createdAt: string;
  updatedAt?: string;
};

export type ReturnOrderRow = {
  orderId: number;
  orderNo: string;
  storeName?: string | null;
  supplierName?: string | null;
  operator?: string | null;
  productSeries?: string | null;
  productSku?: string | null;
  supplierModel?: string | null;
  productName?: string | null;
  model?: string | null;
  customerName: string;
  customerPhone?: string | null;
  address: string;
  orderStatus: string;
  returnId?: number | null;
  returnStatus?: string | null;
  action?: string | null;
  shipmentTrackingNo?: string | null;
  returnTrackingNo?: string | null;
  reason?: string | null;
  note?: string | null;
  attachments: string[];
  returnCreatedAt?: string | null;
  totalQuantity?: number | null;
};

export type PageOption = {
  key:
    | "dropShippingRegistration"
    | "trackingNumbers"
    | "accessoryShipping"
    | "carrierLibrary"
    | "shippingSchedule"
    | "purchaseOrders"
    | "dropshipSummary"
    | "accessorySummary"
    | "returnRegistration"
    | "returnOperation"
    | "returnReceipt"
    | "accessoryRegistration"
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

export type ListResponse<T> = T[] | { rows?: T[]; total?: number; page?: number; pageSize?: number };

export function rowsFromListResponse<T>(data: ListResponse<T> | null | undefined): T[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.rows)) return data.rows;
  return [];
}

type ApiOptions = RequestInit & {
  notify?: boolean;
};

function notifyResult(variant: "success" | "error", message: string) {
  window.dispatchEvent(new CustomEvent("app:notification", { detail: { variant, message } }));
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { notify, ...requestOptions } = options;
  const shouldNotify = notify === true;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "include",
      headers: requestOptions.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      ...requestOptions
    });
  } catch (error) {
    if (shouldNotify) notifyResult("error", "请求失败，请检查网络后重试");
    throw error;
  }
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
    const message = details ? `${body.message ?? "请求失败"}：${details}` : body.message ?? "请求失败";
    if (shouldNotify) notifyResult("error", message);
    throw new Error(message);
  }
  if (shouldNotify) notifyResult("success", "操作成功");
  return response.json();
}

export function downloadFile(path: string) {
  window.open(`/api${path}`, "_blank");
}
