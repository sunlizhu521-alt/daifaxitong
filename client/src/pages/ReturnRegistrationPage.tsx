import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, type Product, type ReturnOrderRow, type Store, type Supplier, type User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

export function ReturnRegistrationPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [editingReturn, setEditingReturn] = useState<ReturnOrderRow | null>(null);
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
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: rows = [] } = useQuery({
    queryKey: ["return-orders", appliedKeyword, appliedStoreName, appliedSupplierId, appliedSeries, appliedSku],
    queryFn: () =>
      api<ReturnOrderRow[]>(
        `/returns/orders?keyword=${encodeURIComponent(appliedKeyword)}&storeName=${encodeURIComponent(appliedStoreName)}&supplierId=${encodeURIComponent(appliedSupplierId)}&series=${encodeURIComponent(appliedSeries)}&sku=${encodeURIComponent(appliedSku)}`
      )
  });
  const { data: stores = [] } = useQuery({ queryKey: ["stores"], queryFn: () => api<Store[]>("/stores") });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
  const isAdmin = me?.user?.role === "管理员" || me?.user?.username === "孙立柱";
  const seriesOptions = useMemo(() => [...new Set(products.map((product) => product.series).filter(Boolean))], [products]);
  const skuOptions = useMemo(() => [...new Set(products.map((product) => product.ssku ?? product.sku).filter(Boolean))], [products]);
  const remove = useMutation({
    mutationFn: (id: number) => api(`/returns/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["return-orders"] })
  });
  const saveReturn = useMutation({
    mutationFn: (form: FormData) => api("/returns", { method: "POST", body: form }),
    onSuccess: () => {
      setEditingReturn(null);
      qc.invalidateQueries({ queryKey: ["return-orders"] });
    }
  });

  function deleteRecord(row: ReturnOrderRow) {
    if (!row.returnId) return;
    if (!window.confirm(`确定删除退货记录 ${row.orderNo} 吗？`)) return;
    remove.mutate(row.returnId);
  }

  function searchRecords() {
    setAppliedKeyword(keyword);
    setAppliedStoreName(storeName);
    setAppliedSupplierId(supplierId);
    setAppliedSeries(series);
    setAppliedSku(sku);
  }

  function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingReturn) return;
    const form = new FormData(event.currentTarget);
    form.set("storeName", editingReturn.storeName || "");
    form.set("orderNo", editingReturn.orderNo);
    form.set("model", editingReturn.productSku || editingReturn.productName || "-");
    form.set("customerName", editingReturn.customerName);
    form.set("customerPhone", editingReturn.customerPhone || "");
    form.set("address", editingReturn.address);
    form.set("status", "待处理");
    saveReturn.mutate(form);
  }

  return (
    <>
      <PageHeader title="退货记录" description="记录拦截、召回、寄回处理信息，跟踪快递单号、原因、备注和图片附件。" />
      <Panel title="退货记录">
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
          <button type="button" className="primary-button" onClick={searchRecords}>搜索</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>店铺</th>
              <th>供应商</th>
              <th>运营</th>
              <th>订单号</th>
              <th>系列</th>
              <th>SKU</th>
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
              <th>退货登记</th>
              {isAdmin ? <th>管理</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.orderId}>
                <td>{row.storeName || "-"}</td>
                <td>{row.supplierName || "-"}</td>
                <td>{row.operator || "-"}</td>
                <td>{row.orderNo}</td>
                <td>{row.productSeries || "-"}</td>
                <td>{row.productSku || "-"}</td>
                <td>{row.model || row.productName || "-"}</td>
                <td>{row.customerName}</td>
                <td>{row.customerPhone || "-"}</td>
                <td>{row.address}</td>
                <td>{row.returnStatus || row.orderStatus}</td>
                <td>{row.action || "-"}</td>
                <td>{row.returnTrackingNo || row.shipmentTrackingNo || "-"}</td>
                <td>{row.reason || "-"}</td>
                <td>{row.note || "-"}</td>
                <td>
                  <div className="attachment-list">
                    {row.attachments.map((url) => (
                      <a href={url} target="_blank" rel="noreferrer" key={url}>
                        <img src={url} alt="附件" />
                      </a>
                    ))}
                  </div>
                </td>
                <td className="row-actions">
                  <button type="button" onClick={() => setEditingReturn(row)}>{row.returnId ? "补充登记" : "登记退货"}</button>
                </td>
                {isAdmin && row.returnId ? (
                  <td className="row-actions">
                    <button onClick={() => deleteRecord(row)}>删除</button>
                  </td>
                ) : isAdmin ? <td>-</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
        {remove.error ? <div className="error">{remove.error.message}</div> : null}
        {saveReturn.error ? <div className="error">{saveReturn.error.message}</div> : null}
      </Panel>
      {editingReturn ? (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={submitReturn}>
            <h2>退货登记</h2>
            <input value={editingReturn.orderNo} readOnly />
            <input value={editingReturn.customerName} readOnly />
            <input value={editingReturn.address} readOnly />
            <input name="operator" placeholder="运营" defaultValue={editingReturn.operator || ""} />
            <select name="action" defaultValue="拦截" required>
              <option value="拦截">拦截</option>
              <option value="召回">召回</option>
              <option value="寄回">寄回</option>
            </select>
            <input name="trackingNo" placeholder="寄回快递单号（寄回时填写）" />
            <label className="modal-field">
              <span>退货理由</span>
              <select name="reason" defaultValue="七天无理由" required>
                <option value="七天无理由">七天无理由</option>
                <option value="质量问题">质量问题</option>
              </select>
            </label>
            <label className="modal-field">
              <span>备注</span>
              <textarea name="note" placeholder="填写备注" />
            </label>
            <label className="modal-field">
              <span>附件</span>
              <input name="attachments" type="file" accept="image/*" multiple />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setEditingReturn(null)}>取消</button>
              <button className="primary-button">保存</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
