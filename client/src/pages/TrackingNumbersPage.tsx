import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type OrderListRow } from "../api";
import { PageHeader, Panel } from "../ui/Section";

const statusText: Record<string, string> = {
  pending: "待发货",
  shipped: "已发货",
  exception: "异常",
  cancelled: "已取消"
};

export function TrackingNumbersPage() {
  const [keyword, setKeyword] = useState("");
  const { data: orders = [] } = useQuery({
    queryKey: ["tracking-orders", keyword],
    queryFn: () => api<OrderListRow[]>(`/orders?keyword=${encodeURIComponent(keyword)}`)
  });

  return (
    <>
      <PageHeader title="快递单号" description="查询代发订单状态、客户信息和快递流转记录。" />
      <Panel title="快递单号查询">
        <div className="toolbar">
          <input placeholder="搜索订单号/客户/商品" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        </div>
        <table>
          <thead>
            <tr>
              <th>订单号</th>
              <th>客户</th>
              <th>数量</th>
              <th>状态</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.orderNo}</td>
                <td>{order.customerName}</td>
                <td>{order.totalQuantity ?? 0}</td>
                <td>
                  <span className={`status ${order.status}`}>{statusText[order.status]}</span>
                </td>
                <td>{new Date(order.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
