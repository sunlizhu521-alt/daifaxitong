import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile, rowsFromListResponse, type ListResponse, type OrderListRow, type Store, type Supplier, type User } from "../api";
import { notifyApp } from "../ui/AppNotifications";
import { PageHeader, Panel } from "../ui/Section";

const statusText: Record<string, string> = {
  pending: "待发货",
  filled: "已填单号",
  purchased: "已下采购单",
  shipped: "已提货",
  exception: "异常",
  cancelled: "已取消",
  customer_cancelled: "顾客不要了"
};

function mergeNotes(order: OrderListRow) {
  return [order.note, order.shipmentNote].map((item) => item?.trim()).filter(Boolean).join(" / ") || "-";
}

function currentStatusText(order: OrderListRow) {
  return order.returnStatus || statusText[order.status] || order.status;
}

function formatCreatedAt(value?: string) {
  if (!value) return "-";
  return value.slice(0, 19).replace("T", " ");
}

type OrderDetail = OrderListRow & {
  items: Array<{
    productId?: number | null;
    productName: string;
    productSku: string;
    quantity: number;
    unitCost?: number;
    unitSalePrice?: number;
  }>;
};

type SummaryPageProps = {
  title: string;
  description: string;
  panelTitle: string;
  editTitle: string;
  orderType: "dropship" | "accessory";
  queryKey: string;
};

function SummaryPage({ title, description, panelTitle, editTitle, orderType, queryKey }: SummaryPageProps) {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [editing, setEditing] = useState<OrderDetail | null>(null);
  const [accessoryEditing, setAccessoryEditing] = useState<OrderListRow | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(() => new Set());
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const { data: stores = [] } = useQuery({ queryKey: ["stores"], queryFn: () => api<Store[]>("/stores") });
  const { data: orderResponse } = useQuery({
    queryKey: [queryKey, keyword, status, supplierId, storeName, startDate, endDate],
    queryFn: () =>
      api<ListResponse<OrderListRow>>(
        `/orders?orderType=${encodeURIComponent(orderType)}&keyword=${encodeURIComponent(keyword)}&status=${encodeURIComponent(status)}&supplierId=${encodeURIComponent(supplierId)}&storeName=${encodeURIComponent(storeName)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      )
  });
  const orders = rowsFromListResponse(orderResponse);
  const selectedVisibleOrders = useMemo(() => orders.filter((order) => selectedOrderIds.has(order.id)), [orders, selectedOrderIds]);
  const allVisibleSelected = orders.length > 0 && orders.every((order) => selectedOrderIds.has(order.id));
  const canEdit = me?.user?.role === "管理员";
  const canDelete = me?.user?.username === "孙立柱";
  const deleteOrder = useMutation({
    mutationFn: (input: number | { id: number; notify?: boolean }) => {
      const payload = typeof input === "number" ? { id: input, notify: true } : input;
      return api(`/orders/${payload.id}`, { method: "DELETE", notify: payload.notify ?? true });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
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
  const updateOrder = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/orders/${id}`, { method: "PUT", body: JSON.stringify(body), notify: true }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: [queryKey] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["return-orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });
  const changeAccessory = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/orders/${id}/shipping-edit`, { method: "PATCH", body: JSON.stringify(body), notify: true }),
    onSuccess: () => {
      setAccessoryEditing(null);
      qc.invalidateQueries({ queryKey: [queryKey] });
      qc.invalidateQueries({ queryKey: ["accessory-summary"] });
      qc.invalidateQueries({ queryKey: ["accessory-shipping"] });
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["return-orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });
  const cancelAccessoryShipment = useMutation({
    mutationFn: (id: number) => api(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "customer_cancelled" }), notify: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      qc.invalidateQueries({ queryKey: ["accessory-summary"] });
      qc.invalidateQueries({ queryKey: ["accessory-shipping"] });
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["return-orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });

  async function openEdit(order: OrderListRow) {
    setEditing(await api<OrderDetail>(`/orders/${order.id}`));
  }

  function removeOrder(order: OrderListRow) {
    if (!window.confirm(`确定删除订单 ${order.orderNo} 吗？删除后相关商品明细和发货信息也会删除。`)) return;
    deleteOrder.mutate(order.id);
  }

  function exportFilteredOrders() {
    const params = new URLSearchParams({
      orderType,
      keyword,
      status,
      supplierId,
      storeName,
      startDate,
      endDate
    });
    downloadFile(`/orders/summary-export?${params.toString()}`);
  }

  async function removeSelectedOrders() {
    if (!canDelete) return;
    if (selectedVisibleOrders.length === 0) {
      notifyApp({ variant: "error", message: "请先选择要批量删除的订单" });
      return;
    }
    if (!window.confirm(`确定批量删除 ${selectedVisibleOrders.length} 条订单吗？删除后相关商品明细和发货信息也会删除。`)) return;
    let successCount = 0;
    try {
      for (const order of selectedVisibleOrders) {
        await deleteOrder.mutateAsync({ id: order.id, notify: false });
        successCount += 1;
      }
      setSelectedOrderIds(new Set());
      notifyApp({ variant: "success", message: `批量删除完成\n共选择 ${selectedVisibleOrders.length} 条，成功删除 ${successCount} 条。` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "请求失败";
      notifyApp({ variant: "error", message: `批量删除中断\n已成功 ${successCount} 条，第 ${successCount + 1} 条失败。\n失败原因：${message}` });
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

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    updateOrder.mutate({
      id: editing.id,
      body: {
        orderNo: String(form.get("orderNo") ?? "").trim(),
        supplierId: form.get("supplierId"),
        storeName: String(form.get("storeName") ?? "").trim(),
        registrarName: editing.registrarName || "",
        customerName: String(form.get("customerName") ?? "").trim(),
        customerPhone: String(form.get("customerPhone") ?? "").trim(),
        address: String(form.get("address") ?? "").trim(),
        status: String(form.get("status") ?? editing.status),
        note: String(form.get("note") ?? "").trim(),
        items: editing.items.map((item) => ({
          productId: item.productId ?? null,
          productName: item.productName,
          productSku: item.productSku,
          quantity: item.quantity,
          unitCost: item.unitCost ?? 0,
          unitSalePrice: item.unitSalePrice ?? 0
        }))
      }
    });
  }

  function submitAccessoryChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessoryEditing) return;
    const form = new FormData(event.currentTarget);
    changeAccessory.mutate({
      id: accessoryEditing.id,
      body: {
        supplierId: form.get("supplierId"),
        productName: String(form.get("productName") ?? "").trim(),
        productSku: String(form.get("productSku") ?? "").trim(),
        quantity: Number(form.get("quantity") ?? 0),
        note: String(form.get("note") ?? "").trim()
      }
    });
  }

  function cancelAccessory(order: OrderListRow) {
    if (!window.confirm(`确认配件订单 ${order.orderNo} 顾客不要了，不需要发货了吗？`)) return;
    cancelAccessoryShipment.mutate(order.id);
  }

  return (
    <>
      <PageHeader title={title} description={description} />
      <Panel title="筛选器">
        <div className="toolbar filter-toolbar">
          <input placeholder="搜索订单号/采购订单号/姓名/电话/地址/商品/SKU" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">全部供应商</option>
            {suppliers.map((supplier) => (
              <option value={supplier.id} key={supplier.id}>{supplier.shortName || supplier.name}</option>
            ))}
          </select>
          <select value={storeName} onChange={(event) => setStoreName(event.target.value)}>
            <option value="">全部店铺</option>
            {stores.map((store) => (
              <option value={store.name} key={store.id}>{store.shortName || store.name}</option>
            ))}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部状态</option>
            <option value="pending">待发货</option>
            <option value="filled">已填单号</option>
            <option value="purchased">已下采购单</option>
            <option value="shipped">已发货</option>
            <option value="exception">异常</option>
            <option value="cancelled">已取消</option>
            <option value="customer_cancelled">顾客不要了</option>
          </select>
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          <button type="button" className="primary-button" onClick={exportFilteredOrders}>
            导出文件
          </button>
          {canDelete ? (
            <button type="button" className="primary-button" onClick={removeSelectedOrders} disabled={deleteOrder.isPending}>
              批量删除
            </button>
          ) : null}
        </div>
      </Panel>
      <Panel title={panelTitle}>
        <table className="nowrap-table">
          <thead>
            <tr>
              {canDelete ? (
                <th className="selection-cell">
                  <input
                    type="checkbox"
                    aria-label={`选择当前列表全部${panelTitle}订单`}
                    checked={allVisibleSelected}
                    onChange={(event) => toggleAllVisible(event.target.checked)}
                  />
                </th>
              ) : null}
              <th>创建时间</th>
              <th>登记人</th>
              <th>店铺</th>
              <th>订单编号</th>
              <th>客户姓名</th>
              <th>电话</th>
              <th>地址</th>
              <th>商品</th>
              <th>系列</th>
              <th>SKU</th>
              {orderType === "accessory" ? <th>更换配件</th> : null}
              <th>数量</th>
              <th>发货时间</th>
              <th>快递公司</th>
              <th>发货单号</th>
              <th>快递状态</th>
              <th>退货快递公司</th>
              <th>退货快递单号</th>
              <th>快递状态</th>
              <th>供应商</th>
              <th>采购订单号填写人</th>
              <th>采购订单号</th>
              <th>状态</th>
              <th>备注</th>
              <th>供应商备注</th>
              {orderType === "accessory" ? <th>客服操作</th> : null}
              {canEdit || canDelete ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                {canDelete ? (
                  <td className="selection-cell">
                    <input
                      type="checkbox"
                      aria-label={`选择订单 ${order.orderNo}`}
                      checked={selectedOrderIds.has(order.id)}
                      onChange={(event) => toggleOrderSelected(order.id, event.target.checked)}
                    />
                  </td>
                ) : null}
                <td>{formatCreatedAt(order.createdAt)}</td>
                <td>{order.registrarName || "-"}</td>
                <td>{order.storeName || "-"}</td>
                <td>{order.orderNo}</td>
                <td>{order.customerName}</td>
                <td>{order.customerPhone ?? "-"}</td>
                <td>{order.address}</td>
                <td>{order.productName || "-"}</td>
                <td>{order.productSeries || "-"}</td>
                <td>{order.productSku || "-"}</td>
                {orderType === "accessory" ? (
                  <td>
                    <button type="button" className="primary-button" onClick={() => setAccessoryEditing(order)}>
                      更换配件
                    </button>
                  </td>
                ) : null}
                <td>{order.totalQuantity ?? 0}</td>
                <td>{order.shippedAt ? order.shippedAt.slice(0, 16).replace("T", " ") : "-"}</td>
                <td>{order.carrier || "-"}</td>
                <td>{order.trackingNo || "-"}</td>
                <td>{order.shipmentLogisticsStatus || "-"}</td>
                <td>{order.returnCarrier || "-"}</td>
                <td>{order.returnTrackingNo || "-"}</td>
                <td>{order.returnLogisticsStatus || "-"}</td>
                <td>{order.supplierName ?? "-"}</td>
                <td>{order.purchaseOrderUser || "-"}</td>
                <td>{order.purchaseOrderNo || "-"}</td>
                <td><span className={`status ${order.status}`}>{currentStatusText(order)}</span></td>
                <td>{mergeNotes(order)}</td>
                <td>{order.supplierNote || "-"}</td>
                {orderType === "accessory" ? (
                  <td className="row-actions">
                    {order.status === "customer_cancelled" ? (
                      <span className="status customer_cancelled">顾客不要了</span>
                    ) : (
                      <button type="button" onClick={() => cancelAccessory(order)} disabled={cancelAccessoryShipment.isPending}>
                        撤销发货
                      </button>
                    )}
                  </td>
                ) : null}
                {canEdit || canDelete ? (
                  <td className="row-actions">
                    {canEdit ? <button type="button" className="primary-button" onClick={() => openEdit(order)}>修改</button> : null}
                    {canDelete ? <button type="button" onClick={() => removeOrder(order)}>删除</button> : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {deleteOrder.error ? <div className="error">{deleteOrder.error.message}</div> : null}
        {updateOrder.error ? <div className="error">{updateOrder.error.message}</div> : null}
        {changeAccessory.error ? <div className="error">{changeAccessory.error.message}</div> : null}
        {cancelAccessoryShipment.error ? <div className="error">{cancelAccessoryShipment.error.message}</div> : null}
      </Panel>
      {accessoryEditing ? (
        <div className="modal-backdrop">
          <form className="modal summary-edit-modal" onSubmit={submitAccessoryChange}>
            <h2>更换配件</h2>
            <label className="modal-field">
              <span>订单编号</span>
              <input value={accessoryEditing.orderNo} disabled />
            </label>
            <label className="modal-field">
              <span>供应商</span>
              <select name="supplierId" defaultValue={accessoryEditing.supplierId ?? ""}>
                <option value="">无供应商</option>
                {suppliers.map((supplier) => (
                  <option value={supplier.id} key={supplier.id}>{supplier.shortName || supplier.name}</option>
                ))}
              </select>
            </label>
            <label className="modal-field">
              <span>品号/SKU</span>
              <input name="productSku" defaultValue={accessoryEditing.productSku || ""} required />
            </label>
            <label className="modal-field">
              <span>商品名称</span>
              <input name="productName" defaultValue={accessoryEditing.productName || ""} required />
            </label>
            <label className="modal-field">
              <span>数量</span>
              <input name="quantity" type="number" min="1" defaultValue={accessoryEditing.totalQuantity || 1} required />
            </label>
            <label className="modal-field">
              <span>备注</span>
              <textarea name="note" defaultValue={accessoryEditing.note || ""} />
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setAccessoryEditing(null)}>取消</button>
              <button className="primary-button" disabled={changeAccessory.isPending}>保存更换</button>
            </div>
          </form>
        </div>
      ) : null}
      {editing ? (
        <div className="modal-backdrop">
          <form className="modal summary-edit-modal" onSubmit={submitEdit}>
            <h2>{editTitle}</h2>
            <label className="modal-field">
              <span>订单编号</span>
              <input name="orderNo" defaultValue={editing.orderNo} required />
            </label>
            <label className="modal-field">
              <span>店铺</span>
              <select name="storeName" defaultValue={editing.storeName || ""} required>
                <option value="">选择店铺</option>
                {stores.map((store) => (
                  <option value={store.name} key={store.id}>{store.shortName || store.name}</option>
                ))}
              </select>
            </label>
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
              <span>客户姓名</span>
              <input name="customerName" defaultValue={editing.customerName} required />
            </label>
            <label className="modal-field">
              <span>电话</span>
              <input name="customerPhone" defaultValue={editing.customerPhone || ""} />
            </label>
            <label className="modal-field">
              <span>地址</span>
              <textarea name="address" defaultValue={editing.address} required />
            </label>
            <label className="modal-field">
              <span>状态</span>
              <select name="status" defaultValue={editing.status} required>
                <option value="pending">待发货</option>
                <option value="filled">已填单号</option>
                <option value="purchased">已下采购单</option>
                <option value="shipped">已发货</option>
                <option value="exception">异常</option>
                <option value="cancelled">已取消</option>
                <option value="customer_cancelled">顾客不要了</option>
              </select>
            </label>
            <label className="modal-field">
              <span>备注</span>
              <textarea name="note" defaultValue={editing.note || ""} />
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setEditing(null)}>取消</button>
              <button className="primary-button" disabled={updateOrder.isPending}>保存修改</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

export function DropshipSummaryPage() {
  return (
    <SummaryPage
      title="成品信息"
      description="汇总成品代发订单、采购订单、发货、供应商、店铺和备注信息。"
      panelTitle="成品信息"
      editTitle="修改成品订单"
      orderType="dropship"
      queryKey="dropship-summary"
    />
  );
}

export function AccessorySummaryPage() {
  return (
    <SummaryPage
      title="配件信息"
      description="汇总配件代发订单、配件发货、供应商、店铺和备注信息。"
      panelTitle="配件信息"
      editTitle="修改配件订单"
      orderType="accessory"
      queryKey="accessory-summary"
    />
  );
}
