import { FormEvent, useState } from "react";
import { PageHeader, Panel } from "../ui/Section";

type ReturnRecord = {
  id: number;
  orderNo: string;
  customerName: string;
  reason: string;
  status: string;
  createdAt: string;
};

export function ReturnRegistrationPage() {
  const [records, setRecords] = useState<ReturnRecord[]>([]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setRecords((current) => [
      {
        id: Date.now(),
        orderNo: String(form.get("orderNo") ?? ""),
        customerName: String(form.get("customerName") ?? ""),
        reason: String(form.get("reason") ?? ""),
        status: String(form.get("status") ?? "待处理"),
        createdAt: new Date().toISOString()
      },
      ...current
    ]);
    event.currentTarget.reset();
  }

  return (
    <>
      <PageHeader title="退货登记" description="登记客户退货申请、退货原因和处理状态。" />
      <div className="two-column">
        <Panel title="新增退货">
          <form className="form-grid" onSubmit={submit}>
            <input name="orderNo" placeholder="订单号" required />
            <input name="customerName" placeholder="客户姓名" required />
            <select name="status" defaultValue="待处理">
              <option value="待处理">待处理</option>
              <option value="已同意">已同意</option>
              <option value="已拒绝">已拒绝</option>
              <option value="已完成">已完成</option>
            </select>
            <textarea name="reason" placeholder="退货原因" required />
            <button className="primary-button">登记退货</button>
          </form>
        </Panel>
        <Panel title="退货记录">
          <table>
            <thead>
              <tr>
                <th>订单号</th>
                <th>客户</th>
                <th>原因</th>
                <th>状态</th>
                <th>登记时间</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{record.orderNo}</td>
                  <td>{record.customerName}</td>
                  <td>{record.reason}</td>
                  <td>{record.status}</td>
                  <td>{new Date(record.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
