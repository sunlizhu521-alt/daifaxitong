import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile, OrderListRow, Product, Supplier } from "../api";
import { PageHeader, Panel } from "../ui/Section";

const statusText: Record<string, string> = {
  pending: "待发货",
  shipped: "已发货",
  exception: "异常",
  cancelled: "已取消"
};

export function OrdersPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [shipOrder, setShipOrder] = useState<OrderListRow | null>(null);
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const { data: orders = [] } = useQuery({
    queryKey: ["orders", keyword, status],
    queryFn: () => api<OrderListRow[]>(`/orders?keyword=${encodeURIComponent(keyword)}&status=${encodeURIComponent(status)}`)
  });
  const createOrder = useMutation({
    mutationFn: (body: unknown) => api("/orders", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] })
  });
  const ship = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/orders/${id}/ship`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setShipOrder(null);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });
  const importOrders = useMutation({
    mutationFn: (form: FormData) => api("/orders/import", { method: "POST", body: form }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] })
  });

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const product = products.find((item) => item.id === Number(form.get("productId")));
    if (!product) return;
    createOrder.mutate({
      orderNo: form.get("orderNo"),
      customerName: form.get("customerName"),
      customerPhone: form.get("customerPhone"),
      address: form.get("address"),
      note: form.get("note"),
      items: [
        {
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          quantity: form.get("quantity"),
          unitCost: product.costPrice,
          unitSalePrice: product.salePrice
        }
      ]
    });
    event.currentTarget.reset();
  }

  function submitShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shipOrder) return;
    ship.mutate({ id: shipOrder.id, body: Object.fromEntries(new FormData(event.currentTarget)) });
  }

  function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    importOrders.mutate(form);
  }

  return (
    <>
      <PageHeader
        title="订单发货"
        description="手工新增订单、Excel 批量导入、记录发货物流并导出订单。"
        actions={
          <>
            <button className="ghost-button" onClick={() => downloadFile("/orders/template")}>下载模板</button>
            <button className="primary-button" onClick={() => downloadFile("/orders/export")}>导出订单</button>
          </>
        }
      />
      <div className="two-column">
        <Panel title="新增订单">
          <form className="form-grid" onSubmit={submitOrder}>
            <input name="orderNo" placeholder="订单号" required />
            <input name="customerName" placeholder="客户姓名" required />
            <input name="customerPhone" placeholder="客户电话" />
            <input name="address" placeholder="收货地址" required />
            <select name="productId" required>
              <option value="">选择商品/SKU</option>
              {products.map((product) => (
                <option value={product.id} key={product.id}>
                  {product.name} / {product.sku}
                </option>
              ))}
            </select>
            <input name="quantity" type="number" min="1" defaultValue="1" placeholder="数量" />
            <textarea name="note" placeholder="备注" />
            {createOrder.error ? <div className="error">{createOrder.error.message}</div> : null}
            <button className="primary-button">新增订单</button>
          </form>
        </Panel>
        <Panel title="Excel 导入">
          <form className="upload-box" onSubmit={uploadFile}>
            <input name="file" type="file" accept=".xlsx,.xls" required />
            <button className="primary-button">导入订单</button>
          </form>
          {importOrders.error ? <div className="error">{importOrders.error.message}</div> : null}
          {importOrders.isSuccess ? <div className="success">导入成功</div> : null}
        </Panel>
      </div>
      <Panel title="订单列表">
        <div className="toolbar">
          <input placeholder="搜索订单号/客户/商品" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部状态</option>
            <option value="pending">待发货</option>
            <option value="shipped">已发货</option>
            <option value="exception">异常</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>订单号</th>
              <th>客户</th>
              <th>数量</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.orderNo}</td>
                <td>{order.customerName}</td>
                <td>{order.totalQuantity ?? 0}</td>
                <td><span className={`status ${order.status}`}>{statusText[order.status]}</span></td>
                <td>{new Date(order.createdAt).toLocaleString()}</td>
                <td className="row-actions">
                  <button onClick={() => setShipOrder(order)}>发货</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {shipOrder ? (
        <div className="modal-backdrop" onClick={() => setShipOrder(null)}>
          <form className="modal" onSubmit={submitShipment} onClick={(event) => event.stopPropagation()}>
            <h2>订单发货：{shipOrder.orderNo}</h2>
            <select name="supplierId">
              <option value="">选择发货供应商</option>
              {suppliers.map((supplier) => (
                <option value={supplier.id} key={supplier.id}>{supplier.name}</option>
              ))}
            </select>
            <input name="carrier" placeholder="快递公司" required />
            <input name="trackingNo" placeholder="物流单号" required />
            <input name="shippedAt" type="datetime-local" required />
            <select name="status" defaultValue="shipped">
              <option value="shipped">已发货</option>
              <option value="exception">异常</option>
            </select>
            <textarea name="note" placeholder="发货备注" />
            {ship.error ? <div className="error">{ship.error.message}</div> : null}
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setShipOrder(null)}>取消</button>
              <button className="primary-button">保存发货</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
