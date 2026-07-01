import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Carrier, type User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

export function CarrierLibraryPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<Carrier | null>(null);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: carriers = [] } = useQuery({
    queryKey: ["carriers", keyword],
    queryFn: () => api<Carrier[]>(`/carriers?keyword=${encodeURIComponent(keyword)}`)
  });
  const isAdmin = me?.user?.role === "管理员" || me?.user?.username === "孙立柱";
  const save = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) =>
      api<Carrier>(editing ? `/carriers/${editing.id}` : "/carriers", { method: editing ? "PUT" : "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["carriers"] });
    }
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/carriers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["carriers"] })
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(Object.fromEntries(new FormData(event.currentTarget)));
    event.currentTarget.reset();
  }

  return (
    <>
      <PageHeader title="快递库" description="维护快递公司名称、联系人和地址。" />
      <div className="two-column catalog-layout">
        <Panel title={editing ? "编辑快递公司" : "新增快递公司"}>
          <form className="form-grid" onSubmit={submit}>
            <input name="name" placeholder="快递名称" defaultValue={editing?.name} required />
            <input name="contact" placeholder="联系人" defaultValue={editing?.contact} />
            <input name="address" placeholder="地址" defaultValue={editing?.address} />
            {save.error ? <div className="error">{save.error.message}</div> : null}
            <button className="primary-button">{editing ? "保存修改" : "新增快递"}</button>
          </form>
        </Panel>
        <Panel title="快递公司列表">
          <div className="toolbar">
            <input placeholder="搜索快递名称/联系人/地址" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          </div>
          <table>
            <thead>
              <tr>
                <th>快递名称</th>
                <th>联系人</th>
                <th>地址</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {carriers.map((carrier) => (
                <tr key={carrier.id}>
                  <td>{carrier.name}</td>
                  <td>{carrier.contact || "-"}</td>
                  <td>{carrier.address || "-"}</td>
                  <td className="row-actions">
                    <button onClick={() => setEditing(carrier)}>编辑</button>
                    {isAdmin ? <button onClick={() => remove.mutate(carrier.id)}>删除</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {remove.error ? <div className="error">{remove.error.message}</div> : null}
        </Panel>
      </div>
    </>
  );
}
