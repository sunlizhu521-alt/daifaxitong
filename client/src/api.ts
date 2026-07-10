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
  storeShortName?: string | null;
  supplierName?: string | null;
  registrationSupplierName?: string | null;
  registrarName?: string | null;
  status: "pending" | "filled" | "purchased" | "shipped" | "exception" | "cancelled" | "customer_cancelled";
  note?: string;
  supplierNote?: string | null;
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
  shipmentLogisticsStatus?: string | null;
  shippedAt?: string | null;
  shipmentNote?: string | null;
  returnStatus?: string | null;
  returnAction?: string | null;
  returnReason?: string | null;
  returnCarrier?: string | null;
  returnTrackingNo?: string | null;
  returnLogisticsStatus?: string | null;
  createdAt: string;
};

export type OperationRecord = {
  id: number;
  orderId: number;
  action: string;
  detail?: string | null;
  operator?: string | null;
  createdAt: string;
  orderNo?: string | null;
  purchaseOrderNo?: string | null;
  orderType?: "dropship" | "accessory" | null;
  storeName?: string | null;
  storeShortName?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  address?: string | null;
  status?: string | null;
  productName?: string | null;
  productSku?: string | null;
  productSeries?: string | null;
  trackingNo?: string | null;
  carrier?: string | null;
  supplierName?: string | null;
  returnCarrier?: string | null;
  returnTrackingNo?: string | null;
};

export type ReturnRecord = {
  id: number;
  orderId?: number | null;
  storeName: string;
  operator?: string;
  operationUser?: string;
  orderNo: string;
  model: string;
  customerName: string;
  customerPhone?: string;
  address: string;
  status: string;
  action: "拦截" | "自行寄回" | "上门取件" | "寄回" | "未发货退款" | "未出单号退款" | "已出单号未发货退款";
  trackingNo?: string;
  reason: "七天无理由" | "质量问题";
  note?: string;
  supplierName?: string | null;
  productSeries?: string | null;
  productSku?: string | null;
  productName?: string | null;
  totalQuantity?: number | null;
  shipmentCarrier?: string | null;
  shipmentTrackingNo?: string | null;
  returnCarrier?: string | null;
  returnLogisticsStatus?: string | null;
  attachments: string[];
  createdAt: string;
  updatedAt?: string;
};

export type ReturnOrderRow = {
  orderId: number;
  orderNo: string;
  orderType?: "dropship" | "accessory" | null;
  storeName?: string | null;
  storeShortName?: string | null;
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
  shipmentCarrier?: string | null;
  shipmentTrackingNo?: string | null;
  returnCarrier?: string | null;
  logisticsStatus?: string | null;
  returnTrackingNo?: string | null;
  reason?: string | null;
  note?: string | null;
  attachments: string[];
  returnCreatedAt?: string | null;
  totalQuantity?: number | null;
};

export type RepairExchange = {
  id: number;
  storeOrderNo: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  storeName: string;
  series: string;
  sku: string;
  name: string;
  carrierCompany: string;
  trackingNo: string;
  note: string;
  action: string;
  isCompleted: number;
  isReceived: number;
  estimatedCompletion: string;
  returnCarrier: string;
  returnTrackingNo: string;
  supplierFeedback: string;
  status: string;
  createdAt: string;
  updatedAt: string;
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
    | "operationRecords"
    | "operationFlow"
    | "backupCenter"
    | "returnRegistration"
    | "returnOperation"
    | "returnReceipt"
    | "repairRegistration"
    | "repairFeedback"
    | "repairRecord"
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

export type BackupStatus = {
  exists?: boolean;
  ok?: true;
  triggeredBy?: "auto" | "manual";
  createdAt?: string;
  databaseFile?: string;
  uploadsCopied?: boolean;
  fileCount?: number;
  totalBytes?: number;
  nextRunAt?: string;
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
