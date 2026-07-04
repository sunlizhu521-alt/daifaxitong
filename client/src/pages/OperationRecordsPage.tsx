import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, rowsFromListResponse, type ListResponse, type OperationRecord, type User } from "../api";
import { notifyApp } from "../ui/AppNotifications";
import { PageHeader, Panel } from "../ui/Section";

const statusText: Record<string, string> = {
  pending: "待发货",
  filled: "已填单号",
  purchased: "已下采购单",
  shipped: "已提货",
  exception: "异常",
  cancelled: "已取消",
  customer_cancelled: "顾客不要了"
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
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<number>>(() => new Set());
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
  const selectedVisibleRecords = useMemo(() => records.filter((record) => selectedRecordIds.has(record.id)), [records, selectedRecordIds]);
  const allVisibleSelected = records.length > 0 && records.every((record) => selectedRecordIds.has(record.id));

  const deleteRecord = useMutation({
    mutationFn: (input: number | { id: number; notify?: boolean }) => {
      const payload = typeof input === "number" ? { id: input, notify: true } : input;
      return api(`/operation-records/${payload.id}`, { method: "DELETE", notify: payload.notify ?? true });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operation-records"] });
    }
  });

  useEffect(() => {
    setSelectedRecordIds((current) => {
      const visibleIds = new Set(records.map((record) => record.id));
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [records]);

  function removeRecord(record: OperationRecord) {
    if (!canDelete) return;
    if (!window.confirm(`确定删除这条操作记录吗？\n${record.createdAt} ${record.operator || "-"} ${record.action}`)) return;
    deleteRecord.mutate(record.id);
  }

  async function removeSelectedRecords() {
    if (!canDelete) return;
    if (selectedVisibleRecords.length === 0) {
      notifyApp({ variant: "error", message: "请先选择要批量删除的操作记录" });
      return;
    }
    if (!window.confirm(`确定批量删除 ${selectedVisibleRecords.length} 条操作记录吗？`)) return;
    let successCount = 0;
    try {
      for (const record of selectedVisibleRecords) {
        await deleteRecord.mutateAsync({ id: record.id, notify: false });
        successCount += 1;
      }
      setSelectedRecordIds(new Set());
      notifyApp({ variant: "success", message: `批量删除完成\n共选择 ${selectedVisibleRecords.length} 条，成功删除 ${successCount} 条。` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "请求失败";
      notifyApp({ variant: "error", message: `批量删除中断\n已成功 ${successCount} 条，第 ${successCount + 1} 条失败。\n失败原因：${message}` });
    }
  }

  function toggleRecordSelected(recordId: number, checked: boolean) {
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      if (checked) next.add(recordId);
      else next.delete(recordId);
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      for (const record of records) {
        if (checked) next.add(record.id);
        else next.delete(record.id);
      }
      return next;
    });
  }

  return (
    <>
      <PageHeader title="操作记录" description="集中查看订单、发货、采购、退货等业务操作记录。" />
      <Panel title="筛选器">
        <div className="toolbar filter-toolbar">
          <input placeholder="搜索操作人/操作内容/订单号/客户/商品/SKU" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="开始时间" />
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="结束时间" />
          {canDelete ? (
            <button type="button" className="primary-button" onClick={removeSelectedRecords} disabled={deleteRecord.isPending}>
              批量删除
            </button>
          ) : null}
        </div>
      </Panel>
      <Panel title="操作记录列表">
        <table className="nowrap-table">
          <thead>
            <tr>
              {canDelete ? (
                <th className="selection-cell">
                  <input
                    type="checkbox"
                    aria-label="选择当前列表全部操作记录"
                    checked={allVisibleSelected}
                    onChange={(event) => toggleAllVisible(event.target.checked)}
                  />
                </th>
              ) : null}
              <th>操作时间</th>
              <th>操作人</th>
              <th>操作</th>
              <th>操作内容</th>
              <th>分类</th>
              <th>店铺简称</th>
              <th>订单编号</th>
              <th>姓名</th>
              <th>电话</th>
              <th>地址</th>
              <th>系列</th>
              <th>SKU</th>
              <th>商品</th>
              <th>供应商</th>
              <th>快递公司</th>
              <th>发货单号</th>
              <th>采购订单号</th>
              <th>退货快递公司</th>
              <th>退货快递单号</th>
              <th>订单状态</th>
              {canDelete ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                {canDelete ? (
                  <td className="selection-cell">
                    <input
                      type="checkbox"
                      aria-label={`选择操作记录 ${record.id}`}
                      checked={selectedRecordIds.has(record.id)}
                      onChange={(event) => toggleRecordSelected(record.id, event.target.checked)}
                    />
                  </td>
                ) : null}
                <td>{formatTime(record.createdAt)}</td>
                <td>{record.operator || "-"}</td>
                <td>{record.action}</td>
                <td>{record.detail || "-"}</td>
                <td>{orderTypeText(record.orderType)}</td>
                <td>{record.storeShortName || record.storeName || "-"}</td>
                <td>{record.orderNo || "-"}</td>
                <td>{record.customerName || "-"}</td>
                <td>{record.customerPhone || "-"}</td>
                <td>{record.address || "-"}</td>
                <td>{record.productSeries || "-"}</td>
                <td>{record.productSku || "-"}</td>
                <td>{record.productName || "-"}</td>
                <td>{record.supplierName || "-"}</td>
                <td>{record.carrier || "-"}</td>
                <td>{record.trackingNo || "-"}</td>
                <td>{record.purchaseOrderNo || "-"}</td>
                <td>{record.returnCarrier || "-"}</td>
                <td>{record.returnTrackingNo || "-"}</td>
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
