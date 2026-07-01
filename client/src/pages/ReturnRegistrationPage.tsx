import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, type Product, type ReturnRecord, type Store, type Supplier, type User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

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
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: records = [] } = useQuery({
    queryKey: ["returns", appliedKeyword, appliedStoreName, appliedSupplierId, appliedSeries, appliedSku],
    queryFn: () =>
      api<ReturnRecord[]>(
        `/returns?keyword=${encodeURIComponent(appliedKeyword)}&storeName=${encodeURIComponent(appliedStoreName)}&supplierId=${encodeURIComponent(appliedSupplierId)}&series=${encodeURIComponent(appliedSeries)}&sku=${encodeURIComponent(appliedSku)}`
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["returns"] })
  });

  function deleteRecord(record: ReturnRecord) {
    if (!window.confirm(`确定删除退货记录 ${record.orderNo} 吗？`)) return;
    remove.mutate(record.id);
  }

  function searchRecords() {
    setAppliedKeyword(keyword);
    setAppliedStoreName(storeName);
    setAppliedSupplierId(supplierId);
    setAppliedSeries(series);
    setAppliedSku(sku);
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
              {isAdmin ? <th>管理</th> : null}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{record.storeName}</td>
                <td>{record.supplierName || "-"}</td>
                <td>{record.operator || "-"}</td>
                <td>{record.orderNo}</td>
                <td>{record.productSeries || "-"}</td>
                <td>{record.productSku || "-"}</td>
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
    </>
  );
}
