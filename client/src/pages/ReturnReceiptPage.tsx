import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ReturnRecord } from "../api";
import { notifyApp } from "../ui/AppNotifications";
import { PageHeader, Panel } from "../ui/Section";

export function ReturnReceiptPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<number>>(() => new Set());
  const { data: returns = [] } = useQuery({
    queryKey: ["return-receipts", keyword],
    queryFn: () => api<ReturnRecord[]>(`/returns?status=${encodeURIComponent("退回中")}&keyword=${encodeURIComponent(keyword)}`)
  });
  const receiveReturn = useMutation({
    mutationFn: (input: number | { id: number; notify?: boolean }) => {
      const payload = typeof input === "number" ? { id: input, notify: true } : input;
      return api(`/returns/${payload.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "退货成功" }), notify: payload.notify ?? true });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["return-receipts"] });
      qc.invalidateQueries({ queryKey: ["return-operations"] });
      qc.invalidateQueries({ queryKey: ["return-orders"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["accessory-summary"] });
      qc.invalidateQueries({ queryKey: ["tracking-orders"] });
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["accessory-shipping"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    }
  });
  const selectedVisibleReturns = useMemo(() => returns.filter((row) => selectedReturnIds.has(row.id)), [returns, selectedReturnIds]);
  const allVisibleSelected = returns.length > 0 && returns.every((row) => selectedReturnIds.has(row.id));

  useEffect(() => {
    setSelectedReturnIds((current) => {
      const visibleIds = new Set(returns.map((row) => row.id));
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [returns]);

  function confirmReceived(row: ReturnRecord) {
    if (!window.confirm(`确认订单 ${row.orderNo} 已经退货收货吗？`)) return;
    receiveReturn.mutate(row.id);
  }

  async function receiveSelectedReturns() {
    if (selectedVisibleReturns.length === 0) {
      notifyApp({ variant: "error", message: "请先选择要批量操作的退货记录" });
      return;
    }
    if (!window.confirm(`确认批量收货 ${selectedVisibleReturns.length} 条退货记录吗？`)) return;
    let successCount = 0;
    try {
      for (const row of selectedVisibleReturns) {
        await receiveReturn.mutateAsync({ id: row.id, notify: false });
        successCount += 1;
      }
      setSelectedReturnIds(new Set());
      notifyApp({ variant: "success", message: `批量操作完成\n共选择 ${selectedVisibleReturns.length} 条，成功处理 ${successCount} 条。\n状态已更新为退货成功。` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "请求失败";
      notifyApp({ variant: "error", message: `批量操作中断\n已成功 ${successCount} 条，第 ${successCount + 1} 条失败。\n失败原因：${message}` });
    }
  }

  function toggleReturnSelected(returnId: number, checked: boolean) {
    setSelectedReturnIds((current) => {
      const next = new Set(current);
      if (checked) next.add(returnId);
      else next.delete(returnId);
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedReturnIds((current) => {
      const next = new Set(current);
      for (const row of returns) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }

  return (
    <>
      <PageHeader title="退货收货" description="处理退货待接收的退货记录，确认退货包裹是否已经收货。" />
      <Panel title="待收货退货">
        <div className="toolbar filter-toolbar">
          <input
            placeholder="搜索订单号/姓名/电话/地址/SKU/退货单号"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <button type="button" className="primary-button" onClick={receiveSelectedReturns} disabled={receiveReturn.isPending}>
            批量操作
          </button>
        </div>
        <table className="nowrap-table">
          <thead>
            <tr>
              <th className="selection-cell">
                <input
                  type="checkbox"
                  aria-label="选择当前列表全部退货记录"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleAllVisible(event.target.checked)}
                />
              </th>
              <th>退货时间</th>
              <th>店铺</th>
              <th>订单号</th>
              <th>姓名</th>
              <th>电话</th>
              <th>地址</th>
              <th>SKU</th>
              <th>数量</th>
              <th>快递公司</th>
              <th>退货单号</th>
              <th>快递单号状态</th>
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
                <td className="selection-cell">
                  <input
                    type="checkbox"
                    aria-label={`选择退货记录 ${row.orderNo}`}
                    checked={selectedReturnIds.has(row.id)}
                    onChange={(event) => toggleReturnSelected(row.id, event.target.checked)}
                  />
                </td>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.storeName || "-"}</td>
                <td>{row.orderNo}</td>
                <td>{row.customerName}</td>
                <td>{row.customerPhone || "-"}</td>
                <td>{row.address}</td>
                <td>{row.productSku || "-"}</td>
                <td>{row.totalQuantity ?? "-"}</td>
                <td>{row.returnCarrier || row.shipmentCarrier || "-"}</td>
                <td>{row.trackingNo || "-"}</td>
                <td>{row.returnLogisticsStatus || "-"}</td>
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
