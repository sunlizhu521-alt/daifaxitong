import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, type Carrier, type OrderListRow, type Product, type Store, type Supplier } from "../api";
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
  const [searchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(() => searchParams.get("keyword") ?? "");
  const [storeName, setStoreName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [series, setSeries] = useState("");
  const [sku, setSku] = useState("");
  const { data: carriers = [] } = useQuery({ queryKey: ["carriers"], queryFn: () => api<Carrier[]>("/carriers") });
  const { data: stores = [] } = useQuery({ queryKey: ["stores"], queryFn: () => api<Store[]>("/stores") });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
  const seriesOptions = useMemo(() => [...new Set(products.map((product) => product.series).filter(Boolean))], [products]);
  const skuOptions = useMemo(() => [...new Set(products.map((product) => product.ssku ?? product.sku).filter(Boolean))], [products]);
  const { data: orders = [] } = useQuery({
    queryKey: ["tracking-orders", keyword, storeName, supplierId, series, sku],
    queryFn: () =>
      api<OrderListRow[]>(
        `/orders?keyword=${encodeURIComponent(keyword)}&storeName=${encodeURIComponent(storeName)}&supplierId=${encodeURIComponent(supplierId)}&series=${encodeURIComponent(series)}&sku=${encodeURIComponent(sku)}`
      )
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
        <div className="toolbar filter-toolbar">
          <select value={storeName} onChange={(event) => setStoreName(event.target.value)}>
            <option value="">全部店铺</option>
            {stores.map((store) => (
              <option value={store.name} key={store.id}>{store.shortName || store.name}</option>
            ))}
          </select>
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">全部供应商</option>
            {suppliers.map((supplier) => (
              <option value={supplier.id} key={supplier.id}>{supplier.shortName || supplier.name}</option>
            ))}
          </select>
          <select value={series} onChange={(event) => setSeries(event.target.value)}>
            <option value="">全部系列</option>
            {seriesOptions.map((item) => (
              <option value={item} key={item}>{item}</option>
            ))}
          </select>
          <select value={sku} onChange={(event) => setSku(event.target.value)}>
            <option value="">全部 SKU</option>
            {skuOptions.map((item) => (
              <option value={item} key={item}>{item}</option>
            ))}
          </select>
          <input placeholder="搜索订单号/客户/电话/地址/商品" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
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
