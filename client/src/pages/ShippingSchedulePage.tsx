import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, downloadFile, rowsFromListResponse, type ListResponse, type OrderListRow, type Product, type Supplier } from "../api";
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

type OrderDetail = OrderListRow & {
  items: Array<{
    productId?: number | null;
    productName: string;
    productSku: string;
    quantity: number;
  }>;
};

export function ShippingSchedulePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [status, setStatus] = useState("filled");
  const [editing, setEditing] = useState<OrderDetail | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(() => new Set());
  const { data: orderResponse } = useQuery({
    queryKey: ["shipping-schedule", status],
    queryFn: () => api<ListResponse<OrderListRow>>(`/orders?status=${encodeURIComponent(status)}`)
  });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const orders = rowsFromListResponse(orderResponse);
  const selectedVisibleOrders = useMemo(() => orders.filter((order) => selectedOrderIds.has(order.id)), [orders, selectedOrderIds]);
  const allVisibleSelected = orders.length > 0 && orders.every((order) => selectedOrderIds.has(order.id));
  const markShipped = useMutation({
    mutationFn: (id: number) => api(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "shipped" }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
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

  async function submitSelectedOrders() {
    if (selectedVisibleOrders.length === 0) {
      notifyApp({ variant: "error", message: "请先选择要批量提交的订单" });
      return;
    }
    try {
      for (const order of selectedVisibleOrders) {
        await markShipped.mutateAsync(order.id);
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
  const markUnshipped = useMutation({
    mutationFn: (id: number) => api(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "filled" }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });
  const updateShipping = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/orders/${id}/shipping-edit`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["return-orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });

  async function openEdit(order: OrderListRow) {
    setEditing(await api<OrderDetail>(`/orders/${order.id}`));
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const productId = Number(form.get("productId") || 0);
    const product = products.find((item) => item.id === productId);
    updateShipping.mutate({
      id: editing.id,
      body: {
        supplierId: form.get("supplierId"),
        productId: product?.id ?? null,
        productName: product?.name ?? String(form.get("productName") ?? "").trim(),
        productSku: product?.ssku || product?.sku || String(form.get("productSku") ?? "").trim(),
        quantity: form.get("quantity"),
        note: String(form.get("note") ?? "").trim()
      }
    });
  }

  return (
    <>
      <PageHeader
        title="发货安排"
        description="查看待发货订单，登记供应商发货信息并确认已提货。"
        actions={<button className="primary-button" onClick={() => downloadFile(`/orders/shipping-export?status=${encodeURIComponent(status)}`)}>导出发货安排</button>}
      />
      <Panel title="发货信息">
        <div className="toolbar">
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部</option>
            <option value="pending">待发货</option>
            <option value="filled">已填单号</option>
            <option value="purchased">已下采购单</option>
            <option value="shipped">已发货</option>
          </select>
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
              <th>操作</th>
              <th>备注</th>
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
                <td>{order.storeName || "-"}</td>
                <td>{order.orderNo}</td>
                <td>{order.customerName}</td>
                <td>{order.customerPhone ?? "-"}</td>
                <td>{order.address}</td>
                <td>{order.productSeries || "-"}</td>
                <td>{order.productSku || "-"}</td>
                <td>{order.productName || "-"}</td>
                <td>{order.supplierModel || "-"}</td>
                <td>{order.totalQuantity ?? 0}</td>
                <td><span className={`status ${order.status}`}>{statusText[order.status]}</span></td>
                <td>{order.carrier || "-"}</td>
                <td>{order.trackingNo || "-"}</td>
                <td className="row-actions">
                  {order.status === "shipped" ? (
                    <button type="button" onClick={() => markUnshipped.mutate(order.id)}>未发走</button>
                  ) : (
                    <button type="button" onClick={() => markShipped.mutate(order.id)}>已提货</button>
                  )}
                  <button type="button" onClick={() => openEdit(order)}>编辑</button>
                  <button type="button" onClick={() => navigate(`/returns?keyword=${encodeURIComponent(order.orderNo)}`)}>退货</button>
                </td>
                <td>{order.note || order.shipmentNote || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {markShipped.error ? <div className="error">{markShipped.error.message}</div> : null}
        {markUnshipped.error ? <div className="error">{markUnshipped.error.message}</div> : null}
        {updateShipping.error ? <div className="error">{updateShipping.error.message}</div> : null}
      </Panel>
      {editing ? (
        <div className="modal-backdrop">
          <form className="modal summary-edit-modal" onSubmit={submitEdit}>
            <h2>编辑发货信息</h2>
            <label className="modal-field">
              <span>供应商</span>
              <select name="supplierId" defaultValue={editing.supplierId ?? ""}>
                <option value="">无供应商</option>
                {suppliers.map((supplier) => (
                  <option value={supplier.id} key={supplier.id}>{supplier.shortName || supplier.name}</option>
                ))}
              </select>
            </label>
            <label className="modal-field">
              <span>商品 / SKU / 供应商型号</span>
              <select name="productId" defaultValue={editing.items[0]?.productId ?? ""} required>
                <option value="">选择商品</option>
                {products.map((product) => (
                  <option value={product.id} key={product.id}>
                    {product.name} / {product.ssku || product.sku} / {product.supplierModel || "-"}
                  </option>
                ))}
              </select>
            </label>
            <input type="hidden" name="productName" value={editing.items[0]?.productName ?? ""} readOnly />
            <input type="hidden" name="productSku" value={editing.items[0]?.productSku ?? ""} readOnly />
            <label className="modal-field">
              <span>数量</span>
              <input name="quantity" type="number" min="1" defaultValue={editing.items[0]?.quantity ?? 1} required />
            </label>
            <label className="modal-field">
              <span>备注</span>
              <textarea name="note" defaultValue={editing.note || ""} />
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setEditing(null)}>取消</button>
              <button className="primary-button" disabled={updateShipping.isPending}>保存修改</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
