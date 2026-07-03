import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ReturnRecord } from "../api";
import { PageHeader, Panel } from "../ui/Section";

export function ReturnReceiptPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const { data: returns = [] } = useQuery({
    queryKey: ["return-receipts", keyword],
    queryFn: () => api<ReturnRecord[]>(`/returns?status=${encodeURIComponent("退货待接收")}&keyword=${encodeURIComponent(keyword)}`)
  });
  const receiveReturn = useMutation({
    mutationFn: (id: number) => api(`/returns/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "已收到退货" }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["return-receipts"] });
      qc.invalidateQueries({ queryKey: ["return-operations"] });
      qc.invalidateQueries({ queryKey: ["return-orders"] });
    }
  });

  function confirmReceived(row: ReturnRecord) {
    if (!window.confirm(`确认订单 ${row.orderNo} 已经退货收货吗？`)) return;
    receiveReturn.mutate(row.id);
  }

  return (
    <>
      <PageHeader title="退货收货" description="处理退货待接收的退货记录，确认退货包裹是否已经收货。" />
      <Panel title="待收货退货">
        <div className="toolbar filter-toolbar">
          <input
            placeholder="搜索订单号/姓名/电话/地址/SKU/快递单号"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <table className="nowrap-table">
          <thead>
            <tr>
              <th>退货时间</th>
              <th>店铺</th>
              <th>订单号</th>
              <th>姓名</th>
              <th>电话</th>
              <th>地址</th>
              <th>SKU</th>
              <th>数量</th>
              <th>快递单号</th>
              <th>退货原因</th>
              <th>状态</th>
              <th>备注</th>
              <th>附件</th>
              <th>处理</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.storeName || "-"}</td>
                <td>{row.orderNo}</td>
                <td>{row.customerName}</td>
                <td>{row.customerPhone || "-"}</td>
                <td>{row.address}</td>
                <td>{row.productSku || "-"}</td>
                <td>{row.totalQuantity ?? "-"}</td>
                <td>{row.trackingNo || "-"}</td>
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
                  <button type="button" className="primary-button" onClick={() => confirmReceived(row)}>
                    已收到退货
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {returns.length === 0 ? <div className="success">暂无待收货退货</div> : null}
        {receiveReturn.error ? <div className="error">{receiveReturn.error.message}</div> : null}
      </Panel>
    </>
  );
}
