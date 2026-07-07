import { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RepairExchange } from "../api";
import { PageHeader, Panel } from "../ui/Section";

export function RepairFeedbackPage() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["repairs"],
    queryFn: () => api<RepairExchange[]>("/repairs")
  });

  const updateRepair = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/repairs/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] })
  });

  function submitFeedback(row: RepairExchange, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    updateRepair.mutate({
      id: row.id,
      body: {
        isReceived: form.get("isReceived") === "1" ? 1 : 0,
        estimatedCompletion: String(form.get("estimatedCompletion") ?? "").trim(),
        returnCarrier: String(form.get("returnCarrier") ?? "").trim(),
        returnTrackingNo: String(form.get("returnTrackingNo") ?? "").trim(),
        supplierFeedback: String(form.get("supplierFeedback") ?? "").trim()
      }
    });
  }

  return (
    <>
      <PageHeader title="维修换货反馈" description="查看维修换货登记信息，填写是否收到货、预计完成时间、寄出快递信息、供应商反馈。" />
      <Panel title="维修换货反馈">
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
              <th>是否已收到货</th>
              <th>预计完成时间</th>
              <th>寄出快递公司</th>
              <th>寄出快递单号</th>
              <th>供应商反馈</th>
              <th>状态</th>
              <th>保存</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const formId = `feedback-form-${row.id}`;
              return (
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
                  <td>
                    <select form={formId} name="isReceived" defaultValue={row.isReceived ? "1" : "0"}>
                      <option value="0">未收到</option>
                      <option value="1">已收到</option>
                    </select>
                  </td>
                  <td><input form={formId} name="estimatedCompletion" type="date" defaultValue={row.estimatedCompletion || ""} /></td>
                  <td><input form={formId} name="returnCarrier" placeholder="寄出快递公司" defaultValue={row.returnCarrier || ""} /></td>
                  <td><input form={formId} name="returnTrackingNo" placeholder="寄出快递单号" defaultValue={row.returnTrackingNo || ""} /></td>
                  <td><input form={formId} name="supplierFeedback" placeholder="供应商反馈" defaultValue={row.supplierFeedback || ""} /></td>
                  <td><span className={`status ${row.isCompleted ? "shipped" : row.isReceived ? "purchased" : "pending"}`}>{row.status}</span></td>
                  <td className="row-actions">
                    <form id={formId} onSubmit={(event) => submitFeedback(row, event)}>
                      <button className="primary-button" disabled={updateRepair.isPending}>保存反馈</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {updateRepair.error ? <div className="error">{updateRepair.error.message}</div> : null}
      </Panel>
    </>
  );
}
