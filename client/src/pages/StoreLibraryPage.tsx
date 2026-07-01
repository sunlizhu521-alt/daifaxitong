import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Store, type User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

export function StoreLibraryPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Store | null>(null);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: stores = [] } = useQuery({ queryKey: ["stores"], queryFn: () => api<Store[]>("/stores") });
  const isAdmin = me?.user?.role === "管理员" || me?.user?.username === "孙立柱";
  const save = useMutation({
    mutationFn: (body: Partial<Store>) =>
      api<Store>(editing ? `/stores/${editing.id}` : "/stores", { method: editing ? "PUT" : "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["stores"] });
    }
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/stores/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stores"] })
  });
  const importStores = useMutation({
    mutationFn: (form: FormData) => api("/stores/import", { method: "POST", body: form }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stores"] })
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate(Object.fromEntries(form));
    event.currentTarget.reset();
  }

  function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    importStores.mutate(new FormData(event.currentTarget));
    event.currentTarget.reset();
  }

  return (
    <>
      <PageHeader title="店铺库" description="维护代发业务涉及的店铺、平台和负责人信息。" />
      <div className="two-column">
        <Panel title={editing ? "编辑店铺" : "新增店铺"}>
          <form className="form-grid" onSubmit={submit}>
            <input name="name" placeholder="店铺名称" defaultValue={editing?.name} required />
            <input name="platform" placeholder="平台，如淘宝/拼多多/抖店" defaultValue={editing?.platform} required />
            <input name="owner" placeholder="负责人" defaultValue={editing?.owner} />
            <textarea name="note" placeholder="备注" defaultValue={editing?.note} />
            {save.error ? <div className="error">{save.error.message}</div> : null}
            <button className="primary-button">{editing ? "保存修改" : "新增店铺"}</button>
          </form>
        </Panel>
        <Panel title="批量导入店铺">
          <form className="upload-box" onSubmit={uploadFile}>
            <input name="file" type="file" accept=".xlsx,.xls" required />
            <button className="primary-button">批量导入</button>
          </form>
          <small>支持列：店铺名称、平台、负责人、备注。</small>
          {importStores.error ? <div className="error">{importStores.error.message}</div> : null}
          {importStores.isSuccess ? <div className="success">导入成功</div> : null}
        </Panel>
        <Panel title="店铺列表">
          <table>
            <thead>
              <tr>
                <th>店铺</th>
                <th>平台</th>
                <th>负责人</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => (
                <tr key={store.id}>
                  <td>{store.name}</td>
                  <td>{store.platform}</td>
                  <td>{store.owner}</td>
                  <td>{store.note}</td>
                  <td className="row-actions">
                    <button onClick={() => setEditing(store)}>编辑</button>
                    {isAdmin ? <button onClick={() => remove.mutate(store.id)}>删除</button> : null}
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
