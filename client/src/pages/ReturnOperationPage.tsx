import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ReturnRecord } from "../api";
import { PageHeader, Panel } from "../ui/Section";

export function ReturnOperationPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [trackingNos, setTrackingNos] = useState<Record<number, string>>({});
  const { data: returns = [] } = useQuery({
    queryKey: ["return-operations", keyword],
    queryFn: () => api<ReturnRecord[]>(`/returns?status=${encodeURIComponent("已提交退货")}&keyword=${encodeURIComponent(keyword)}`)
  });

  const completeReturn = useMutation({
    mutationFn: ({ id, trackingNo }: { id: number; trackingNo: string }) =>
      api(`/returns/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "已安排退回", trackingNo }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["return-operations"] });
      qc.invalidateQueries({ queryKey: ["return-orders"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["accessory-summary"] });
    }
  });

  function confirmComplete(row: ReturnRecord) {
    const trackingNo = row.action === "寄回" ? (trackingNos[row.id] ?? row.trackingNo ?? "").trim() : row.shipmentTrackingNo ?? row.trackingNo ?? "";
    if (!window.confirm(`确认订单 ${row.orderNo} 已经完成退货操作吗？`)) return;
    completeReturn.mutate({ id: row.id, trackingNo });
  }

  return (
    <>
      <PageHeader title="退货操作" description="处理已经提交退货登记的订单，确认拦截、召回或寄回是否已经完成。" />
      <Panel title="待操作退货">
        <div className="toolbar filter-toolbar">
          <input
            placeholder="搜索订单号/姓名/电话/地址/型号/快递单号"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <table className="nowrap-table">
          <thead>
            <tr>
              <th>登记时间</th>
              <th>店铺</th>
              <th>供应商</th>
              <th>运营</th>
              <th>订单号</th>
              <th>姓名</th>
              <th>电话</th>
              <th>地址</th>
              <th>系列</th>
              <th>SKU</th>
              <th>型号</th>
              <th>退货操作</th>
              <th>快递单号</th>
              <th>退货理由</th>
              <th>状态</th>
              <th>备注</th>
              <th>附件</th>
              <th>处理</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((row) => {
              const trackingNo = row.action === "寄回" ? trackingNos[row.id] ?? row.trackingNo ?? "" : row.shipmentTrackingNo ?? row.trackingNo ?? "";
              return (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleString()}</td>
                  <td>{row.storeName || "-"}</td>
                  <td>{row.supplierName || "-"}</td>
                  <td>{row.operator || "-"}</td>
                  <td>{row.orderNo}</td>
                  <td>{row.customerName}</td>
                  <td>{row.customerPhone || "-"}</td>
                  <td>{row.address}</td>
                  <td>{row.productSeries || "-"}</td>
                  <td>{row.productSku || "-"}</td>
                  <td>{row.model || "-"}</td>
                  <td>{row.action}</td>
                  <td>
                    <input
                      value={trackingNo}
                      onChange={(event) => setTrackingNos((current) => ({ ...current, [row.id]: event.target.value }))}
                      placeholder={row.action === "寄回" ? "可填写寄回快递单号" : "自动带出发货单号"}
                      readOnly={row.action !== "寄回"}
                    />
                  </td>
                  <td>{row.reason}</td>
                  <td>{row.status}</td>
                  <td>{row.note || "-"}</td>
                  <td>
                    <div className="attachment-list">
                      {row.attachments.map((url) => (
                        <a href={url} target="_blank" rel="noreferrer" key={url}>
                          <img src={url} alt="附件" />
                        </a>
                      ))}
                    </div>
                  </td>
                  <td className="row-actions">
                    <button type="button" className="primary-button" onClick={() => confirmComplete(row)}>
                      确定操作
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {returns.length === 0 ? <div className="success">暂无已提交退货</div> : null}
        {completeReturn.error ? <div className="error">{completeReturn.error.message}</div> : null}
      </Panel>
    </>
  );
}
