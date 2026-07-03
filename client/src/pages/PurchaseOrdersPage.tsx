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
  cancelled: "已取消",
  customer_cancelled: "顾客不要了"
};

export function PurchaseOrdersPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("shipped");
  const [orderType, setOrderType] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(() => new Set());
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: orderResponse } = useQuery({
    queryKey: ["purchase-orders", keyword, status, orderType],
    queryFn: () => api<ListResponse<OrderListRow>>(`/orders?keyword=${encodeURIComponent(keyword)}&status=${encodeURIComponent(status)}&orderType=${encodeURIComponent(orderType)}`)
  });
  const orders = rowsFromListResponse(orderResponse).filter((order) => order.status !== "customer_cancelled");
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
  const cancelOrder = useMutation({
    mutationFn: (id: number) => api(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "customer_cancelled" }), notify: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["accessory-summary"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
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

  function categoryText(order: OrderListRow) {
    return order.orderType === "accessory" ? "配件" : "成品";
  }

  function markCustomerCancelled(order: OrderListRow) {
    if (!window.confirm(`确认订单 ${order.orderNo} 顾客不要了吗？`)) return;
    cancelOrder.mutate(order.id);
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
          <select value={orderType} onChange={(event) => setOrderType(event.target.value)}>
            <option value="">全部分类</option>
            <option value="dropship">成品</option>
            <option value="accessory">配件</option>
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
              <th>供应商</th>
              <th>分类</th>
              <th>店铺简称</th>
              <th>订单编号</th>
              <th>物料编码=品号</th>
              <th>SKU</th>
              <th>名称</th>
              <th>数量</th>
              <th>姓名</th>
              <th>电话</th>
              <th>收货地址</th>
              <th>采购订单号</th>
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
                <td>{order.supplierName ?? "-"}</td>
                <td>{categoryText(order)}</td>
                <td>{order.storeShortName || order.storeName || "-"}</td>
                <td>{order.orderNo}</td>
                <td>{order.materialCode || order.productSku || "-"}</td>
                <td>{order.productSku || "-"}</td>
                <td>{order.productName || "-"}</td>
                <td>{order.totalQuantity ?? 0}</td>
                <td>{order.customerName}</td>
                <td>{order.customerPhone ?? "-"}</td>
                <td>{order.address}</td>
                <td>
                  <input form={`purchase-order-${order.id}`} name="purchaseOrderNo" placeholder="采购订单号 *" defaultValue={order.purchaseOrderNo ?? ""} required />
                </td>
                <td><span className={`status ${order.status}`}>{order.returnStatus || statusText[order.status]}</span></td>
                <td>{order.note || order.shipmentNote || "-"}</td>
                <td className="row-actions">
                  <form id={`purchase-order-${order.id}`} className="inline-purchase-form" onSubmit={(event) => submitPurchaseOrder(order, event)}>
                    <input name="purchaseOrderUser" placeholder="采购下单人 *" defaultValue={order.purchaseOrderUser || me?.user?.username || ""} required />
                  </form>
                  <button type="submit" form={`purchase-order-${order.id}`} className="primary-button">{order.purchaseOrderNo ? "修改" : "提交"}</button>
                  <button type="button" onClick={() => markCustomerCancelled(order)} disabled={cancelOrder.isPending}>
                    不要了
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {savePurchaseOrder.error ? <div className="error">{savePurchaseOrder.error.message}</div> : null}
        {cancelOrder.error ? <div className="error">{cancelOrder.error.message}</div> : null}
      </Panel>
    </>
  );
}
