import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile, OrderListRow, Product, Store, Supplier, User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

const statusText: Record<string, string> = {
  pending: "待代发",
  shipped: "已发货",
  exception: "异常",
  cancelled: "已取消"
};

function parseReceiverInfo(raw: string) {
  const text = raw.replace(/\r/g, "\n").replace(/[，,]/g, " ").replace(/\s+/g, " ").trim();
  const phoneMatch = text.match(/(?:\+?86[-\s]?)?1[3-9]\d{9}/);
  const phone = phoneMatch?.[0].replace(/\D/g, "").replace(/^86/, "") ?? "";
  const withoutPhone = phone ? text.replace(phoneMatch?.[0] ?? "", " ").replace(/\s+/g, " ").trim() : text;
  const addressStart = withoutPhone.search(/(省|市|区|县|镇|乡|街道|路|号|栋|单元|室|小区|村)/);
  const name = (addressStart > 0 ? withoutPhone.slice(0, addressStart) : withoutPhone.split(" ")[0] ?? "")
    .replace(/(收件人|收货人|姓名|电话|手机|地址)[:：]/g, "")
    .trim();
  const address = (addressStart >= 0 ? withoutPhone.slice(addressStart - 2).trim() : withoutPhone.replace(name, "").trim())
    .replace(/^(地址|收货地址)[:：]/, "")
    .trim();
  return { name, phone, address };
}

export function OrdersPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [receiverRaw, setReceiverRaw] = useState("");
  const [receiver, setReceiver] = useState({ customerName: "", customerPhone: "", address: "" });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const { data: stores = [] } = useQuery({ queryKey: ["stores"], queryFn: () => api<Store[]>("/stores") });
  const { data: orders = [] } = useQuery({
    queryKey: ["orders", keyword, status],
    queryFn: () => api<OrderListRow[]>(`/orders?keyword=${encodeURIComponent(keyword)}&status=${encodeURIComponent(status)}`)
  });
  const isAdmin = me?.user?.role === "管理员" || me?.user?.username === "孙立柱";

  const createOrder = useMutation({
    mutationFn: (body: unknown) => api("/orders", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      setReceiverRaw("");
      setReceiver({ customerName: "", customerPhone: "", address: "" });
    }
  });
  const importOrders = useMutation({
    mutationFn: (form: FormData) => api("/orders/import", { method: "POST", body: form }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] })
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/orders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });

  function recognizeReceiver() {
    const parsed = parseReceiverInfo(receiverRaw);
    setReceiver({
      customerName: parsed.name,
      customerPhone: parsed.phone,
      address: parsed.address
    });
  }

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const product = products.find((item) => item.id === Number(form.get("productId")));
    if (!product) return;
    createOrder.mutate({
      orderNo: form.get("orderNo"),
      supplierId: form.get("supplierId"),
      storeName: form.get("storeName"),
      registrarName: form.get("registrarName"),
      customerName: form.get("customerName"),
      customerPhone: form.get("customerPhone"),
      address: form.get("address"),
      note: form.get("note"),
      items: [
        {
          productId: product.id,
          productName: product.name,
          productSku: product.ssku ?? product.sku,
          quantity: form.get("quantity"),
          unitCost: product.costPrice ?? 0,
          unitSalePrice: product.salePrice ?? 0
        }
      ]
    });
    event.currentTarget.reset();
  }

  function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    importOrders.mutate(form);
  }

  function deleteOrder(order: OrderListRow) {
    if (!window.confirm(`确定删除代发单 ${order.orderNo} 吗？`)) return;
    remove.mutate(order.id);
  }

  return (
    <>
      <PageHeader
        title="登记代发"
        description="手工登记代发订单、识别收货信息、Excel 批量导入并维护发货物流。"
        actions={
          <>
            <button className="ghost-button" onClick={() => downloadFile("/orders/template")}>下载模板</button>
            <button className="primary-button" onClick={() => downloadFile("/orders/export")}>导出代发单</button>
          </>
        }
      />
      <div className="two-column order-entry-layout">
        <Panel title="新增代发">
          <form className="form-grid order-form" onSubmit={submitOrder}>
            <textarea
              placeholder="粘贴收货信息，例如：张三 13800000000 上海市浦东新区示例路1号"
              value={receiverRaw}
              onChange={(event) => setReceiverRaw(event.target.value)}
            />
            <button type="button" className="ghost-button" onClick={recognizeReceiver}>识别姓名/电话/地址</button>
            <input name="orderNo" placeholder="代发单号/订单号" required />
            <select name="supplierId">
              <option value="">选择供应商</option>
              {suppliers.map((supplier) => (
                <option value={supplier.id} key={supplier.id}>
                  {supplier.shortName || supplier.name}
                </option>
              ))}
            </select>
            <select name="storeName">
              <option value="">选择店铺</option>
              {stores.map((store) => (
                <option value={store.name} key={store.id}>
                  {store.shortName || store.name}
                </option>
              ))}
            </select>
            <input key={me?.user?.username ?? "registrar"} name="registrarName" placeholder="登记人姓名" defaultValue={me?.user?.username ?? ""} required />
            <input
              name="customerName"
              placeholder="收货人姓名"
              value={receiver.customerName}
              onChange={(event) => setReceiver((current) => ({ ...current, customerName: event.target.value }))}
              required
            />
            <input
              name="customerPhone"
              placeholder="收货人电话"
              value={receiver.customerPhone}
              onChange={(event) => setReceiver((current) => ({ ...current, customerPhone: event.target.value }))}
            />
            <input
              name="address"
              placeholder="收货地址"
              value={receiver.address}
              onChange={(event) => setReceiver((current) => ({ ...current, address: event.target.value }))}
              required
            />
            <select name="productId" required>
              <option value="">选择商品/SKU</option>
              {products.map((product) => (
                <option value={product.id} key={product.id}>
                  {product.name} / {product.ssku ?? product.sku}
                </option>
              ))}
            </select>
            <input name="quantity" type="number" min="1" defaultValue="1" placeholder="数量" />
            <textarea name="note" placeholder="备注" />
            {createOrder.error ? <div className="error">{createOrder.error.message}</div> : null}
            <button className="primary-button">登记代发</button>
          </form>
        </Panel>
        <Panel title="Excel 导入">
          <form className="upload-box" onSubmit={uploadFile}>
            <input name="file" type="file" accept=".xlsx,.xls" required />
            <button className="primary-button">导入代发单</button>
          </form>
          {importOrders.error ? <div className="error">{importOrders.error.message}</div> : null}
          {importOrders.isSuccess ? <div className="success">导入成功</div> : null}
        </Panel>
      </div>
      <Panel title="代发列表">
        <div className="toolbar">
          <input placeholder="搜索代发单号/客户/商品" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部状态</option>
            <option value="pending">待代发</option>
            <option value="shipped">已发货</option>
            <option value="exception">异常</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>代发单号</th>
              <th>供应商</th>
              <th>登记人</th>
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
                <td>{order.registrationSupplierName ?? order.supplierName ?? "-"}</td>
                <td>{order.registrarName || "-"}</td>
                <td>{order.customerName}</td>
                <td>{order.totalQuantity ?? 0}</td>
                <td><span className={`status ${order.status}`}>{statusText[order.status]}</span></td>
                <td>{new Date(order.createdAt).toLocaleString()}</td>
                <td className="row-actions">
                  {isAdmin ? <button onClick={() => deleteOrder(order)}>删除</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {remove.error ? <div className="error">{remove.error.message}</div> : null}
      </Panel>
    </>
  );
}
