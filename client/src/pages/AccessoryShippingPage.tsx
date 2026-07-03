import { type FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, rowsFromListResponse, type ListResponse, type OrderListRow } from "../api";
import { PageHeader, Panel } from "../ui/Section";

const statusText: Record<string, string> = {
  pending: "待发货",
  filled: "已填单号",
  purchased: "已下采购单",
  shipped: "已发货",
  exception: "异常",
  cancelled: "已取消"
};

const carrierOptions = ["顺丰快递", "圆通快递", "中通快递", "京东快递", "其他"];

function defaultShipTime(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function AccessoryShippingPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [keyword, setKeyword] = useState("");
  const { data: orderResponse } = useQuery({
    queryKey: ["accessory-shipping", status, keyword],
    queryFn: () =>
      api<ListResponse<OrderListRow>>(
        `/orders?orderType=accessory&status=${encodeURIComponent(status)}&keyword=${encodeURIComponent(keyword)}`
      )
  });
  const orders = rowsFromListResponse(orderResponse);

  const ship = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/orders/${id}/ship`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accessory-shipping"] });
      qc.invalidateQueries({ queryKey: ["accessory-summary"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });

  function submitShipment(order: OrderListRow, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    ship.mutate({
      id: order.id,
      body: {
        supplierId: order.supplierId ?? "",
        carrier: String(form.get("carrier") ?? "").trim(),
        trackingNo: String(form.get("trackingNo") ?? "").trim(),
        shippedAt: form.get("shippedAt"),
        status: "shipped",
        note: order.shipmentNote ?? ""
      }
    });
  }

  return (
    <>
      <PageHeader title="配件发货" description="查看配件订单，填写快递公司和发货单号后确认已发货。" />
      <Panel title="配件发货信息">
        <div className="toolbar filter-toolbar">
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部状态</option>
            <option value="pending">待发货</option>
            <option value="filled">已填单号</option>
            <option value="shipped">已发货</option>
          </select>
          <input placeholder="搜索订单号/姓名/电话/地址/品号/商品" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        </div>
        <table>
          <thead>
            <tr>
              <th>店铺</th>
              <th>订单编号</th>
              <th>售后姓名</th>
              <th>售后电话</th>
              <th>收货地址</th>
              <th>供应商</th>
              <th>品号</th>
              <th>商品名称</th>
              <th>数量</th>
              <th>状态</th>
              <th>快递公司 *</th>
              <th>发货单号 *</th>
              <th>发货时间 *</th>
              <th>操作</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.storeName || "-"}</td>
                <td>{order.orderNo}</td>
                <td>{order.customerName}</td>
                <td>{order.customerPhone ?? "-"}</td>
                <td>{order.address}</td>
                <td>{order.supplierName ?? "-"}</td>
                <td>{order.productSku || "-"}</td>
                <td>{order.productName || "-"}</td>
                <td>{order.totalQuantity ?? 0}</td>
                <td><span className={`status ${order.status}`}>{statusText[order.status]}</span></td>
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
                <td>
                  <input form={`accessory-shipment-${order.id}`} name="shippedAt" type="datetime-local" defaultValue={defaultShipTime(order.shippedAt)} required />
                </td>
                <td className="row-actions">
                  <button type="submit" form={`accessory-shipment-${order.id}`} className="primary-button">已发货</button>
                </td>
                <td>{order.note || order.shipmentNote || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ship.error ? <div className="error">{ship.error.message}</div> : null}
      </Panel>
    </>
  );
}
