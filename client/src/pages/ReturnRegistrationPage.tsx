import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, type Product, type ReturnOrderRow, type Store, type Supplier, type User } from "../api";
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

export function ReturnRegistrationPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(() => searchParams.get("keyword") ?? "");
  const [appliedKeyword, setAppliedKeyword] = useState(() => searchParams.get("keyword") ?? "");
  const [storeName, setStoreName] = useState("");
  const [appliedStoreName, setAppliedStoreName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [appliedSupplierId, setAppliedSupplierId] = useState("");
  const [series, setSeries] = useState("");
  const [appliedSeries, setAppliedSeries] = useState("");
  const [sku, setSku] = useState("");
  const [appliedSku, setAppliedSku] = useState("");
  const [startDate, setStartDate] = useState("");
  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");
  const [returnActions, setReturnActions] = useState<Record<number, string>>({});
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; title: string } | null>(null);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: rows = [] } = useQuery({
    queryKey: ["return-orders", appliedKeyword, appliedStoreName, appliedSupplierId, appliedSeries, appliedSku, appliedStartDate, appliedEndDate],
    queryFn: () =>
      api<ReturnOrderRow[]>(
        `/returns/orders?keyword=${encodeURIComponent(appliedKeyword)}&storeName=${encodeURIComponent(appliedStoreName)}&supplierId=${encodeURIComponent(appliedSupplierId)}&series=${encodeURIComponent(appliedSeries)}&sku=${encodeURIComponent(appliedSku)}&startDate=${encodeURIComponent(appliedStartDate)}&endDate=${encodeURIComponent(appliedEndDate)}`
      )
  });
  const { data: stores = [] } = useQuery({ queryKey: ["stores"], queryFn: () => api<Store[]>("/stores") });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
  const isAdmin = me?.user?.role === "管理员" || me?.user?.username === "孙立柱";
  const seriesOptions = useMemo(() => [...new Set(products.map((product) => product.series).filter(Boolean))], [products]);
  const skuOptions = useMemo(() => [...new Set(products.map((product) => product.ssku ?? product.sku).filter(Boolean))], [products]);
  const remove = useMutation({
    mutationFn: (id: number) => api(`/returns/${id}`, { method: "DELETE", notify: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["return-orders"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["accessory-summary"] });
      qc.invalidateQueries({ queryKey: ["tracking-orders"] });
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["accessory-shipping"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    }
  });
  const saveReturn = useMutation({
    mutationFn: (form: FormData) => api("/returns", { method: "POST", body: form, notify: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["return-orders"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["accessory-summary"] });
      qc.invalidateQueries({ queryKey: ["tracking-orders"] });
      qc.invalidateQueries({ queryKey: ["shipping-schedule"] });
      qc.invalidateQueries({ queryKey: ["accessory-shipping"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    }
  });

  function deleteRecord(row: ReturnOrderRow) {
    if (!row.returnId || !canCancelReturn(row)) return;
    if (!window.confirm(`确定撤销退货 ${row.orderNo} 吗？`)) return;
    remove.mutate(row.returnId);
  }

  function searchRecords() {
    setAppliedKeyword(keyword);
    setAppliedStoreName(storeName);
    setAppliedSupplierId(supplierId);
    setAppliedSeries(series);
    setAppliedSku(sku);
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
  }

  function submitReturn(row: ReturnOrderRow, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("orderId", String(row.orderId));
    form.set("storeName", row.storeName || "");
    form.set("operator", row.operator || "");
    form.set("orderNo", row.orderNo);
    form.set("model", row.supplierModel || row.model || row.productName || row.productSku || "-");
    form.set("customerName", row.customerName);
    form.set("customerPhone", row.customerPhone || "");
    form.set("address", row.address);
    form.set("status", "已提交退货");
    saveReturn.mutate(form);
  }

  function registrationStatus(row: ReturnOrderRow) {
    return row.returnStatus || statusText[row.orderStatus] || row.orderStatus || "-";
  }

  function logisticsText(row: ReturnOrderRow) {
    if (!row.shipmentTrackingNo) return "-";
    return row.logisticsStatus || "已揽件";
  }

  function orderTypeText(row: ReturnOrderRow) {
    return row.orderType === "accessory" ? "配件" : "成品";
  }

  function canCancelReturn(row: ReturnOrderRow) {
    return row.returnStatus === "已提交退货";
  }

  return (
    <>
      <PageHeader title="退货登记" description="登记拦截、自行寄回、上门取件处理信息，提交后进入退货操作页面处理。" />
      <Panel title="退货登记">
        <div className="helper-text">
          操作说明：拦截是指顾客还没有签收的情况；自行寄回是顾客自己联系快递寄回；上门取件是物流部安排取件，其中包含原单号召回和重新下单。
        </div>
        <div className="toolbar filter-toolbar">
          <select value={storeName} onChange={(event) => setStoreName(event.target.value)}>
            <option value="">全部店铺</option>
            {stores.map((store) => (
              <option value={store.name} key={store.id}>{store.shortName || store.name}</option>
            ))}
          </select>
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">全部供应商</option>
            {suppliers.map((supplier) => (
              <option value={supplier.id} key={supplier.id}>{supplier.shortName || supplier.name}</option>
            ))}
          </select>
          <select value={series} onChange={(event) => setSeries(event.target.value)}>
            <option value="">全部系列</option>
            {seriesOptions.map((item) => (
              <option value={item} key={item}>{item}</option>
            ))}
          </select>
          <select value={sku} onChange={(event) => setSku(event.target.value)}>
            <option value="">全部 SKU</option>
            {skuOptions.map((item) => (
              <option value={item} key={item}>{item}</option>
            ))}
          </select>
          <input
            placeholder="搜索姓名、电话、地址、型号、店铺、订单号"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <label className="filter-date-field">
            <span>开始时间</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="filter-date-field">
            <span>结束时间</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <button type="button" className="primary-button" onClick={searchRecords}>搜索</button>
        </div>
        <table className="nowrap-table">
          <thead>
            <tr>
              <th>分类</th>
              <th>客户</th>
              <th>电话</th>
              <th>地址</th>
              <th>型号</th>
              <th>状态</th>
              <th>发货单号</th>
              <th>快递信息</th>
              <th>操作 *</th>
              <th>退货理由 *</th>
              <th>备注</th>
              <th>附件</th>
              <th>查看附件</th>
              <th>退货登记</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const formId = `return-form-${row.orderId}`;
              const actionValue = returnActions[row.orderId] ?? (row.returnId ? (row.action === "寄回" ? "自行寄回" : row.action ?? "") : "");
              return (
              <tr key={row.orderId}>
                <td>{orderTypeText(row)}</td>
                <td>{row.customerName}</td>
                <td>{row.customerPhone || "-"}</td>
                <td>{row.address}</td>
                <td>{row.supplierModel || row.model || row.productName || row.productSku || "-"}</td>
                <td>{registrationStatus(row)}</td>
                <td>{row.shipmentTrackingNo || "-"}</td>
                <td>{logisticsText(row)}</td>
                <td>
                  <select
                    form={formId}
                    name="action"
                    value={actionValue}
                    onChange={(event) => setReturnActions((current) => ({ ...current, [row.orderId]: event.target.value }))}
                    required
                  >
                    <option value="">选择操作 *</option>
                    <option value="拦截">拦截</option>
                    <option value="自行寄回">自行寄回</option>
                    <option value="上门取件">上门取件</option>
                  </select>
                </td>
                <td>
                  <select form={formId} name="reason" defaultValue={row.returnId ? row.reason || "" : ""} required>
                    <option value="">选择退货理由 *</option>
                    <option value="七天无理由">七天无理由</option>
                    <option value="质量问题">质量问题</option>
                  </select>
                </td>
                <td>
                  <textarea form={formId} name="note" placeholder="填写备注" defaultValue={row.note || ""} />
                </td>
                <td>
                  <input form={formId} name="attachments" type="file" accept="image/*" multiple />
                </td>
                <td className="row-actions">
                  {row.attachments.length > 0 ? (
                    row.attachments.map((url, index) => (
                      <button
                        type="button"
                        key={url}
                        onClick={() => setPreviewAttachment({ url, title: `${row.orderNo} 附件${index + 1}` })}
                      >
                        查看{index + 1}
                      </button>
                    ))
                  ) : "-"}
                </td>
                <td className="row-actions return-registration-actions">
                  <form id={formId} className="inline-return-form" onSubmit={(event) => submitReturn(row, event)}>
                    <button className="primary-button" disabled={saveReturn.isPending}>
                      提交退货
                    </button>
                  </form>
                  {isAdmin && row.returnId && canCancelReturn(row) ? (
                    <button type="button" onClick={() => deleteRecord(row)}>撤销退货</button>
                  ) : null}
                  {isAdmin && row.returnId && !canCancelReturn(row) ? <span className="muted-text">已操作不可撤销</span> : null}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {remove.error ? <div className="error">{remove.error.message}</div> : null}
        {saveReturn.error ? <div className="error">{saveReturn.error.message}</div> : null}
      </Panel>
      {previewAttachment ? (
        <div className="modal-backdrop" onClick={() => setPreviewAttachment(null)}>
          <div className="modal attachment-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="attachment-preview-header">
              <h2>{previewAttachment.title}</h2>
              <button type="button" className="ghost-button" onClick={() => setPreviewAttachment(null)}>
                关闭
              </button>
            </div>
            <img src={previewAttachment.url} alt={previewAttachment.title} />
          </div>
        </div>
      ) : null}
    </>
  );
}
