import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Supplier } from "../api";
import { PageHeader, Panel } from "../ui/Section";

export function SuppliersPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Supplier | null>(null);
  const { data = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate(Object.fromEntries(form));
    event.currentTarget.reset();
  }

  return (
    <>
      <PageHeader title="供应商" description="维护供货方资料、联系方式、结算方式和备注。" />
      <div className="two-column">
        <Panel title={editing ? "编辑供应商" : "新增供应商"}>
          <form className="form-grid" onSubmit={submit}>
            <input name="name" placeholder="供应商名称" defaultValue={editing?.name} required />
            <input name="contact" placeholder="联系人" defaultValue={editing?.contact} />
            <input name="phone" placeholder="电话" defaultValue={editing?.phone} />
            <input name="settlementType" placeholder="结算方式" defaultValue={editing?.settlementType} />
            <input name="address" placeholder="地址" defaultValue={editing?.address} />
            <textarea name="note" placeholder="备注" defaultValue={editing?.note} />
            {save.error ? <div className="error">{save.error.message}</div> : null}
            <button className="primary-button">{editing ? "保存修改" : "新增供应商"}</button>
          </form>
        </Panel>
        <Panel title="供应商列表">
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>联系人</th>
                <th>电话</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.map((supplier) => (
                <tr key={supplier.id}>
                  <td>{supplier.name}</td>
                  <td>{supplier.contact}</td>
                  <td>{supplier.phone}</td>
                  <td className="row-actions">
                    <button onClick={() => setEditing(supplier)}>编辑</button>
                    <button onClick={() => remove.mutate(supplier.id)}>删除</button>
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
