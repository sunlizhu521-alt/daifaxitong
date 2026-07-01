import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type OrderListRow, type User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

const statusText: Record<string, string> = {
  pending: "待发货",
  shipped: "已发货",
  exception: "异常",
  cancelled: "已取消"
};

export function TrackingNumbersPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: orders = [] } = useQuery({
    queryKey: ["tracking-orders", keyword],
    queryFn: () => api<OrderListRow[]>(`/orders?keyword=${encodeURIComponent(keyword)}`)
  });
  const isAdmin = me?.user?.role === "管理员" || me?.user?.username === "孙立柱";
  const remove = useMutation({
    mutationFn: (id: number) => api(`/orders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tracking-orders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
    }
  });

  function deleteOrder(order: OrderListRow) {
    if (!window.confirm(`确定删除订单 ${order.orderNo} 吗？`)) return;
    remove.mutate(order.id);
  }

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
              <th>快递公司</th>
              <th>快递单号</th>
              <th>供应商</th>
              <th>数量</th>
              <th>状态</th>
              <th>发货时间</th>
              {isAdmin ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.orderNo}</td>
                <td>{order.customerName}</td>
                <td>{order.carrier ?? "-"}</td>
                <td>{order.trackingNo ?? "-"}</td>
                <td>{order.supplierName ?? "-"}</td>
                <td>{order.totalQuantity ?? 0}</td>
                <td>
                  <span className={`status ${order.status}`}>{statusText[order.status]}</span>
                </td>
                <td>{order.shippedAt ? new Date(order.shippedAt).toLocaleString() : "-"}</td>
                {isAdmin ? (
                  <td className="row-actions">
                    <button onClick={() => deleteOrder(order)}>删除</button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {remove.error ? <div className="error">{remove.error.message}</div> : null}
      </Panel>
    </>
  );
}
