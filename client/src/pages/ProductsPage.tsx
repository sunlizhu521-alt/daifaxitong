import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Product, Supplier, User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

export function ProductsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Product | null>(null);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const { data = [] } = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
  const isAdmin = me?.user?.role === "管理员" || me?.user?.username === "孙立柱";
  const save = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) =>
      api<Product>(editing ? `/products/${editing.id}` : "/products", { method: editing ? "PUT" : "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["products"] });
    }
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/products/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] })
  });
  const importProducts = useMutation({
    mutationFn: (form: FormData) => api("/products/import", { method: "POST", body: form }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] })
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(Object.fromEntries(new FormData(event.currentTarget)));
    event.currentTarget.reset();
  }

  function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    importProducts.mutate(new FormData(event.currentTarget));
    event.currentTarget.reset();
  }

  return (
    <>
      <PageHeader title="商品库" description="维护物料编码、产品线、系列、SKU、名称、供应商型号和备注。" />
      <div className="two-column catalog-layout library-layout">
        <Panel title={editing ? "编辑商品" : "新增商品"}>
          <form className="form-grid" onSubmit={submit}>
            <input name="materialCode" placeholder="物料编码" defaultValue={editing?.materialCode} required />
            <input name="productLine" placeholder="产品线" defaultValue={editing?.productLine} />
            <input name="series" placeholder="系列" defaultValue={editing?.series} />
            <input name="ssku" placeholder="SKU" defaultValue={editing?.ssku ?? editing?.sku} required />
            <input name="name" placeholder="名称" defaultValue={editing?.name} required />
            <input name="supplierModel" placeholder="供应商型号" defaultValue={editing?.supplierModel} />
            <select name="supplierId" defaultValue={editing?.supplierId ?? ""}>
              <option value="">未选择供应商</option>
              {suppliers.map((supplier) => (
                <option value={supplier.id} key={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
            <textarea name="note" placeholder="备注" defaultValue={editing?.note} />
            {save.error ? <div className="error">{save.error.message}</div> : null}
            <button className="primary-button">{editing ? "保存修改" : "新增商品"}</button>
          </form>
        </Panel>
        <Panel title="批量导入商品">
          <form className="upload-box" onSubmit={uploadFile}>
            <input name="file" type="file" accept=".xlsx,.xls" required />
            <button className="primary-button">批量导入</button>
          </form>
          <small>支持列：物料编码、产品线、系列、SKU、名称、供应商型号、供应商、备注。</small>
          {importProducts.error ? <div className="error">{importProducts.error.message}</div> : null}
          {importProducts.isSuccess ? <div className="success">导入成功</div> : null}
        </Panel>
        <Panel title="商品列表">
          <table>
            <thead>
              <tr>
                <th>物料编码</th>
                <th>产品线</th>
                <th>系列</th>
                <th>SKU</th>
                <th>名称</th>
                <th>供应商型号</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.map((product) => (
                <tr key={product.id}>
                  <td>{product.materialCode || "-"}</td>
                  <td>{product.productLine || "-"}</td>
                  <td>{product.series || "-"}</td>
                  <td>{product.ssku ?? product.sku}</td>
                  <td>{product.name}</td>
                  <td>{product.supplierModel || "-"}</td>
                  <td>{product.note || "-"}</td>
                  <td className="row-actions">
                    <button onClick={() => setEditing(product)}>编辑</button>
                    {isAdmin ? <button onClick={() => remove.mutate(product.id)}>删除</button> : null}
                  </td>
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
