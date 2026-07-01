import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type OrderListRow, type Store, type Supplier } from "../api";
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

export function DropshipSummaryPage() {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const { data: stores = [] } = useQuery({ queryKey: ["stores"], queryFn: () => api<Store[]>("/stores") });
  const { data: orders = [] } = useQuery({
    queryKey: ["dropship-summary", keyword, status, supplierId, storeName, startDate, endDate],
    queryFn: () =>
      api<OrderListRow[]>(
        `/orders?keyword=${encodeURIComponent(keyword)}&status=${encodeURIComponent(status)}&supplierId=${encodeURIComponent(supplierId)}&storeName=${encodeURIComponent(storeName)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      )
  });

  return (
    <>
      <PageHeader title="代发汇总" description="汇总代发订单、采购订单、发货、供应商、店铺和备注信息。" />
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
      <Panel title="代发汇总">
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
              <th>备注</th>
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
                <td>{mergeNotes(order)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
