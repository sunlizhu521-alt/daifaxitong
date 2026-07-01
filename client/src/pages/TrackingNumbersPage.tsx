import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Carrier, type OrderListRow } from "../api";
import { PageHeader, Panel } from "../ui/Section";

const statusText: Record<string, string> = {
  pending: "待发货",
  shipped: "已发货",
  exception: "异常",
  cancelled: "已取消"
};

function defaultShipTime(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function TrackingNumbersPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const { data: carriers = [] } = useQuery({ queryKey: ["carriers"], queryFn: () => api<Carrier[]>("/carriers") });
  const { data: orders = [] } = useQuery({
    queryKey: ["tracking-orders", keyword],
    queryFn: () => api<OrderListRow[]>(`/orders?keyword=${encodeURIComponent(keyword)}`)
  });
  const ship = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/orders/${id}/ship`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tracking-orders"] });
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });

  function submitShipment(order: OrderListRow, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const carrierId = Number(form.get("carrierId"));
    const carrier = carriers.find((item) => item.id === carrierId);
    ship.mutate({
      id: order.id,
      body: {
        supplierId: order.supplierId ?? "",
        carrierId: form.get("carrierId"),
        carrier: carrier?.name ?? "",
        trackingNo: form.get("trackingNo"),
        shippedAt: form.get("shippedAt"),
        status: "shipped",
        note: order.shipmentNote ?? ""
      }
    });
  }

  return (
    <>
      <PageHeader title="快递单号" description="查询代发订单状态、客户信息和快递流转记录。" />
      <Panel title="快递单号查询">
        <div className="toolbar">
          <input placeholder="搜索订单号/客户/商品" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        </div>
        <table>
          <thead>
            <tr>
              <th>订单号</th>
              <th>客户</th>
              <th>快递公司</th>
              <th>快递单号</th>
              <th>供应商</th>
              <th>数量</th>
              <th>状态</th>
              <th>发货时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.orderNo}</td>
                <td>{order.customerName}</td>
                <td>
                  <form id={`shipment-${order.id}`} className="inline-shipment-form" onSubmit={(event) => submitShipment(order, event)}>
                    <select name="carrierId" defaultValue={order.carrierId ?? ""} required>
                      <option value="">选择快递</option>
                      {carriers.map((carrier) => (
                        <option value={carrier.id} key={carrier.id}>{carrier.name}</option>
                      ))}
                    </select>
                  </form>
                </td>
                <td>
                  <input form={`shipment-${order.id}`} name="trackingNo" placeholder="快递单号" defaultValue={order.trackingNo ?? ""} required />
                </td>
                <td>{order.supplierName ?? "-"}</td>
                <td>{order.totalQuantity ?? 0}</td>
                <td>
                  <span className={`status ${order.status}`}>{statusText[order.status]}</span>
                </td>
                <td>
                  <input form={`shipment-${order.id}`} name="shippedAt" type="datetime-local" defaultValue={defaultShipTime(order.shippedAt)} required />
                </td>
                <td className="row-actions">
                  <button form={`shipment-${order.id}`} className="primary-button">{order.trackingNo ? "编辑" : "提交"}</button>
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
