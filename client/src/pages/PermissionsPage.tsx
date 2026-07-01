import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type PageOption, type User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

type PermissionPayload = {
  users: User[];
  pages: PageOption[];
};

export function PermissionsPage() {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const { data } = useQuery({
    queryKey: ["permission-users"],
    queryFn: async () => {
      const payload = await api<PermissionPayload>("/auth/users");
      setDrafts(Object.fromEntries(payload.users.map((user) => [user.id, user.pageAccess])));
      return payload;
    }
  });
  const users = data?.users ?? [];
  const pages = data?.pages ?? [];
  const userNames = useMemo(() => new Set(users.map((user) => user.username)), [users]);

  const saveAccess = useMutation({
    mutationFn: ({ userId, pageAccess }: { userId: string; pageAccess: string[] }) =>
      api(`/auth/users/${userId}/access`, { method: "PATCH", body: JSON.stringify({ pageAccess }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permission-users"] })
  });

  const create = useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      api("/auth/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permission-users"] })
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/auth/users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permission-users"] })
  });

  function toggle(userId: string, page: string, checked: boolean) {
    setDrafts((current) => {
      const selected = new Set(current[userId] ?? []);
      if (checked) selected.add(page);
      else selected.delete(page);
      return { ...current, [userId]: [...selected] };
    });
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!username || !password || userNames.has(username)) return;
    create.mutate({ username, password });
    event.currentTarget.reset();
  }

  return (
    <>
      <PageHeader title="权限管理" description="用户只能由管理员创建，并在这里勾选可访问页面。" />
      <Panel title="创建用户">
        <form className="toolbar permission-create" onSubmit={submitCreate}>
          <input name="username" placeholder="账号" />
          <input name="password" type="password" placeholder="初始密码" />
          <button className="primary-button">创建用户</button>
        </form>
        {create.error ? <div className="error">{create.error.message}</div> : null}
      </Panel>
      <Panel title={`系统用户 ${users.length} 个`}>
        <table>
          <thead>
            <tr>
              <th>用户</th>
              <th>角色</th>
              <th>可访问页面</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const selected = drafts[user.id] ?? [];
              const isAdmin = user.role === "管理员";
              return (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.role}</td>
                  <td>
                    <div className="permission-checkbox-grid">
                      {pages.map((page) => (
                        <label className="permission-checkbox" key={page.key}>
                          <input
                            type="checkbox"
                            checked={selected.includes(page.key)}
                            disabled={isAdmin}
                            onChange={(event) => toggle(user.id, page.key, event.target.checked)}
                          />
                          <span>{page.label}</span>
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="row-actions">
                    <button disabled={isAdmin} onClick={() => saveAccess.mutate({ userId: user.id, pageAccess: selected })}>
                      保存授权
                    </button>
                    <button disabled={isAdmin} onClick={() => remove.mutate(user.id)}>
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {saveAccess.error ? <div className="error">{saveAccess.error.message}</div> : null}
        {remove.error ? <div className="error">{remove.error.message}</div> : null}
      </Panel>
    </>
  );
}
