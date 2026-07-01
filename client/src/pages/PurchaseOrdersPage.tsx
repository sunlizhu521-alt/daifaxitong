import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type OrderListRow, type User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

const statusText: Record<string, string> = {
  pending: "待发货",
  filled: "已填单号",
  shipped: "已发货",
  exception: "异常",
  cancelled: "已取消"
};

export function PurchaseOrdersPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: orders = [] } = useQuery({
    queryKey: ["purchase-orders", keyword, status],
    queryFn: () => api<OrderListRow[]>(`/orders?keyword=${encodeURIComponent(keyword)}&status=${encodeURIComponent(status)}`)
  });
  const savePurchaseOrder = useMutation({
    mutationFn: ({ id, purchaseOrderNo, purchaseOrderUser }: { id: number; purchaseOrderNo: string; purchaseOrderUser: string }) =>
      api(`/orders/${id}/purchase-order`, { method: "PATCH", body: JSON.stringify({ purchaseOrderNo, purchaseOrderUser }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    }
  });
  const deletePurchaseOrder = useMutation({
    mutationFn: (id: number) => api(`/orders/${id}/purchase-order`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    }
  });

  function submitPurchaseOrder(order: OrderListRow, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    savePurchaseOrder.mutate({
      id: order.id,
      purchaseOrderNo: String(form.get("purchaseOrderNo") ?? "").trim(),
      purchaseOrderUser: String(form.get("purchaseOrderUser") ?? me?.user?.username ?? "").trim()
    });
  }

  function removePurchaseOrder(order: OrderListRow) {
    if (!window.confirm(`确定删除订单 ${order.orderNo} 的采购订单号吗？`)) return;
    deletePurchaseOrder.mutate(order.id);
  }

  return (
    <>
      <PageHeader title="采购订单" description="从发货安排复制的订单视图，用于给代发订单填写采购订单号。" />
      <Panel title="采购订单信息">
        <div className="toolbar filter-toolbar">
          <input placeholder="搜索订单号/采购订单号/客户/商品" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部状态</option>
            <option value="pending">待发货</option>
            <option value="filled">已填单号</option>
            <option value="shipped">已发货</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>采购下单人</th>
              <th>供应商</th>
              <th>店铺</th>
              <th>订单编号</th>
              <th>采购订单号</th>
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
                <td>
                  <form id={`purchase-order-${order.id}`} onSubmit={(event) => submitPurchaseOrder(order, event)}>
                    <input name="purchaseOrderUser" placeholder="采购下单人" defaultValue={order.purchaseOrderUser || me?.user?.username || ""} required />
                  </form>
                </td>
                <td>{order.supplierName ?? "-"}</td>
                <td>{order.storeName || "-"}</td>
                <td>{order.orderNo}</td>
                <td>
                  <input form={`purchase-order-${order.id}`} name="purchaseOrderNo" placeholder="填写采购订单号" defaultValue={order.purchaseOrderNo ?? ""} required />
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
                  <button type="submit" form={`purchase-order-${order.id}`} className="primary-button">{order.purchaseOrderNo ? "编辑" : "提交"}</button>
                  <button type="button" onClick={() => removePurchaseOrder(order)}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {savePurchaseOrder.error ? <div className="error">{savePurchaseOrder.error.message}</div> : null}
        {deletePurchaseOrder.error ? <div className="error">{deletePurchaseOrder.error.message}</div> : null}
      </Panel>
    </>
  );
}
