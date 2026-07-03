import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ReturnRecord } from "../api";
import { notifyApp } from "../ui/AppNotifications";
import { PageHeader, Panel } from "../ui/Section";

function canEditReturnTracking(action: string) {
  return action === "自行寄回" || action === "寄回" || action === "上门取件";
}

function actionText(action: string) {
  return action === "寄回" ? "自行寄回" : action;
}

export function ReturnOperationPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [trackingNos, setTrackingNos] = useState<Record<number, string>>({});
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<number>>(() => new Set());
  const { data: returns = [] } = useQuery({
    queryKey: ["return-operations", keyword],
    queryFn: () => api<ReturnRecord[]>(`/returns?status=${encodeURIComponent("已提交退货")}&keyword=${encodeURIComponent(keyword)}`)
  });

  const completeReturn = useMutation({
    mutationFn: ({ id, trackingNo }: { id: number; trackingNo: string }) =>
      api(`/returns/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "退回中", trackingNo }), notify: true }),
    onSuccess: () => {
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

  function returnTrackingNo(row: ReturnRecord) {
    return canEditReturnTracking(row.action) ? (trackingNos[row.id] ?? row.trackingNo ?? "").trim() : row.shipmentTrackingNo ?? row.trackingNo ?? "";
  }

  function confirmComplete(row: ReturnRecord) {
    if (!window.confirm(`确认订单 ${row.orderNo} 已经完成退货操作吗？`)) return;
    completeReturn.mutate({ id: row.id, trackingNo: returnTrackingNo(row) });
  }

  async function completeSelectedReturns() {
    if (selectedVisibleReturns.length === 0) {
      notifyApp({ variant: "error", message: "请先选择要批量操作的退货记录" });
      return;
    }
    if (!window.confirm(`确认批量完成 ${selectedVisibleReturns.length} 条退货操作吗？`)) return;
    try {
      for (const row of selectedVisibleReturns) {
        await completeReturn.mutateAsync({ id: row.id, trackingNo: returnTrackingNo(row) });
      }
      setSelectedReturnIds(new Set());
    } catch {
      // api 层已经弹出失败原因，这里不重复提示。
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
      <PageHeader title="退货操作" description="处理已经提交退货登记的订单，确认拦截、自行寄回或上门取件是否已经完成。" />
      <Panel title="待操作退货">
        <div className="toolbar filter-toolbar">
          <input
            placeholder="搜索订单号/姓名/电话/地址/型号/发货单号"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <button type="button" className="primary-button" onClick={completeSelectedReturns} disabled={completeReturn.isPending}>
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
              <th>发货单号</th>
              <th>退货理由</th>
              <th>状态</th>
              <th>备注</th>
              <th>附件</th>
              <th>处理</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((row) => {
              const trackingNo = returnTrackingNo(row);
              const editableTracking = canEditReturnTracking(row.action);
              const trackingPlaceholder = editableTracking ? "可填写退货发货单号" : "暂无发货单号";
              return (
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
                  <td>{row.supplierName || "-"}</td>
                  <td>{row.operator || "-"}</td>
                  <td>{row.orderNo}</td>
                  <td>{row.customerName}</td>
                  <td>{row.customerPhone || "-"}</td>
                  <td>{row.address}</td>
                  <td>{row.productSeries || "-"}</td>
                  <td>{row.productSku || "-"}</td>
                  <td>{row.model || "-"}</td>
                  <td>{actionText(row.action)}</td>
                  <td>
                    <input
                      value={trackingNo}
                      onChange={(event) => setTrackingNos((current) => ({ ...current, [row.id]: event.target.value }))}
                      placeholder={trackingPlaceholder}
                      readOnly={!editableTracking}
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
