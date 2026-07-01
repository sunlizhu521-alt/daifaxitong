export const ROLE_ADMIN = "管理员";
export const ROLE_USER = "普通用户";

export const pageOptions = [
  { key: "dashboard", label: "仪表盘", path: "/" },
  { key: "dropShippingRegistration", label: "登记代发", path: "/drop-shipping" },
  { key: "trackingNumbers", label: "快递单号", path: "/tracking-numbers" },
  { key: "carrierLibrary", label: "快递库", path: "/carriers" },
  { key: "shippingSchedule", label: "发货安排", path: "/shipping-schedule" },
  { key: "purchaseOrders", label: "采购订单", path: "/purchase-orders" },
  { key: "dropshipSummary", label: "代发汇总", path: "/dropship-summary" },
  { key: "returnRegistration", label: "退货记录", path: "/returns" },
  { key: "suppliers", label: "供应商", path: "/suppliers" },
  { key: "productLibrary", label: "商品库", path: "/products" },
  { key: "storeLibrary", label: "店铺库", path: "/stores" },
  { key: "permissionManagement", label: "权限管理", path: "/permissions" }
] as const;

export type PageKey = (typeof pageOptions)[number]["key"];

export const allPageKeys = pageOptions.map((page) => page.key);

export function normalizePageAccess(value: unknown): PageKey[] {
  const allowed = new Set<string>(allPageKeys);
  const legacyMap: Record<string, PageKey> = {
    orders: "dropShippingRegistration",
    products: "productLibrary"
  };
  const source = Array.isArray(value) ? value : [];
  return [
    ...new Set(
      source
        .map(String)
        .map((page) => legacyMap[page] ?? page)
        .filter((page) => allowed.has(page))
    )
  ] as PageKey[];
}

export function hasPageAccess(user: { role?: string; pageAccess?: string[] } | undefined, page: PageKey) {
  if (!user) return false;
  if (user.role === ROLE_ADMIN) return true;
  return Array.isArray(user.pageAccess) && user.pageAccess.includes(page);
}
