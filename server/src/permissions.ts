export const ROLE_ADMIN = "管理员";
export const ROLE_USER = "普通用户";

export const pageOptions = [
  { key: "dashboard", label: "仪表盘", path: "/" },
  { key: "orders", label: "订单发货", path: "/orders" },
  { key: "products", label: "商品/SKU", path: "/products" },
  { key: "suppliers", label: "供应商", path: "/suppliers" },
  { key: "permissionManagement", label: "权限管理", path: "/permissions" }
] as const;

export type PageKey = (typeof pageOptions)[number]["key"];

export const allPageKeys = pageOptions.map((page) => page.key);

export function normalizePageAccess(value: unknown): PageKey[] {
  const allowed = new Set<string>(allPageKeys);
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map(String).filter((page) => allowed.has(page)))] as PageKey[];
}

export function hasPageAccess(user: { role?: string; pageAccess?: string[] } | undefined, page: PageKey) {
  if (!user) return false;
  if (user.role === ROLE_ADMIN) return true;
  return Array.isArray(user.pageAccess) && user.pageAccess.includes(page);
}
