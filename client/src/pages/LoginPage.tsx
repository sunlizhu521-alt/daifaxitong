import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../api";

const orderedPaths = [
  { key: "dashboard", path: "/" },
  { key: "dropShippingRegistration", path: "/drop-shipping" },
  { key: "trackingNumbers", path: "/tracking-numbers" },
  { key: "returnRegistration", path: "/returns" },
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
  const [mode, setMode] = useState<"login" | "register">("login");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const body = JSON.stringify({ username: form.get("username"), password: form.get("password") });
    try {
      if (mode === "login") {
        const user = await api<User>("/auth/login", { method: "POST", body });
        navigate(firstPath(user), { replace: true });
      } else {
        const result = await api<User & { message?: string }>("/auth/register", { method: "POST", body });
        setMode("login");
        setMessage(result.message ?? "注册成功，请等待管理员授权后登录");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === "login" ? "登录失败" : "注册失败");
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
            <small>{mode === "login" ? "后台管理入口" : "新用户注册"}</small>
          </div>
        </div>
        <p className="auth-note">
          {mode === "login" ? "管理员默认账号：孙立柱。" : "注册后需要管理员在权限管理页面授权，才能进入系统。"}
        </p>
        <label>
          账号
          <input name="username" defaultValue={mode === "login" ? "孙立柱" : ""} autoComplete="username" required />
        </label>
        <label>
          密码
          <input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required />
        </label>
        {message ? <div className="success">{message}</div> : null}
        {error ? <div className="error">{error}</div> : null}
        <button className="primary-button" disabled={loading}>
          {loading ? "处理中..." : mode === "login" ? "登录" : "注册账号"}
        </button>
        <button
          className="ghost-button"
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
            setMessage("");
          }}
        >
          {mode === "login" ? "新用户注册" : "返回登录"}
        </button>
      </form>
    </div>
  );
}
