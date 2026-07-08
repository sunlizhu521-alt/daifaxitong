import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, rowsFromListResponse, type ListResponse, type OrderListRow } from "../api";
import { notifyApp } from "../ui/AppNotifications";
import { PageHeader, Panel } from "../ui/Section";

const statusText: Record<string, string> = {
  pending: "待发货",
  filled: "已填单号",
  purchased: "已下采购单",
  shipped: "快递取走",
  exception: "异常",
  cancelled: "已取消"
};

const carrierOptions = ["顺丰快递", "圆通快递", "中通快递", "申通快递", "京东快递", "其他"];

export function AccessoryShippingPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [keyword, setKeyword] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(() => new Set());
  const { data: orderResponse } = useQuery({
    queryKey: ["accessory-shipping", status, keyword],
    queryFn: () =>
      api<ListResponse<OrderListRow>>(
        `/orders?orderType=accessory&status=${encodeURIComponent(status)}&keyword=${encodeURIComponent(keyword)}`
      )
  });
  const orders = rowsFromListResponse(orderResponse).filter((order) => order.status !== "customer_cancelled" && order.status !== "cancelled");
  const selectedVisibleOrders = useMemo(() => orders.filter((order) => selectedOrderIds.has(order.id)), [orders, selectedOrderIds]);
  const allVisibleSelected = orders.length > 0 && orders.every((order) => selectedOrderIds.has(order.id));

  const ship = useMutation({
    mutationFn: ({ id, body, notify = true }: { id: number; body: unknown; notify?: boolean }) =>
      api(`/orders/${id}/ship`, { method: "POST", body: JSON.stringify(body), notify }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accessory-shipping"] });
      qc.invalidateQueries({ queryKey: ["accessory-summary"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });
  const cancelOrder = useMutation({
    mutationFn: (id: number) => api(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }), notify: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accessory-shipping"] });
      qc.invalidateQueries({ queryKey: ["accessory-summary"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });

  useEffect(() => {
    setSelectedOrderIds((current) => {
      const visibleIds = new Set(orders.map((order) => order.id));
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [orders]);

  function buildShipmentBody(order: OrderListRow, form: HTMLFormElement) {
    const data = new FormData(form);
    return {
      supplierId: order.supplierId ?? "",
      carrier: String(data.get("carrier") ?? "").trim(),
      trackingNo: String(data.get("trackingNo") ?? "").trim(),
      shippedAt: new Date().toISOString(),
      status: "shipped",
      note: order.shipmentNote ?? ""
    };
  }

  function submitShipment(order: OrderListRow, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ship.mutate({
      id: order.id,
      body: buildShipmentBody(order, event.currentTarget)
    });
  }

  function markUnwanted(order: OrderListRow) {
    if (!window.confirm(`确认配件订单 ${order.orderNo} 顾客不要了吗？`)) return;
    cancelOrder.mutate(order.id);
  }

  async function submitSelectedShipments() {
    if (selectedVisibleOrders.length === 0) {
      notifyApp({ variant: "error", message: "请先选择要批量提交的配件订单" });
      return;
    }
    const forms = selectedVisibleOrders
      .map((order) => ({ order, form: document.getElementById(`accessory-shipment-${order.id}`) as HTMLFormElement | null }))
      .filter((item): item is { order: OrderListRow; form: HTMLFormElement } => Boolean(item.form));
    for (const { form } of forms) {
      if (!form.reportValidity()) return;
    }
    let successCount = 0;
    try {
      for (const { order, form } of forms) {
        await ship.mutateAsync({
          id: order.id,
          body: buildShipmentBody(order, form),
          notify: false
        });
        successCount += 1;
      }
      setSelectedOrderIds(new Set());
      notifyApp({ variant: "success", message: `批量提交完成\n共选择 ${selectedVisibleOrders.length} 条，成功提交 ${successCount} 条。\n状态已更新为快递取走。` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "请求失败";
      notifyApp({ variant: "error", message: `批量提交中断\n已成功 ${successCount} 条，第 ${successCount + 1} 条失败。\n失败原因：${message}` });
    }
  }

  function toggleOrderSelected(orderId: number, checked: boolean) {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (checked) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      for (const order of orders) {
        if (checked) next.add(order.id);
        else next.delete(order.id);
      }
      return next;
    });
  }

  return (
    <>
      <PageHeader title="配件发货" description="查看配件订单，填写快递公司和发货单号后确认快递取走。" />
      <Panel title="配件发货信息">
        <div className="toolbar filter-toolbar">
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部状态</option>
            <option value="pending">待发货</option>
            <option value="filled">已填单号</option>
            <option value="shipped">快递取走</option>
          </select>
          <input placeholder="搜索订单号/姓名/电话/地址/品号/商品" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <button type="button" className="primary-button" onClick={submitSelectedShipments} disabled={ship.isPending}>
            批量提交
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th className="selection-cell">
                <input
                  type="checkbox"
                  aria-label="选择当前列表全部配件订单"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleAllVisible(event.target.checked)}
                />
              </th>
              <th>店铺</th>
              <th>订单编号</th>
              <th>售后姓名</th>
              <th>售后电话</th>
              <th>收货地址</th>
              <th>商品名称</th>
              <th>状态</th>
              <th>快递公司 *</th>
              <th>发货单号 *</th>
              <th>备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="selection-cell">
                  <input
                    type="checkbox"
                    aria-label={`选择订单 ${order.orderNo}`}
                    checked={selectedOrderIds.has(order.id)}
                    onChange={(event) => toggleOrderSelected(order.id, event.target.checked)}
                  />
                </td>
                <td>{order.storeShortName || order.storeName || "-"}</td>
                <td>{order.orderNo}</td>
                <td>{order.customerName}</td>
                <td>{order.customerPhone ?? "-"}</td>
                <td>{order.address}</td>
                <td>{order.productName || "-"}</td>
                <td><span className={`status ${order.status}`}>{order.returnStatus || statusText[order.status]}</span></td>
                <td>
                  <form id={`accessory-shipment-${order.id}`} className="inline-shipment-form" onSubmit={(event) => submitShipment(order, event)}>
                    <select name="carrier" defaultValue={order.carrier && carrierOptions.includes(order.carrier) ? order.carrier : ""} required>
                      <option value="">选择快递 *</option>
                      {carrierOptions.map((carrier) => (
                        <option value={carrier} key={carrier}>{carrier}</option>
                      ))}
                    </select>
                  </form>
                </td>
                <td>
                  <input form={`accessory-shipment-${order.id}`} name="trackingNo" placeholder="发货单号 *" defaultValue={order.trackingNo ?? ""} required />
                </td>
                <td>{order.note || order.shipmentNote || "-"}</td>
                <td className="row-actions">
                  <button type="submit" form={`accessory-shipment-${order.id}`} className="primary-button">快递取走</button>
                  <button type="button" onClick={() => markUnwanted(order)} disabled={cancelOrder.isPending}>
                    不要了
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ship.error ? <div className="error">{ship.error.message}</div> : null}
      </Panel>
    </>
  );
}
