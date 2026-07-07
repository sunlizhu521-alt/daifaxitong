import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile, rowsFromListResponse, type ListResponse, type OrderListRow } from "../api";
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

function formatCreatedAt(value?: string) {
  if (!value) return "-";
  return value.slice(0, 19).replace("T", " ");
}

function formatLatestShipTime(value?: string) {
  if (!value) return "-";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "-";
  return new Date(timestamp + 48 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

function uniqueOptions(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function ShippingSchedulePage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [keyword, setKeyword] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [skuFilter, setSkuFilter] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(() => new Set());
  const [supplierNotes, setSupplierNotes] = useState<Record<number, string>>({});
  const { data: orderResponse } = useQuery({
    queryKey: ["shipping-schedule"],
    queryFn: () => api<ListResponse<OrderListRow>>("/orders?status=&includeAccessoryPending=yes")
  });
  const orders = rowsFromListResponse(orderResponse).filter((order) => order.status === "pending" || order.status === "filled");
  const supplierOptions = useMemo(() => uniqueOptions(orders.map((order) => order.supplierName)), [orders]);
  const storeOptions = useMemo(() => uniqueOptions(orders.map((order) => order.storeShortName || order.storeName)), [orders]);
  const seriesOptions = useMemo(() => uniqueOptions(orders.map((order) => order.productSeries)), [orders]);
  const skuOptions = useMemo(() => uniqueOptions(orders.map((order) => order.productSku)), [orders]);
  const filteredOrders = useMemo(() => {
    const search = keyword.trim().toLowerCase();
    return orders.filter((order) => {
      const storeText = order.storeShortName || order.storeName || "";
      const haystack = [
        order.supplierName,
        order.registrarName,
        formatCreatedAt(order.createdAt),
        storeText,
        order.orderNo,
        order.customerName,
        order.customerPhone,
        order.address,
        order.productSeries,
        order.productSku,
        order.productName,
        order.supplierModel,
        order.carrier,
        order.trackingNo,
        order.note,
        order.shipmentNote,
        order.supplierNote
      ].join(" ").toLowerCase();
      return (
        (!status || order.status === status) &&
        (!supplierFilter || order.supplierName === supplierFilter) &&
        (!storeFilter || storeText === storeFilter) &&
        (!seriesFilter || order.productSeries === seriesFilter) &&
        (!skuFilter || order.productSku === skuFilter) &&
        (!search || haystack.includes(search))
      );
    });
  }, [orders, status, keyword, supplierFilter, storeFilter, seriesFilter, skuFilter]);
  const selectedVisibleOrders = useMemo(() => filteredOrders.filter((order) => selectedOrderIds.has(order.id)), [filteredOrders, selectedOrderIds]);
  const allVisibleSelected = filteredOrders.length > 0 && filteredOrders.every((order) => selectedOrderIds.has(order.id));
  const markShipped = useMutation({
    mutationFn: (input: number | { id: number; supplierNote?: string; notify?: boolean }) => {
      const payload = typeof input === "number" ? { id: input, supplierNote: supplierNotes[input] ?? "", notify: true } : input;
      return api(`/orders/${payload.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "shipped", supplierNote: payload.supplierNote ?? "" }), notify: payload.notify ?? true });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });
  const saveSupplierNote = useMutation({
    mutationFn: ({ id, supplierNote }: { id: number; supplierNote: string }) =>
      api(`/orders/${id}/supplier-note`, { method: "PATCH", body: JSON.stringify({ supplierNote }), notify: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["accessory-summary"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });

  useEffect(() => {
    setSelectedOrderIds((current) => {
      const visibleIds = new Set(filteredOrders.map((order) => order.id));
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [filteredOrders]);

  async function submitSelectedOrders() {
    if (selectedVisibleOrders.length === 0) {
      notifyApp({ variant: "error", message: "请先选择要批量提交的订单" });
      return;
    }
    let successCount = 0;
    try {
      for (const order of selectedVisibleOrders) {
        await markShipped.mutateAsync({ id: order.id, supplierNote: supplierNotes[order.id] ?? order.supplierNote ?? "", notify: false });
        successCount += 1;
      }
      setSelectedOrderIds(new Set());
      notifyApp({ variant: "success", message: `批量提交完成\n共选择 ${selectedVisibleOrders.length} 条，成功提交 ${successCount} 条。\n状态已更新为已提货。` });
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
      for (const order of filteredOrders) {
        if (checked) next.add(order.id);
        else next.delete(order.id);
      }
      return next;
    });
  }
  const markUnshipped = useMutation({
    mutationFn: (id: number) => api(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "filled" }), notify: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });
  const cancelOrder = useMutation({
    mutationFn: (id: number) => api(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "customer_cancelled" }), notify: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });
  function markCustomerCancelled(order: OrderListRow) {
    if (!window.confirm(`确认订单 ${order.orderNo} 顾客不要了吗？`)) return;
    cancelOrder.mutate(order.id);
  }

  function supplierNoteValue(order: OrderListRow) {
    return supplierNotes[order.id] ?? order.supplierNote ?? "";
  }

  function submitSupplierNote(order: OrderListRow) {
    saveSupplierNote.mutate({ id: order.id, supplierNote: supplierNoteValue(order) });
  }

  return (
    <>
      <PageHeader
        title="发货安排"
        description="查看待发货订单，登记供应商发货信息并确认已提货。"
      />
      <Panel title="发货信息">
        <div className="toolbar">
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">待发货+已填单号</option>
            <option value="pending">待发货</option>
            <option value="filled">已填单号</option>
          </select>
          <input placeholder="搜索订单/客户/地址/备注" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
            <option value="">全部供应商</option>
            {supplierOptions.map((supplier) => (
              <option value={supplier} key={supplier}>{supplier}</option>
            ))}
          </select>
          <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
            <option value="">全部店铺</option>
            {storeOptions.map((store) => (
              <option value={store} key={store}>{store}</option>
            ))}
          </select>
          <select value={seriesFilter} onChange={(event) => setSeriesFilter(event.target.value)}>
            <option value="">全部系列</option>
            {seriesOptions.map((series) => (
              <option value={series} key={series}>{series}</option>
            ))}
          </select>
          <select value={skuFilter} onChange={(event) => setSkuFilter(event.target.value)}>
            <option value="">全部SKU</option>
            {skuOptions.map((sku) => (
              <option value={sku} key={sku}>{sku}</option>
            ))}
          </select>
          <button type="button" className="primary-button" onClick={() => downloadFile(`/orders/shipping-export?status=${encodeURIComponent(status)}`)}>导出发货</button>
          <button type="button" className="primary-button" onClick={submitSelectedOrders} disabled={markShipped.isPending}>
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
              <th>登记人</th>
              <th>创建时间</th>
              <th>店铺</th>
              <th>订单编号</th>
              <th>客户姓名</th>
              <th>电话</th>
              <th>收货地址</th>
              <th>系列</th>
              <th>SKU</th>
              <th>名称</th>
              <th>供应商型号</th>
              <th>数量</th>
              <th>状态</th>
              <th>快递公司</th>
              <th>发货单号</th>
              <th>备注</th>
              <th>最晚发货时间</th>
              <th>供应商备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order) => (
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
                <td>{order.orderType === "accessory" ? "配件" : "成品"}</td>
                <td>{order.registrarName || "-"}</td>
                <td>{formatCreatedAt(order.createdAt)}</td>
                <td>{order.storeShortName || order.storeName || "-"}</td>
                <td>{order.orderNo}</td>
                <td>{order.customerName}</td>
                <td>{order.customerPhone ?? "-"}</td>
                <td>{order.address}</td>
                <td>{order.productSeries || "-"}</td>
                <td>{order.productSku || "-"}</td>
                <td>{order.productName || "-"}</td>
                <td>{order.supplierModel || "-"}</td>
                <td>{order.totalQuantity ?? 0}</td>
                <td><span className={`status ${order.status}`}>{statusText[order.status] || order.status}</span></td>
                <td>{order.carrier || "-"}</td>
                <td>{order.trackingNo || "-"}</td>
                <td>{order.note || order.shipmentNote || "-"}</td>
                <td>{formatLatestShipTime(order.createdAt)}</td>
                <td className="row-actions">
                  <input
                    value={supplierNoteValue(order)}
                    onChange={(event) => setSupplierNotes((current) => ({ ...current, [order.id]: event.target.value }))}
                    placeholder="填写供应商备注"
                  />
                  <button type="button" onClick={() => submitSupplierNote(order)} disabled={saveSupplierNote.isPending}>
                    提交备注
                  </button>
                </td>
                <td className="row-actions">
                  {order.status === "shipped" ? (
                    <button type="button" onClick={() => markUnshipped.mutate(order.id)}>未发走</button>
                  ) : (
                    <button type="button" onClick={() => markShipped.mutate({ id: order.id, supplierNote: supplierNoteValue(order) })}>已提货</button>
                  )}
                  <button type="button" onClick={() => markCustomerCancelled(order)} disabled={cancelOrder.isPending}>
                    不要了
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {markShipped.error ? <div className="error">{markShipped.error.message}</div> : null}
        {markUnshipped.error ? <div className="error">{markUnshipped.error.message}</div> : null}
        {cancelOrder.error ? <div className="error">{cancelOrder.error.message}</div> : null}
        {saveSupplierNote.error ? <div className="error">{saveSupplierNote.error.message}</div> : null}
      </Panel>
    </>
  );
}
