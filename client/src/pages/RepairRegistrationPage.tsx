import { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RepairExchange, type User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

export function RepairRegistrationPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: rows = [] } = useQuery({
    queryKey: ["repairs"],
    queryFn: () => api<RepairExchange[]>("/repairs")
  });
  const isAdmin = me?.user?.role === "管理员" || me?.user?.username === "孙立柱";

  const createRepair = useMutation({
    mutationFn: (body: unknown) => api("/repairs", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] })
  });

  const completeRepair = useMutation({
    mutationFn: (id: number) => api(`/repairs/${id}`, { method: "PATCH", body: JSON.stringify({ isCompleted: 1 }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] })
  });

  const deleteRepair = useMutation({
    mutationFn: (id: number) => api(`/repairs/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] })
  });

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createRepair.mutate({
      storeOrderNo: String(form.get("storeOrderNo") ?? "").trim(),
      series: String(form.get("series") ?? "").trim(),
      sku: String(form.get("sku") ?? "").trim(),
      name: String(form.get("name") ?? "").trim(),
      carrierCompany: String(form.get("carrierCompany") ?? "").trim(),
      trackingNo: String(form.get("trackingNo") ?? "").trim(),
      note: String(form.get("note") ?? "").trim(),
      action: String(form.get("action") ?? "").trim()
    });
    event.currentTarget.reset();
  }

  return (
    <>
      <PageHeader title="维修换货登记" description="登记维修换货信息：原店铺订单号、系列、SKU、名称、快递公司、快递单号、备注、操作。" />
      <Panel title="新增登记">
        <form className="form-grid" onSubmit={submitForm}>
          <label className="field-block"><span>原店铺订单号 *</span><input name="storeOrderNo" placeholder="原店铺订单号" required /></label>
          <label className="field-block"><span>系列</span><input name="series" placeholder="系列" /></label>
          <label className="field-block"><span>SKU</span><input name="sku" placeholder="SKU" /></label>
          <label className="field-block"><span>名称</span><input name="name" placeholder="名称" /></label>
          <label className="field-block"><span>快递公司</span><input name="carrierCompany" placeholder="快递公司" /></label>
          <label className="field-block"><span>快递单号</span><input name="trackingNo" placeholder="快递单号" /></label>
          <label className="field-block"><span>操作</span><input name="action" placeholder="操作" /></label>
          <label className="field-block"><span>备注</span><textarea name="note" placeholder="备注" /></label>
          <button className="primary-button" disabled={createRepair.isPending}>提交登记</button>
          {createRepair.error ? <div className="error">{createRepair.error.message}</div> : null}
        </form>
      </Panel>
      <Panel title="登记列表">
        <table className="nowrap-table">
          <thead>
            <tr>
              <th>登记时间</th>
              <th>原店铺订单号</th>
              <th>系列</th>
              <th>SKU</th>
              <th>名称</th>
              <th>快递公司</th>
              <th>快递单号</th>
              <th>操作</th>
              <th>备注</th>
              <th>状态</th>
              {isAdmin ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.createdAt?.slice(0, 10)}</td>
                <td>{row.storeOrderNo}</td>
                <td>{row.series || "-"}</td>
                <td>{row.sku || "-"}</td>
                <td>{row.name || "-"}</td>
                <td>{row.carrierCompany || "-"}</td>
                <td>{row.trackingNo || "-"}</td>
                <td>{row.action || "-"}</td>
                <td>{row.note || "-"}</td>
                <td><span className={`status ${row.isCompleted ? "shipped" : "pending"}`}>{row.status}</span></td>
                {isAdmin ? (
                  <td className="row-actions">
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
    </>
  );
}
