import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BarChart3, Boxes, LogOut, Package, Truck } from "lucide-react";
import { api } from "../api";

const nav = [
  { to: "/", label: "仪表盘", icon: BarChart3 },
  { to: "/orders", label: "订单发货", icon: Truck },
  { to: "/products", label: "商品/SKU", icon: Package },
  { to: "/suppliers", label: "供应商", icon: Boxes }
];

export function AppShell() {
  const navigate = useNavigate();

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    navigate("/login");
  }

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
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
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
