import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../api";

const orderedPaths = [
  { key: "dashboard", path: "/" },
  { key: "dropShippingRegistration", path: "/drop-shipping" },
  { key: "accessoryRegistration", path: "/accessories" },
  { key: "accessoryShipping", path: "/accessory-shipping" },
  { key: "trackingNumbers", path: "/tracking-numbers" },
  { key: "carrierLibrary", path: "/carriers" },
  { key: "shippingSchedule", path: "/shipping-schedule" },
  { key: "purchaseOrders", path: "/purchase-orders" },
  { key: "dropshipSummary", path: "/dropship-summary" },
  { key: "returnRegistration", path: "/returns" },
  { key: "returnOperation", path: "/return-operations" },
  { key: "returnReceipt", path: "/return-receipts" },
  { key: "suppliers", path: "/suppliers" },
  { key: "productLibrary", path: "/products" },
  { key: "storeLibrary", path: "/stores" },
  { key: "permissionManagement", path: "/permissions" }
] as const;

function firstPath(user: User) {
  return orderedPaths.find((item) => user.pageAccess.includes(item.key))?.path ?? "/";
}

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const body = JSON.stringify({ username: form.get("username"), password: form.get("password") });
    try {
      const user = await api<User>("/auth/login", { method: "POST", body });
      navigate(firstPath(user), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand compact">
          <span className="brand-mark">代</span>
          <div>
            <strong>一件代发系统</strong>
            <small>后台管理入口</small>
          </div>
        </div>
        <p className="auth-note">账号由管理员在权限管理页面创建。</p>
        <label>
          账号
          <input name="username" defaultValue="孙立柱" autoComplete="username" required />
        </label>
        <label>
          密码
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button className="primary-button" disabled={loading}>
          {loading ? "登录中..." : "登录"}
        </button>
      </form>
    </div>
  );
}
