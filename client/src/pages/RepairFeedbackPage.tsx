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
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/repairs/${id}`, { method: "PATCH", body: JSON.stringify(body), notify: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] })
  });

  function confirmReceived(row: RepairExchange) {
    updateRepair.mutate({
      id: row.id,
      body: {
        isReceived: 1
      }
    });
  }

  function updateEstimatedCompletion(row: RepairExchange, estimatedCompletion: string) {
    updateRepair.mutate({
      id: row.id,
      body: {
        isReceived: row.isReceived ? 1 : 0,
        estimatedCompletion
      }
    });
  }

  function submitFeedback(row: RepairExchange, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    updateRepair.mutate({
      id: row.id,
      body: {
        isReceived: row.isReceived ? 1 : 0,
        estimatedCompletion: String(form.get("estimatedCompletion") ?? "").trim(),
        returnCarrier: String(form.get("returnCarrier") ?? "").trim(),
        returnTrackingNo: String(form.get("returnTrackingNo") ?? "").trim(),
        supplierFeedback: String(form.get("supplierFeedback") ?? "").trim()
      }
    });
  }

  return (
    <>
      <PageHeader title="维修换货反馈" description="预计完成时间选择后自动提交并通知钉钉，寄出快递和供应商反馈仍可手动保存。" />
      <Panel title="维修换货反馈">
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
              <th>收货操作</th>
              <th>预计完成时间（自动反馈）</th>
              <th>寄出快递公司</th>
              <th>寄出快递单号</th>
              <th>供应商反馈</th>
              <th>状态</th>
              <th>是否寄出</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const formId = `feedback-form-${row.id}`;
              return (
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
                  <td className="row-actions">
                    {row.isReceived ? (
                      <span className="status purchased">已收到</span>
                    ) : (
                      <button type="button" className="primary-button" disabled={updateRepair.isPending} onClick={() => confirmReceived(row)}>
                        确认收到货
                      </button>
                    )}
                  </td>
                  <td>
                    <input
                      form={formId}
                      name="estimatedCompletion"
                      type="date"
                      defaultValue={row.estimatedCompletion || ""}
                      disabled={updateRepair.isPending}
                      onChange={(event) => updateEstimatedCompletion(row, event.target.value)}
                    />
                  </td>
                  <td><input form={formId} name="returnCarrier" placeholder="寄出快递公司" defaultValue={row.returnCarrier || ""} /></td>
                  <td><input form={formId} name="returnTrackingNo" placeholder="寄出快递单号" defaultValue={row.returnTrackingNo || ""} /></td>
                  <td><input form={formId} name="supplierFeedback" placeholder="供应商反馈" defaultValue={row.supplierFeedback || ""} /></td>
                  <td><span className={`status ${row.isCompleted ? "shipped" : row.isReceived ? "purchased" : "pending"}`}>{row.status}</span></td>
                  <td className="row-actions">
                    <form id={formId} onSubmit={(event) => submitFeedback(row, event)}>
                      <button className="primary-button" disabled={updateRepair.isPending}>已寄出</button>
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
