import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, downloadFile, type OrderListRow } from "../api";
import { PageHeader, Panel } from "../ui/Section";

const statusText: Record<string, string> = {
  pending: "待发货",
  filled: "已填单号",
  purchased: "已下采购单",
  shipped: "已发货",
  exception: "异常",
  cancelled: "已取消"
};

export function ShippingSchedulePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const { data: orders = [] } = useQuery({
    queryKey: ["shipping-schedule", status],
    queryFn: () => api<OrderListRow[]>(`/orders?status=${encodeURIComponent(status)}`)
  });
  const markShipped = useMutation({
    mutationFn: (id: number) => api(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "shipped" }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });

  return (
    <>
      <PageHeader
        title="发货安排"
        description="查看待发货订单，登记供应商发货信息并确认已发货。"
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
        </div>
        <table>
          <thead>
            <tr>
              <th>供应商</th>
              <th>店铺</th>
              <th>订单编号</th>
              <th>客户姓名</th>
              <th>电话</th>
              <th>收货地址</th>
              <th>系列</th>
              <th>SKU</th>
              <th>数量</th>
              <th>状态</th>
              <th>快递公司</th>
              <th>快递单号</th>
              <th>操作</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.supplierName ?? "-"}</td>
                <td>{order.storeName || "-"}</td>
                <td>{order.orderNo}</td>
                <td>{order.customerName}</td>
                <td>{order.customerPhone ?? "-"}</td>
                <td>{order.address}</td>
                <td>{order.productSeries || "-"}</td>
                <td>{order.productSku || "-"}</td>
                <td>{order.totalQuantity ?? 0}</td>
                <td><span className={`status ${order.status}`}>{statusText[order.status]}</span></td>
                <td>{order.carrier || "-"}</td>
                <td>{order.trackingNo || "-"}</td>
                <td className="row-actions">
                  <button type="button" onClick={() => markShipped.mutate(order.id)}>提交</button>
                  <button type="button" onClick={() => navigate(`/returns?keyword=${encodeURIComponent(order.orderNo)}`)}>退货</button>
                </td>
                <td>{order.note || order.shipmentNote || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {markShipped.error ? <div className="error">{markShipped.error.message}</div> : null}
      </Panel>
    </>
  );
}
