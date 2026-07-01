import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { PageHeader, Panel } from "../ui/Section";

type Summary = {
  counts: {
    totalOrders: number;
    todayOrders: number;
    pendingOrders: number;
    shippedOrders: number;
    exceptionOrders: number;
  };
  trend: Array<{ day: string; orders: number }>;
  recentOrders: Array<{ id: number; orderNo: string; customerName: string; status: string; createdAt: string }>;
};

const statusText: Record<string, string> = {
  pending: "待发货",
  filled: "已填单号",
  purchased: "已下采购单",
  shipped: "已发货",
  exception: "异常",
  cancelled: "已取消"
};

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["summary"], queryFn: () => api<Summary>("/dashboard/summary") });
  const max = Math.max(1, ...(data?.trend.map((row) => row.orders) ?? [1]));

  return (
    <>
      <PageHeader title="经营概览" description="查看今日订单、待发货、已发货和异常订单情况。" />
      {isLoading ? <div className="panel">加载中...</div> : null}
      {data ? (
        <>
          <div className="metric-grid">
            <Metric label="今日订单" value={data.counts.todayOrders ?? 0} tone="green" />
            <Metric label="待发货" value={data.counts.pendingOrders ?? 0} tone="amber" />
            <Metric label="已发货" value={data.counts.shippedOrders ?? 0} tone="blue" />
            <Metric label="异常订单" value={data.counts.exceptionOrders ?? 0} tone="red" />
          </div>
          <div className="dashboard-grid">
            <Panel title="近 7 日订单趋势">
              <div className="trend">
                {data.trend.map((row) => (
                  <div className="trend-row" key={row.day}>
                    <span>{row.day.slice(5)}</span>
                    <div>
                      <i style={{ width: `${Math.max(8, (row.orders / max) * 100)}%` }} />
                    </div>
                    <b>{row.orders}</b>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="最近订单">
              <table>
                <thead>
                  <tr>
                    <th>订单号</th>
                    <th>客户</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.orderNo}</td>
                      <td>{order.customerName}</td>
                      <td>
                        <span className={`status ${order.status}`}>{statusText[order.status] ?? order.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        </>
      ) : null}
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
