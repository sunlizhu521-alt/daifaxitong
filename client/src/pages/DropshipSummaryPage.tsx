import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type OrderListRow, type Store, type Supplier, type User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

const statusText: Record<string, string> = {
  pending: "待发货",
  filled: "已填单号",
  purchased: "已下采购单",
  shipped: "已发货",
  exception: "异常",
  cancelled: "已取消"
};

function mergeNotes(order: OrderListRow) {
  return [order.note, order.shipmentNote].map((item) => item?.trim()).filter(Boolean).join(" / ") || "-";
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

type OrderListResponse = OrderListRow[] | { rows: OrderListRow[] };

function rowsFromResponse(data: OrderListResponse | undefined) {
  if (!data) return [];
  return Array.isArray(data) ? data : data.rows;
}

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
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const { data: stores = [] } = useQuery({ queryKey: ["stores"], queryFn: () => api<Store[]>("/stores") });
  const { data: orderResponse } = useQuery({
    queryKey: [queryKey, keyword, status, supplierId, storeName, startDate, endDate],
    queryFn: () =>
      api<OrderListResponse>(
        `/orders?orderType=${encodeURIComponent(orderType)}&keyword=${encodeURIComponent(keyword)}&status=${encodeURIComponent(status)}&supplierId=${encodeURIComponent(supplierId)}&storeName=${encodeURIComponent(storeName)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      )
  });
  const orders = rowsFromResponse(orderResponse);
  const canManage = me?.user?.username === "孙立柱";
  const deleteOrder = useMutation({
    mutationFn: (id: number) => api(`/orders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });
  const updateOrder = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/orders/${id}`, { method: "PUT", body: JSON.stringify(body) }),
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

  async function openEdit(order: OrderListRow) {
    setEditing(await api<OrderDetail>(`/orders/${order.id}`));
  }

  function removeOrder(order: OrderListRow) {
    if (!window.confirm(`确定删除订单 ${order.orderNo} 吗？删除后相关商品明细和发货信息也会删除。`)) return;
    deleteOrder.mutate(order.id);
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
          </select>
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
      </Panel>
      <Panel title={panelTitle}>
        <table className="nowrap-table">
          <thead>
            <tr>
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
              <th>数量</th>
              <th>发货时间</th>
              <th>快递公司</th>
              <th>快递单号</th>
              <th>供应商</th>
              <th>采购订单号填写人</th>
              <th>采购订单号</th>
              <th>状态</th>
              <th>操作记录</th>
              <th>备注</th>
              {canManage ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.createdAt?.slice(0, 10)}</td>
                <td>{order.registrarName || "-"}</td>
                <td>{order.storeName || "-"}</td>
                <td>{order.orderNo}</td>
                <td>{order.customerName}</td>
                <td>{order.customerPhone ?? "-"}</td>
                <td>{order.address}</td>
                <td>{order.productName || "-"}</td>
                <td>{order.productSeries || "-"}</td>
                <td>{order.productSku || "-"}</td>
                <td>{order.totalQuantity ?? 0}</td>
                <td>{order.shippedAt ? order.shippedAt.slice(0, 16).replace("T", " ") : "-"}</td>
                <td>{order.carrier || "-"}</td>
                <td>{order.trackingNo || "-"}</td>
                <td>{order.supplierName ?? "-"}</td>
                <td>{order.purchaseOrderUser || "-"}</td>
                <td>{order.purchaseOrderNo || "-"}</td>
                <td><span className={`status ${order.status}`}>{statusText[order.status]}</span></td>
                <td title={order.operationLogs || ""}>{order.operationLogs || "-"}</td>
                <td>{mergeNotes(order)}</td>
                {canManage ? (
                  <td className="row-actions">
                    <button type="button" className="primary-button" onClick={() => openEdit(order)}>修改</button>
                    <button type="button" onClick={() => removeOrder(order)}>删除</button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {deleteOrder.error ? <div className="error">{deleteOrder.error.message}</div> : null}
        {updateOrder.error ? <div className="error">{updateOrder.error.message}</div> : null}
      </Panel>
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
      title="成品汇总"
      description="汇总成品代发订单、采购订单、发货、供应商、店铺和备注信息。"
      panelTitle="成品汇总"
      editTitle="修改成品订单"
      orderType="dropship"
      queryKey="dropship-summary"
    />
  );
}

export function AccessorySummaryPage() {
  return (
    <SummaryPage
      title="配件汇总"
      description="汇总配件代发订单、配件发货、供应商、店铺和备注信息。"
      panelTitle="配件汇总"
      editTitle="修改配件订单"
      orderType="accessory"
      queryKey="accessory-summary"
    />
  );
}
