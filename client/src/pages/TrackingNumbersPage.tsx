import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, rowsFromListResponse, type Carrier, type ListResponse, type OrderListRow, type Product, type Store, type Supplier } from "../api";
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
        `/orders?orderType=dropship&keyword=${encodeURIComponent(keyword)}&storeName=${encodeURIComponent(storeName)}&supplierId=${encodeURIComponent(supplierId)}&series=${encodeURIComponent(series)}&sku=${encodeURIComponent(sku)}&hasTracking=${encodeURIComponent(hasTracking)}`
      )
  });
  const orders = rowsFromListResponse(orderResponse).filter((order) => order.status !== "customer_cancelled");
  const defaultCarrierId =
    carriers
      .find((carrier) => carrier.name.trim() === "顺丰速运")
      ?.id.toString() ??
    carriers
      .find((carrier) => carrier.name.includes("顺丰"))
      ?.id.toString() ??
    "";
  const selectedVisibleOrders = useMemo(() => orders.filter((order) => selectedOrderIds.has(order.id)), [orders, selectedOrderIds]);
  const allVisibleSelected = orders.length > 0 && orders.every((order) => selectedOrderIds.has(order.id));
  const ship = useMutation({
    mutationFn: ({ id, body, notify = true }: { id: number; body: unknown; notify?: boolean }) =>
      api(`/orders/${id}/ship`, { method: "POST", body: JSON.stringify(body), notify }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tracking-orders"] });
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });
  const cancelOrder = useMutation({
    mutationFn: (id: number) => api(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "customer_cancelled" }), notify: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tracking-orders"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
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
      shippedAt: defaultShipTime(order.shippedAt),
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
    const forms = selectedVisibleOrders
      .map((order) => ({ order, form: document.getElementById(`shipment-${order.id}`) as HTMLFormElement | null }))
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
      notifyApp({ variant: "success", message: `批量提交完成\n共选择 ${selectedVisibleOrders.length} 条，成功提交 ${successCount} 条。` });
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

  function markCustomerCancelled(order: OrderListRow) {
    if (!window.confirm(`确认订单 ${order.orderNo} 顾客不要了吗？`)) return;
    cancelOrder.mutate(order.id);
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
              <th>店铺</th>
              <th>订单号</th>
              <th>姓名</th>
              <th>SKU</th>
              <th>数量</th>
              <th>地址</th>
              <th>状态</th>
              <th>快递公司 *</th>
              <th>发货单号 *</th>
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
                <td>{order.productSku || "-"}</td>
                <td>{order.totalQuantity ?? 0}</td>
                <td>{order.address}</td>
                <td>
                  <span className={`status ${order.status}`}>{order.returnStatus || statusText[order.status]}</span>
                </td>
                <td>
                  <form id={`shipment-${order.id}`} className="inline-shipment-form" onSubmit={(event) => submitShipment(order, event)}>
                    <select name="carrierId" key={`${order.id}-${order.carrierId ?? defaultCarrierId}`} defaultValue={order.carrierId ?? defaultCarrierId} required>
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
                <td className="row-actions">
                  <button type="submit" form={`shipment-${order.id}`} className="primary-button">提交</button>
                  <button type="button" onClick={() => markCustomerCancelled(order)} disabled={cancelOrder.isPending}>
                    不要了
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ship.error ? <div className="error">{ship.error.message}</div> : null}
        {cancelOrder.error ? <div className="error">{cancelOrder.error.message}</div> : null}
      </Panel>
    </>
  );
}
