import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Boxes, CalendarClock, CheckCircle2, ClipboardCheck, ClipboardList, FileText, LogOut, Package, PackageCheck, PackagePlus, RotateCcw, ShieldCheck, Store, Truck, Undo2, Warehouse } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, type User } from "../api";

const nav = [
  { key: "dropShippingRegistration", to: "/drop-shipping", label: "登记代发", icon: ClipboardList },
  { key: "accessoryRegistration", to: "/accessories", label: "配件登记", icon: PackagePlus },
  { key: "accessoryShipping", to: "/accessory-shipping", label: "配件发货", icon: PackageCheck },
  { key: "trackingNumbers", to: "/tracking-numbers", label: "发货单号", icon: Truck },
  { key: "shippingSchedule", to: "/shipping-schedule", label: "发货安排", icon: CalendarClock },
  { key: "purchaseOrders", to: "/purchase-orders", label: "采购订单", icon: ClipboardCheck },
  { key: "dropshipSummary", to: "/dropship-summary", label: "成品汇总", icon: FileText },
  { key: "accessorySummary", to: "/accessory-summary", label: "配件汇总", icon: FileText },
  { key: "returnRegistration", to: "/returns", label: "退货登记", icon: RotateCcw },
  { key: "returnOperation", to: "/return-operations", label: "退货操作", icon: CheckCircle2 },
  { key: "returnReceipt", to: "/return-receipts", label: "退货收货", icon: Undo2 },
  { key: "suppliers", to: "/suppliers", label: "供应商库", icon: Boxes },
  { key: "productLibrary", to: "/products", label: "商品信息", icon: Package },
  { key: "storeLibrary", to: "/stores", label: "店铺信息", icon: Store },
  { key: "carrierLibrary", to: "/carriers", label: "快递信息", icon: Warehouse },
  { key: "permissionManagement", to: "/permissions", label: "权限管理", icon: ShieldCheck }
] as const;

type NavKey = (typeof nav)[number]["key"];

function pathKey(pathname: string) {
  const item = nav.find((entry) => entry.to === pathname);
  return item?.key ?? "dropShippingRegistration";
}

function hasNavAccess(user: User, key: NavKey) {
  return user.role === "管理员" || user.pageAccess.includes(key);
}

function firstAllowedPath(user: User) {
  return nav.find((item) => hasNavAccess(user, item.key))?.to ?? "/drop-shipping";
}

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: User | null }>("/auth/me")
  });
  const user = data?.user;

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    const current = pathKey(location.pathname);
    if (!hasNavAccess(user, current)) {
      navigate(firstAllowedPath(user), { replace: true });
    }
  }, [isLoading, location.pathname, navigate, user]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    navigate("/login", { replace: true });
  }

  if (isLoading || !user) {
    return <div className="loading-screen">加载中...</div>;
  }

  const visibleNav = nav.filter((item) => hasNavAccess(user, item.key));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">代</span>
          <div>
            <strong>一件代发系统</strong>
            <small>订单与供应商协同</small>
          </div>
        </div>
        <nav className="nav">
          {visibleNav.map((item) => (
            <NavLink key={item.to} to={item.to}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="user-box">
          <strong>{user.username}</strong>
          <span>{user.role}</span>
        </div>
        <button className="ghost-button logout" onClick={logout}>
          <LogOut size={18} />
          退出登录
        </button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
