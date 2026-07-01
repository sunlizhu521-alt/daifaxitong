import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Supplier, User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

export function SuppliersPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Supplier | null>(null);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const isAdmin = me?.user?.role === "管理员" || me?.user?.username === "孙立柱";
  const save = useMutation({
    mutationFn: (body: Partial<Supplier>) =>
      api<Supplier>(editing ? `/suppliers/${editing.id}` : "/suppliers", { method: editing ? "PUT" : "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    }
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/suppliers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] })
  });
  const importSuppliers = useMutation({
    mutationFn: (form: FormData) => api("/suppliers/import", { method: "POST", body: form }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] })
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(Object.fromEntries(new FormData(event.currentTarget)));
    event.currentTarget.reset();
  }

  function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    importSuppliers.mutate(new FormData(event.currentTarget));
    event.currentTarget.reset();
  }

  return (
    <>
      <PageHeader title="供应商" description="维护供应商名称、简称、联系人、电话、店址和备注。" />
      <div className="two-column catalog-layout library-layout">
        <Panel title={editing ? "编辑供应商" : "新增供应商"}>
          <form className="form-grid" onSubmit={submit}>
            <input name="name" placeholder="供应商名称" defaultValue={editing?.name} required />
            <input name="shortName" placeholder="供应商简称" defaultValue={editing?.shortName} />
            <input name="contact" placeholder="联系人" defaultValue={editing?.contact} />
            <input name="phone" placeholder="电话" defaultValue={editing?.phone} />
            <input name="storeAddress" placeholder="店址" defaultValue={editing?.storeAddress} />
            <textarea name="note" placeholder="备注" defaultValue={editing?.note} />
            {save.error ? <div className="error">{save.error.message}</div> : null}
            <button className="primary-button">{editing ? "保存修改" : "新增供应商"}</button>
          </form>
        </Panel>
        <Panel title="批量导入供应商">
          <form className="upload-box" onSubmit={uploadFile}>
            <input name="file" type="file" accept=".xlsx,.xls" required />
            <button className="primary-button">批量导入</button>
          </form>
          <small>支持列：供应商名称、供应商简称、联系人、电话、店址、备注。</small>
          {importSuppliers.error ? <div className="error">{importSuppliers.error.message}</div> : null}
          {importSuppliers.isSuccess ? <div className="success">导入成功</div> : null}
        </Panel>
        <Panel title="供应商列表">
          <table>
            <thead>
              <tr>
                <th>供应商名称</th>
                <th>供应商简称</th>
                <th>联系人</th>
                <th>电话</th>
                <th>店址</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.map((supplier) => (
                <tr key={supplier.id}>
                  <td>{supplier.name}</td>
                  <td>{supplier.shortName || "-"}</td>
                  <td>{supplier.contact || "-"}</td>
                  <td>{supplier.phone || "-"}</td>
                  <td>{supplier.storeAddress || "-"}</td>
                  <td>{supplier.note || "-"}</td>
                  <td className="row-actions">
                    <button onClick={() => setEditing(supplier)}>编辑</button>
                    {isAdmin ? <button onClick={() => remove.mutate(supplier.id)}>删除</button> : null}
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
