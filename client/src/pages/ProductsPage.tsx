import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Product, Supplier } from "../api";
import { PageHeader, Panel } from "../ui/Section";

export function ProductsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Product | null>(null);
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const { data = [] } = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate(Object.fromEntries(form));
    event.currentTarget.reset();
  }

  return (
    <>
      <PageHeader title="商品/SKU" description="维护商品规格、成本价、建议售价、供应商和上下架状态。" />
      <div className="two-column">
        <Panel title={editing ? "编辑商品" : "新增商品"}>
          <form className="form-grid" onSubmit={submit}>
            <input name="name" placeholder="商品名称" defaultValue={editing?.name} required />
            <input name="sku" placeholder="SKU/规格" defaultValue={editing?.sku} required />
            <input name="costPrice" placeholder="成本价" type="number" step="0.01" defaultValue={editing?.costPrice ?? 0} />
            <input name="salePrice" placeholder="建议售价" type="number" step="0.01" defaultValue={editing?.salePrice ?? 0} />
            <select name="supplierId" defaultValue={editing?.supplierId ?? ""}>
              <option value="">未选择供应商</option>
              {suppliers.map((supplier) => (
                <option value={supplier.id} key={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
            <select name="status" defaultValue={editing?.status ?? "active"}>
              <option value="active">上架</option>
              <option value="inactive">停用</option>
            </select>
            <textarea name="note" placeholder="备注" defaultValue={editing?.note} />
            {save.error ? <div className="error">{save.error.message}</div> : null}
            <button className="primary-button">{editing ? "保存修改" : "新增商品"}</button>
          </form>
        </Panel>
        <Panel title="商品列表">
          <table>
            <thead>
              <tr>
                <th>商品</th>
                <th>SKU</th>
                <th>供应商</th>
                <th>成本/售价</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.sku}</td>
                  <td>{product.supplierName ?? "-"}</td>
                  <td>{product.costPrice} / {product.salePrice}</td>
                  <td>{product.status === "active" ? "上架" : "停用"}</td>
                  <td className="row-actions">
                    <button onClick={() => setEditing(product)}>编辑</button>
                    <button onClick={() => remove.mutate(product.id)}>删除</button>
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
