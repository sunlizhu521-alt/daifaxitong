import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, rowsFromListResponse, type ListResponse, type OperationRecord, type User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

const statusText: Record<string, string> = {
  pending: "待发货",
  filled: "已填单号",
  purchased: "已下采购单",
  shipped: "已提货",
  exception: "异常",
  cancelled: "已取消"
};

function orderTypeText(value?: string | null) {
  return value === "accessory" ? "配件" : "成品";
}

function formatTime(value?: string | null) {
  return value ? value.slice(0, 16).replace("T", " ") : "-";
}

export function OperationRecordsPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: response } = useQuery({
    queryKey: ["operation-records", keyword, startDate, endDate],
    queryFn: () =>
      api<ListResponse<OperationRecord>>(
        `/operation-records?keyword=${encodeURIComponent(keyword)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      )
  });
  const records = rowsFromListResponse(response);
  const canDelete = me?.user?.username === "孙立柱";

  const deleteRecord = useMutation({
    mutationFn: (id: number) => api(`/operation-records/${id}`, { method: "DELETE", notify: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operation-records"] });
    }
  });

  function removeRecord(record: OperationRecord) {
    if (!canDelete) return;
    if (!window.confirm(`确定删除这条操作记录吗？\n${record.createdAt} ${record.operator || "-"} ${record.action}`)) return;
    deleteRecord.mutate(record.id);
  }

  return (
    <>
      <PageHeader title="操作记录" description="集中查看订单、发货、采购、退货等业务操作记录。" />
      <Panel title="筛选器">
        <div className="toolbar filter-toolbar">
          <input placeholder="搜索操作人/操作内容/订单号/客户/商品/SKU" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="开始时间" />
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="结束时间" />
        </div>
      </Panel>
      <Panel title="操作记录列表">
        <table className="nowrap-table">
          <thead>
            <tr>
              <th>操作时间</th>
              <th>操作人</th>
              <th>操作</th>
              <th>操作内容</th>
              <th>分类</th>
              <th>订单编号</th>
              <th>店铺</th>
              <th>客户姓名</th>
              <th>电话</th>
              <th>地址</th>
              <th>商品</th>
              <th>系列</th>
              <th>SKU</th>
              <th>供应商</th>
              <th>快递公司</th>
              <th>发货单号</th>
              <th>采购订单号</th>
              <th>订单状态</th>
              {canDelete ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{formatTime(record.createdAt)}</td>
                <td>{record.operator || "-"}</td>
                <td>{record.action}</td>
                <td>{record.detail || "-"}</td>
                <td>{orderTypeText(record.orderType)}</td>
                <td>{record.orderNo || "-"}</td>
                <td>{record.storeName || "-"}</td>
                <td>{record.customerName || "-"}</td>
                <td>{record.customerPhone || "-"}</td>
                <td>{record.address || "-"}</td>
                <td>{record.productName || "-"}</td>
                <td>{record.productSeries || "-"}</td>
                <td>{record.productSku || "-"}</td>
                <td>{record.supplierName || "-"}</td>
                <td>{record.carrier || "-"}</td>
                <td>{record.trackingNo || "-"}</td>
                <td>{record.purchaseOrderNo || "-"}</td>
                <td>{record.status ? statusText[record.status] || record.status : "-"}</td>
                {canDelete ? (
                  <td className="row-actions">
                    <button type="button" onClick={() => removeRecord(record)} disabled={deleteRecord.isPending}>
                      删除
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {records.length === 0 ? <div className="empty-state">暂无操作记录</div> : null}
      </Panel>
    </>
  );
}
