import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type OrderListRow, type Supplier } from "../api";
import { PageHeader, Panel } from "../ui/Section";

const statusText: Record<string, string> = {
  pending: "待发货",
  shipped: "已发货",
  exception: "异常",
  cancelled: "已取消"
};

export function ShippingSchedulePage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [activeOrder, setActiveOrder] = useState<OrderListRow | null>(null);
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const { data: orders = [] } = useQuery({
    queryKey: ["shipping-schedule", status],
    queryFn: () => api<OrderListRow[]>(`/orders?status=${encodeURIComponent(status)}`)
  });
  const ship = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/orders/${id}/ship`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setActiveOrder(null);
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["tracking-orders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });

  function submitShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeOrder) return;
    ship.mutate({ id: activeOrder.id, body: Object.fromEntries(new FormData(event.currentTarget)) });
  }

  return (
    <>
      <PageHeader title="发货安排" description="查看待发货订单，登记供应商发货信息并确认已发货。" />
      <Panel title="发货信息">
        <div className="toolbar">
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="pending">待发货</option>
            <option value="shipped">已发货</option>
            <option value="exception">异常</option>
            <option value="">全部</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>代发单号</th>
              <th>客户</th>
              <th>电话</th>
              <th>收货地址</th>
              <th>数量</th>
              <th>供应商</th>
              <th>快递单号</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.orderNo}</td>
                <td>{order.customerName}</td>
                <td>{order.customerPhone ?? "-"}</td>
                <td>{order.address}</td>
                <td>{order.totalQuantity ?? 0}</td>
                <td>{order.supplierName ?? "-"}</td>
                <td>{order.trackingNo ?? "-"}</td>
                <td><span className={`status ${order.status}`}>{statusText[order.status]}</span></td>
                <td className="row-actions">
                  {order.status === "shipped" ? (
                    <button type="button" disabled>已发货</button>
                  ) : (
                    <button type="button" onClick={() => setActiveOrder(order)}>已发货</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {activeOrder ? (
        <div className="modal-backdrop" onClick={() => setActiveOrder(null)}>
          <form className="modal" onSubmit={submitShipment} onClick={(event) => event.stopPropagation()}>
            <h2>确认已发货：{activeOrder.orderNo}</h2>
            <select name="supplierId" defaultValue={activeOrder.supplierId ?? ""}>
              <option value="">选择发货供应商</option>
              {suppliers.map((supplier) => (
                <option value={supplier.id} key={supplier.id}>{supplier.shortName || supplier.name}</option>
              ))}
            </select>
            <input name="carrier" placeholder="快递公司" required />
            <input name="trackingNo" placeholder="快递单号" required />
            <input name="shippedAt" type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)} required />
            <input type="hidden" name="status" value="shipped" />
            <textarea name="note" placeholder="发货备注" />
            {ship.error ? <div className="error">{ship.error.message}</div> : null}
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setActiveOrder(null)}>取消</button>
              <button className="primary-button">已发货</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
