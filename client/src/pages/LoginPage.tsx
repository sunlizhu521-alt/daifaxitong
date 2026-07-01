import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") })
      });
      navigate("/");
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
        <label>
          账号
          <input name="username" defaultValue="admin" autoComplete="username" />
        </label>
        <label>
          密码
          <input name="password" type="password" autoComplete="current-password" />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button className="primary-button" disabled={loading}>
          {loading ? "登录中..." : "登录"}
        </button>
      </form>
    </div>
  );
}
