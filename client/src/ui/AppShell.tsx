import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Boxes, LogOut, Package, ShieldCheck, Truck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, type User } from "../api";

const nav = [
  { key: "dashboard", to: "/", label: "仪表盘", icon: BarChart3 },
  { key: "orders", to: "/orders", label: "订单发货", icon: Truck },
  { key: "products", to: "/products", label: "商品/SKU", icon: Package },
  { key: "suppliers", to: "/suppliers", label: "供应商", icon: Boxes },
  { key: "permissionManagement", to: "/permissions", label: "权限管理", icon: ShieldCheck }
] as const;

function pathKey(pathname: string) {
  const item = nav.find((entry) => entry.to === pathname);
  return item?.key ?? "dashboard";
}

function firstAllowedPath(user: User) {
  return nav.find((item) => user.pageAccess.includes(item.key))?.to ?? "/";
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
    if (!user.pageAccess.includes(current)) {
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

  const visibleNav = nav.filter((item) => user.pageAccess.includes(item.key));

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
            <NavLink key={item.to} to={item.to} end={item.to === "/"}>
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
