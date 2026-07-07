import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RepairExchange, type User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

const statusClass: Record<string, string> = {
  顾客寄出: "pending",
  已收到: "purchased",
  已反馈时间: "filled",
  供应商已寄出: "exception",
  完结: "shipped"
};

export function RepairRecordPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: rows = [] } = useQuery({
    queryKey: ["repairs"],
    queryFn: () => api<RepairExchange[]>("/repairs")
  });
  const isAdmin = me?.user?.role === "管理员" || me?.user?.username === "孙立柱";

  const deleteRepair = useMutation({
    mutationFn: (id: number) => api(`/repairs/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] })
  });

  return (
    <>
      <PageHeader title="维修换货记录" description="查看维修换货全流程记录，包含状态流转：顾客寄出→已收到→已反馈时间→供应商已寄出→完结。" />
      <Panel title="维修换货记录">
        <table className="nowrap-table">
          <thead>
            <tr>
              <th>登记时间</th>
              <th>原店铺订单号</th>
              <th>系列</th>
              <th>SKU</th>
              <th>名称</th>
              <th>快递公司</th>
              <th>快递单号</th>
              <th>操作</th>
              <th>备注</th>
              <th>是否已收到货</th>
              <th>预计完成时间</th>
              <th>寄出快递公司</th>
              <th>寄出快递单号</th>
              <th>供应商反馈</th>
              <th>状态</th>
              {isAdmin ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.createdAt?.slice(0, 10)}</td>
                <td>{row.storeOrderNo}</td>
                <td>{row.series || "-"}</td>
                <td>{row.sku || "-"}</td>
                <td>{row.name || "-"}</td>
                <td>{row.carrierCompany || "-"}</td>
                <td>{row.trackingNo || "-"}</td>
                <td>{row.action || "-"}</td>
                <td>{row.note || "-"}</td>
                <td>{row.isReceived ? "已收到" : "未收到"}</td>
                <td>{row.estimatedCompletion || "-"}</td>
                <td>{row.returnCarrier || "-"}</td>
                <td>{row.returnTrackingNo || "-"}</td>
                <td>{row.supplierFeedback || "-"}</td>
                <td><span className={`status ${statusClass[row.status] || "pending"}`}>{row.status}</span></td>
                {isAdmin ? (
                  <td className="row-actions">
                    <button type="button" onClick={() => { if (window.confirm("确定删除？")) deleteRepair.mutate(row.id); }}>删除</button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {deleteRepair.error ? <div className="error">{deleteRepair.error.message}</div> : null}
      </Panel>
    </>
  );
}
