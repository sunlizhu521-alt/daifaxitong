import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RepairExchange, type User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

export function RepairRegistrationPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RepairExchange | null>(null);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: rows = [] } = useQuery({
    queryKey: ["repairs"],
    queryFn: () => api<RepairExchange[]>("/repairs")
  });
  const isAdmin = me?.user?.role === "管理员" || me?.user?.username === "孙立柱";

  const createRepair = useMutation({
    mutationFn: (body: unknown) => api("/repairs", { method: "POST", body: JSON.stringify(body), notify: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] })
  });

  const updateRepair = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/repairs/${id}`, { method: "PATCH", body: JSON.stringify(body), notify: true }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["repairs"] });
    }
  });

  const completeRepair = useMutation({
    mutationFn: (id: number) => api(`/repairs/${id}`, { method: "PATCH", body: JSON.stringify({ isCompleted: 1 }), notify: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] })
  });

  const deleteRepair = useMutation({
    mutationFn: (id: number) => api(`/repairs/${id}`, { method: "DELETE", notify: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] })
  });

  function repairPayload(form: FormData) {
    return {
      storeOrderNo: String(form.get("storeOrderNo") ?? "").trim(),
      customerName: String(form.get("customerName") ?? "").trim(),
      customerPhone: String(form.get("customerPhone") ?? "").trim(),
      customerAddress: String(form.get("customerAddress") ?? "").trim(),
      storeName: String(form.get("storeName") ?? "").trim(),
      series: String(form.get("series") ?? "").trim(),
      sku: String(form.get("sku") ?? "").trim(),
      name: String(form.get("name") ?? "").trim(),
      carrierCompany: String(form.get("carrierCompany") ?? "").trim(),
      trackingNo: String(form.get("trackingNo") ?? "").trim(),
      note: String(form.get("note") ?? "").trim(),
      action: ""
    };
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createRepair.mutate(repairPayload(new FormData(event.currentTarget)));
    event.currentTarget.reset();
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    updateRepair.mutate({ id: editing.id, body: repairPayload(new FormData(event.currentTarget)) });
  }

  return (
    <>
      <PageHeader title="维修换货登记" description="登记维修换货信息：原店铺订单号、店铺、客户、商品和快递信息。" />
      <Panel title="新增登记">
        <form className="form-grid repair-entry-form" onSubmit={submitForm}>
          <div className="repair-form-row repair-form-row-4">
            <label className="field-block"><span>原店铺订单号 *</span><input name="storeOrderNo" placeholder="原店铺订单号" required /></label>
            <label className="field-block"><span>店铺</span><input name="storeName" placeholder="店铺" /></label>
            <label className="field-block"><span>客户姓名</span><input name="customerName" placeholder="客户姓名" /></label>
            <label className="field-block"><span>客户地址</span><input name="customerAddress" placeholder="客户地址" /></label>
          </div>
          <div className="repair-form-row repair-form-row-3">
            <label className="field-block"><span>SKU</span><input name="sku" placeholder="SKU" /></label>
            <label className="field-block"><span>系列</span><input name="series" placeholder="系列" /></label>
            <label className="field-block"><span>名称</span><input name="name" placeholder="名称" /></label>
          </div>
          <div className="repair-form-row repair-form-row-3">
            <label className="field-block"><span>快递公司</span><input name="carrierCompany" placeholder="快递公司" /></label>
            <label className="field-block"><span>快递单号</span><input name="trackingNo" placeholder="快递单号" /></label>
            <label className="field-block"><span>备注</span><textarea name="note" placeholder="备注" /></label>
          </div>
          <button className="primary-button" disabled={createRepair.isPending}>提交登记</button>
          {createRepair.error ? <div className="error">{createRepair.error.message}</div> : null}
        </form>
      </Panel>
      <Panel title="登记列表">
        <table className="nowrap-table">
          <thead>
            <tr>
              <th>登记时间</th>
              <th>店铺</th>
              <th>原店铺订单号</th>
              <th>客户姓名</th>
              <th>客户电话</th>
              <th>客户地址</th>
              <th>系列</th>
              <th>SKU</th>
              <th>名称</th>
              <th>快递公司</th>
              <th>快递单号</th>
              <th>备注</th>
              <th>状态</th>
              {isAdmin ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.createdAt?.slice(0, 10)}</td>
                <td>{row.storeName || "-"}</td>
                <td>{row.storeOrderNo}</td>
                <td>{row.customerName || "-"}</td>
                <td>{row.customerPhone || "-"}</td>
                <td>{row.customerAddress || "-"}</td>
                <td>{row.series || "-"}</td>
                <td>{row.sku || "-"}</td>
                <td>{row.name || "-"}</td>
                <td>{row.carrierCompany || "-"}</td>
                <td>{row.trackingNo || "-"}</td>
                <td>{row.note || "-"}</td>
                <td><span className={`status ${row.isCompleted ? "shipped" : "pending"}`}>{row.status}</span></td>
                {isAdmin ? (
                  <td className="row-actions">
                    <button type="button" onClick={() => setEditing(row)}>编辑</button>
                    {row.isCompleted ? null : (
                      <button type="button" className="primary-button" onClick={() => completeRepair.mutate(row.id)}>完结</button>
                    )}
                    <button type="button" onClick={() => { if (window.confirm("确定删除？")) deleteRepair.mutate(row.id); }}>删除</button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {completeRepair.error ? <div className="error">{completeRepair.error.message}</div> : null}
      </Panel>
      {editing ? (
        <div className="modal-backdrop">
          <form className="modal repair-modal" onSubmit={submitEdit}>
            <h2>编辑维修换货</h2>
            <div className="repair-form-row repair-form-row-4">
              <label className="modal-field"><span>原店铺订单号</span><input name="storeOrderNo" defaultValue={editing.storeOrderNo} required /></label>
              <label className="modal-field"><span>店铺</span><input name="storeName" defaultValue={editing.storeName} /></label>
              <label className="modal-field"><span>客户姓名</span><input name="customerName" defaultValue={editing.customerName} /></label>
              <label className="modal-field"><span>客户地址</span><input name="customerAddress" defaultValue={editing.customerAddress} /></label>
            </div>
            <div className="repair-form-row repair-form-row-3">
              <label className="modal-field"><span>SKU</span><input name="sku" defaultValue={editing.sku} /></label>
              <label className="modal-field"><span>系列</span><input name="series" defaultValue={editing.series} /></label>
              <label className="modal-field"><span>名称</span><input name="name" defaultValue={editing.name} /></label>
            </div>
            <div className="repair-form-row repair-form-row-3">
              <label className="modal-field"><span>快递公司</span><input name="carrierCompany" defaultValue={editing.carrierCompany} /></label>
              <label className="modal-field"><span>快递单号</span><input name="trackingNo" defaultValue={editing.trackingNo} /></label>
              <label className="modal-field"><span>备注</span><textarea name="note" defaultValue={editing.note} /></label>
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setEditing(null)}>取消</button>
              <button className="primary-button" disabled={updateRepair.isPending}>保存修改</button>
            </div>
            {updateRepair.error ? <div className="error">{updateRepair.error.message}</div> : null}
          </form>
        </div>
      ) : null}
    </>
  );
}
