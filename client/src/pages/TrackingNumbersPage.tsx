import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, rowsFromListResponse, type Carrier, type ListResponse, type OrderListRow, type Product, type Store, type Supplier } from "../api";
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

function defaultShipTime(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function TrackingNumbersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(() => searchParams.get("keyword") ?? "");
  const [storeName, setStoreName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [series, setSeries] = useState("");
  const [sku, setSku] = useState("");
  const [hasTracking, setHasTracking] = useState("no");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(() => new Set());
  const { data: carriers = [] } = useQuery({ queryKey: ["carriers"], queryFn: () => api<Carrier[]>("/carriers") });
  const { data: stores = [] } = useQuery({ queryKey: ["stores"], queryFn: () => api<Store[]>("/stores") });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
  const seriesOptions = useMemo(() => [...new Set(products.map((product) => product.series).filter(Boolean))], [products]);
  const skuOptions = useMemo(() => [...new Set(products.map((product) => product.ssku ?? product.sku).filter(Boolean))], [products]);
  const { data: orderResponse } = useQuery({
    queryKey: ["tracking-orders", keyword, storeName, supplierId, series, sku, hasTracking],
    queryFn: () =>
      api<ListResponse<OrderListRow>>(
        `/orders?keyword=${encodeURIComponent(keyword)}&storeName=${encodeURIComponent(storeName)}&supplierId=${encodeURIComponent(supplierId)}&series=${encodeURIComponent(series)}&sku=${encodeURIComponent(sku)}&hasTracking=${encodeURIComponent(hasTracking)}`
      )
  });
  const orders = rowsFromListResponse(orderResponse);
  const selectedVisibleOrders = useMemo(() => orders.filter((order) => selectedOrderIds.has(order.id)), [orders, selectedOrderIds]);
  const allVisibleSelected = orders.length > 0 && orders.every((order) => selectedOrderIds.has(order.id));
  const ship = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/orders/${id}/ship`, { method: "POST", body: JSON.stringify(body), notify: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tracking-orders"] });
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });
  const deleteShipment = useMutation({
    mutationFn: (id: number) => api(`/orders/${id}/shipment`, { method: "DELETE", notify: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tracking-orders"] });
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
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

  function buildShipmentBody(order: OrderListRow, form: HTMLFormElement) {
    const data = new FormData(form);
    const carrierId = Number(data.get("carrierId"));
    const carrier = carriers.find((item) => item.id === carrierId);
    return {
      supplierId: order.supplierId ?? "",
      carrierId: data.get("carrierId"),
      carrier: carrier?.name ?? "",
      trackingNo: data.get("trackingNo"),
      shippedAt: data.get("shippedAt"),
      status: "filled",
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

  async function submitSelectedShipments() {
    if (selectedVisibleOrders.length === 0) {
      notifyApp({ variant: "error", message: "请先选择要批量提交的订单" });
      return;
    }
    for (const order of selectedVisibleOrders) {
      const form = document.getElementById(`shipment-${order.id}`) as HTMLFormElement | null;
      if (!form) continue;
      if (!form.reportValidity()) return;
      await ship.mutateAsync({
        id: order.id,
        body: buildShipmentBody(order, form)
      });
    }
    setSelectedOrderIds(new Set());
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

  function removeShipment(order: OrderListRow) {
    if (!window.confirm(`确定删除订单 ${order.orderNo} 的发货单号吗？`)) return;
    deleteShipment.mutate(order.id);
  }

  return (
    <>
      <PageHeader title="发货单号" description="查询代发订单状态、客户信息和快递流转记录。" />
      <Panel title="发货单号查询">
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
          <select value={hasTracking} onChange={(event) => setHasTracking(event.target.value)}>
            <option value="no">未填快递号</option>
            <option value="yes">已填快递号</option>
            <option value="">全部</option>
          </select>
          <input placeholder="搜索订单号/客户/电话/地址/商品" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
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
                  aria-label="选择当前列表全部订单"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleAllVisible(event.target.checked)}
                />
              </th>
              <th>订单号</th>
              <th>客户</th>
              <th>快递公司 *</th>
              <th>发货单号 *</th>
              <th>供应商</th>
              <th>数量</th>
              <th>状态</th>
              <th>发货时间 *</th>
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
                <td>{order.orderNo}</td>
                <td>{order.customerName}</td>
                <td>
                  <form id={`shipment-${order.id}`} className="inline-shipment-form" onSubmit={(event) => submitShipment(order, event)}>
                    <select name="carrierId" defaultValue={order.carrierId ?? ""} required>
                      <option value="">选择快递 *</option>
                      {carriers.map((carrier) => (
                        <option value={carrier.id} key={carrier.id}>{carrier.name}</option>
                      ))}
                    </select>
                  </form>
                </td>
                <td>
                  <input form={`shipment-${order.id}`} name="trackingNo" placeholder="发货单号 *" defaultValue={order.trackingNo ?? ""} required />
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
                  <button type="submit" form={`shipment-${order.id}`} className="primary-button">提交</button>
                  <button type="button" onClick={() => removeShipment(order)}>删除</button>
                  <button type="button" onClick={() => navigate(`/returns?keyword=${encodeURIComponent(order.orderNo)}`)}>退货</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ship.error ? <div className="error">{ship.error.message}</div> : null}
        {deleteShipment.error ? <div className="error">{deleteShipment.error.message}</div> : null}
      </Panel>
    </>
  );
}
