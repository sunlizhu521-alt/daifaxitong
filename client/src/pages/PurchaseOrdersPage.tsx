import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, rowsFromListResponse, type ListResponse, type OrderListRow, type User } from "../api";
import { notifyApp } from "../ui/AppNotifications";
import { PageHeader, Panel } from "../ui/Section";

const statusText: Record<string, string> = {
  pending: "待发货",
  filled: "已填单号",
  purchased: "已下采购单",
  shipped: "已发货",
  exception: "异常",
  cancelled: "已取消"
};

export function PurchaseOrdersPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("shipped");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(() => new Set());
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: orderResponse } = useQuery({
    queryKey: ["purchase-orders", keyword, status],
    queryFn: () => api<ListResponse<OrderListRow>>(`/orders?keyword=${encodeURIComponent(keyword)}&status=${encodeURIComponent(status)}`)
  });
  const orders = rowsFromListResponse(orderResponse);
  const selectedVisibleOrders = useMemo(() => orders.filter((order) => selectedOrderIds.has(order.id)), [orders, selectedOrderIds]);
  const allVisibleSelected = orders.length > 0 && orders.every((order) => selectedOrderIds.has(order.id));
  const savePurchaseOrder = useMutation({
    mutationFn: ({ id, purchaseOrderNo, purchaseOrderUser }: { id: number; purchaseOrderNo: string; purchaseOrderUser: string }) =>
      api(`/orders/${id}/purchase-order`, { method: "PATCH", body: JSON.stringify({ purchaseOrderNo, purchaseOrderUser }), notify: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    }
  });

  useEffect(() => {
    setSelectedOrderIds((current) => {
      const visibleIds = new Set(orders.map((order) => order.id));
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [orders]);

  function buildPurchaseOrderBody(order: OrderListRow, form: HTMLFormElement) {
    const data = new FormData(form);
    return {
      id: order.id,
      purchaseOrderNo: String(data.get("purchaseOrderNo") ?? "").trim(),
      purchaseOrderUser: order.purchaseOrderNo
        ? order.purchaseOrderUser || me?.user?.username || ""
        : String(data.get("purchaseOrderUser") ?? me?.user?.username ?? "").trim()
    };
  }

  function submitPurchaseOrder(order: OrderListRow, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    savePurchaseOrder.mutate(buildPurchaseOrderBody(order, event.currentTarget));
  }

  async function submitSelectedPurchaseOrders() {
    if (selectedVisibleOrders.length === 0) {
      notifyApp({ variant: "error", message: "请先选择要批量提交的订单" });
      return;
    }
    try {
      for (const order of selectedVisibleOrders) {
        const form = document.getElementById(`purchase-order-${order.id}`) as HTMLFormElement | null;
        if (!form) continue;
        if (!form.reportValidity()) return;
        await savePurchaseOrder.mutateAsync(buildPurchaseOrderBody(order, form));
      }
      setSelectedOrderIds(new Set());
    } catch {
      // api 层已经弹出失败原因，这里不重复提示。
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
      <PageHeader title="采购订单" description="从发货安排复制的订单视图，用于给代发订单填写采购订单号。" />
      <Panel title="采购订单信息">
        <div className="toolbar filter-toolbar">
          <input placeholder="搜索订单号/采购订单号/客户/商品" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="purchased">已下采购单</option>
            <option value="shipped">已发货</option>
          </select>
          <button type="button" className="primary-button" onClick={submitSelectedPurchaseOrders} disabled={savePurchaseOrder.isPending}>
            批量提交
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th className="selection-cell">
                <input
                  type="checkbox"
                  aria-label="选择当前列表全部订单"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleAllVisible(event.target.checked)}
                />
              </th>
              <th>采购下单人 *</th>
              <th>供应商</th>
              <th>店铺</th>
              <th>订单编号</th>
              <th>采购订单号 *</th>
              <th>客户姓名</th>
              <th>电话</th>
              <th>收货地址</th>
              <th>系列</th>
              <th>SKU</th>
              <th>数量</th>
              <th>状态</th>
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
                <td>
                  <form id={`purchase-order-${order.id}`} onSubmit={(event) => submitPurchaseOrder(order, event)}>
                    <input name="purchaseOrderUser" placeholder="采购下单人 *" defaultValue={order.purchaseOrderUser || me?.user?.username || ""} required />
                  </form>
                </td>
                <td>{order.supplierName ?? "-"}</td>
                <td>{order.storeName || "-"}</td>
                <td>{order.orderNo}</td>
                <td>
                  <input form={`purchase-order-${order.id}`} name="purchaseOrderNo" placeholder="填写采购订单号 *" defaultValue={order.purchaseOrderNo ?? ""} required />
                </td>
                <td>{order.customerName}</td>
                <td>{order.customerPhone ?? "-"}</td>
                <td>{order.address}</td>
                <td>{order.productSeries || "-"}</td>
                <td>{order.productSku || "-"}</td>
                <td>{order.totalQuantity ?? 0}</td>
                <td><span className={`status ${order.status}`}>{statusText[order.status]}</span></td>
                <td>{order.note || order.shipmentNote || "-"}</td>
                <td className="row-actions">
                  <button type="submit" form={`purchase-order-${order.id}`} className="primary-button">{order.purchaseOrderNo ? "修改" : "提交"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {savePurchaseOrder.error ? <div className="error">{savePurchaseOrder.error.message}</div> : null}
      </Panel>
    </>
  );
}
