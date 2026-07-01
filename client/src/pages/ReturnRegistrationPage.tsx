import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type OrderListRow, type ReturnRecord, type Store, type User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

export function ReturnRegistrationPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [action, setAction] = useState<ReturnRecord["action"]>("拦截");
  const [orderNo, setOrderNo] = useState("");
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: records = [] } = useQuery({
    queryKey: ["returns", keyword],
    queryFn: () => api<ReturnRecord[]>(`/returns?keyword=${encodeURIComponent(keyword)}`)
  });
  const { data: orders = [] } = useQuery({ queryKey: ["orders-for-returns"], queryFn: () => api<OrderListRow[]>("/orders") });
  const { data: stores = [] } = useQuery({ queryKey: ["stores"], queryFn: () => api<Store[]>("/stores") });
  const isAdmin = me?.user?.role === "管理员" || me?.user?.username === "孙立柱";
  const selectedOrder = orders.find((order) => order.orderNo === orderNo);
  const originalTrackingNo = selectedOrder?.trackingNo ?? "";

  const save = useMutation({
    mutationFn: (form: FormData) => api<ReturnRecord>("/returns", { method: "POST", body: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["returns"] });
      setOrderNo("");
      setAction("拦截");
    }
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/returns/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["returns"] })
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(new FormData(event.currentTarget));
    event.currentTarget.reset();
  }

  function deleteRecord(record: ReturnRecord) {
    if (!window.confirm(`确定删除退货记录 ${record.orderNo} 吗？`)) return;
    remove.mutate(record.id);
  }

  return (
    <>
      <PageHeader title="退货记录" description="记录拦截、召回、寄回处理信息，跟踪快递单号、原因、备注和图片附件。" />
      <div className="two-column">
        <Panel title="新增记录">
          <form className="form-grid" onSubmit={submit}>
            <input name="storeName" list="return-stores" placeholder="店铺" required />
            <datalist id="return-stores">
              {stores.map((store) => (
                <option value={store.name} key={store.id} />
              ))}
            </datalist>
            <input name="operator" placeholder="运营" />
            <input
              name="orderNo"
              list="return-orders"
              placeholder="订单号"
              value={orderNo}
              onChange={(event) => setOrderNo(event.target.value)}
              required
            />
            <datalist id="return-orders">
              {orders.map((order) => (
                <option value={order.orderNo} key={order.id}>
                  {order.customerName}
                </option>
              ))}
            </datalist>
            <input name="model" placeholder="型号" required />
            <input key={`name-${selectedOrder?.id ?? "manual"}`} name="customerName" placeholder="姓名" defaultValue={selectedOrder?.customerName ?? ""} required />
            <input key={`phone-${selectedOrder?.id ?? "manual"}`} name="customerPhone" placeholder="电话" defaultValue={selectedOrder?.customerPhone ?? ""} />
            <input key={`address-${selectedOrder?.id ?? "manual"}`} name="address" placeholder="地址" defaultValue={selectedOrder?.address ?? ""} required />
            <select name="status" defaultValue="待处理">
              <option value="待处理">待处理</option>
              <option value="处理中">处理中</option>
              <option value="已完成">已完成</option>
              <option value="异常">异常</option>
            </select>
            <select name="action" value={action} onChange={(event) => setAction(event.target.value as ReturnRecord["action"])}>
              <option value="拦截">拦截</option>
              <option value="召回">召回</option>
              <option value="寄回">寄回</option>
            </select>
            {action === "寄回" ? (
              <input name="trackingNo" placeholder="寄回快递单号" required />
            ) : (
              <input
                name="trackingNo"
                placeholder="原快递单号"
                value={originalTrackingNo || "保存时自动抓取原先单号"}
                readOnly
              />
            )}
            <select name="reason" defaultValue="七天无理由">
              <option value="七天无理由">七天无理由</option>
              <option value="质量问题">质量问题</option>
            </select>
            <textarea name="note" placeholder="备注" />
            <input name="attachments" type="file" accept="image/*" multiple />
            {save.error ? <div className="error">{save.error.message}</div> : null}
            {save.isSuccess ? <div className="success">保存成功</div> : null}
            <button className="primary-button">保存记录</button>
          </form>
        </Panel>
        <Panel title="退货记录">
          <div className="toolbar">
            <input
              placeholder="搜索姓名、电话、地址、型号、店铺、订单号"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
          <table>
            <thead>
              <tr>
                <th>店铺</th>
                <th>运营</th>
                <th>订单号</th>
                <th>型号</th>
                <th>姓名</th>
                <th>电话</th>
                <th>地址</th>
                <th>状态</th>
                <th>操作</th>
                <th>快递单号</th>
                <th>退货理由</th>
                <th>备注</th>
                <th>附件</th>
                {isAdmin ? <th>管理</th> : null}
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{record.storeName}</td>
                  <td>{record.operator || "-"}</td>
                  <td>{record.orderNo}</td>
                  <td>{record.model}</td>
                  <td>{record.customerName}</td>
                  <td>{record.customerPhone || "-"}</td>
                  <td>{record.address}</td>
                  <td>{record.status}</td>
                  <td>{record.action}</td>
                  <td>{record.trackingNo || "-"}</td>
                  <td>{record.reason}</td>
                  <td>{record.note || "-"}</td>
                  <td>
                    <div className="attachment-list">
                      {record.attachments.map((url) => (
                        <a href={url} target="_blank" rel="noreferrer" key={url}>
                          <img src={url} alt="附件" />
                        </a>
                      ))}
                    </div>
                  </td>
                  {isAdmin ? (
                    <td className="row-actions">
                      <button onClick={() => deleteRecord(record)}>删除</button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {remove.error ? <div className="error">{remove.error.message}</div> : null}
        </Panel>
      </div>
    </>
  );
}
