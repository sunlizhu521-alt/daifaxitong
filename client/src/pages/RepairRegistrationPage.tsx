import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Product, type RepairExchange, type Store, type User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

function productSku(product: Product) {
  return product.ssku || product.sku;
}

const carrierOptions = ["顺丰速运", "京东快递", "圆通快递", "中通快递", "申通快递", "韵达快递", "极兔速递", "邮政EMS", "德邦快递", "其他"];

export function RepairRegistrationPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RepairExchange | null>(null);
  const [selectedSku, setSelectedSku] = useState("");
  const [editingSku, setEditingSku] = useState("");
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
  const { data: stores = [] } = useQuery({ queryKey: ["stores"], queryFn: () => api<Store[]>("/stores") });
  const { data: rows = [] } = useQuery({
    queryKey: ["repairs"],
    queryFn: () => api<RepairExchange[]>("/repairs")
  });
  const isAdmin = me?.user?.role === "管理员" || me?.user?.username === "孙立柱";
  const selectedProduct = products.find((product) => productSku(product) === selectedSku);
  const editingProduct = products.find((product) => productSku(product) === editingSku);

  useEffect(() => {
    if (!editing) return;
    setEditingSku(editing.sku || "");
  }, [editing]);

  const createRepair = useMutation({
    mutationFn: (body: unknown) => api("/repairs", { method: "POST", body: JSON.stringify(body), notify: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] })
  });

  const updateRepair = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api(`/repairs/${id}`, { method: "PATCH", body: JSON.stringify(body), notify: true }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["repairs"] });
    }
  });

  const completeRepair = useMutation({
    mutationFn: (id: number) => api(`/repairs/${id}`, { method: "PATCH", body: JSON.stringify({ isCompleted: 1 }), notify: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] })
  });

  const deleteRepair = useMutation({
    mutationFn: (id: number) => api(`/repairs/${id}`, { method: "DELETE", notify: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] })
  });

  function repairPayload(form: FormData) {
    return {
      storeOrderNo: String(form.get("storeOrderNo") ?? "").trim(),
      customerName: String(form.get("customerName") ?? "").trim(),
      customerPhone: String(form.get("customerPhone") ?? "").trim(),
      customerAddress: String(form.get("customerAddress") ?? "").trim(),
      storeName: String(form.get("storeName") ?? "").trim(),
      series: String(form.get("series") ?? "").trim(),
      sku: String(form.get("sku") ?? "").trim(),
      name: String(form.get("name") ?? "").trim(),
      carrierCompany: String(form.get("carrierCompany") ?? "").trim(),
      trackingNo: String(form.get("trackingNo") ?? "").trim(),
      note: String(form.get("note") ?? "").trim(),
      action: ""
    };
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createRepair.mutate(repairPayload(new FormData(event.currentTarget)));
    event.currentTarget.reset();
    setSelectedSku("");
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    updateRepair.mutate({ id: editing.id, body: repairPayload(new FormData(event.currentTarget)) });
  }

  return (
    <>
      <PageHeader title="维修换货登记" description="登记维修换货信息：原店铺订单号、店铺、客户、商品和快递信息。" />
      <Panel title="新增登记">
        <form className="form-grid repair-entry-form" onSubmit={submitForm}>
          <div className="repair-form-row repair-form-row-4">
            <label className="field-block"><span>原店铺订单号 *</span><input name="storeOrderNo" placeholder="原店铺订单号" required /></label>
            <label className="field-block">
              <span>店铺</span>
              <select name="storeName" required>
                <option value="">选择店铺</option>
                {stores.map((store) => (
                  <option value={store.name} key={store.id}>{store.shortName || store.name}</option>
                ))}
              </select>
            </label>
            <label className="field-block"><span>客户姓名</span><input name="customerName" placeholder="客户姓名" /></label>
            <label className="field-block"><span>客户地址</span><input name="customerAddress" placeholder="客户地址" /></label>
          </div>
          <div className="repair-form-row repair-form-row-3">
            <label className="field-block">
              <span>SKU</span>
              <select name="sku" value={selectedSku} onChange={(event) => setSelectedSku(event.target.value)} required>
                <option value="">选择SKU</option>
                {products.map((product) => (
                  <option value={productSku(product)} key={product.id}>{product.name} / {productSku(product)}</option>
                ))}
              </select>
            </label>
            <label className="field-block"><span>系列</span><input name="series" value={selectedProduct?.series || ""} readOnly /></label>
            <label className="field-block"><span>名称</span><input name="name" value={selectedProduct?.name || ""} readOnly /></label>
          </div>
          <div className="repair-form-row repair-form-row-3">
            <label className="field-block">
              <span>快递公司</span>
              <select name="carrierCompany" defaultValue="">
                <option value="">选择快递公司（可选）</option>
                {carrierOptions.map((carrier) => (
                  <option value={carrier} key={carrier}>{carrier}</option>
                ))}
              </select>
            </label>
            <label className="field-block"><span>快递单号</span><input name="trackingNo" placeholder="快递单号" /></label>
            <label className="field-block"><span>备注</span><textarea name="note" placeholder="备注" /></label>
          </div>
          <button className="primary-button" disabled={createRepair.isPending}>提交登记</button>
          {createRepair.error ? <div className="error">{createRepair.error.message}</div> : null}
        </form>
      </Panel>
      <Panel title="登记列表">
        <table className="nowrap-table">
          <thead>
            <tr>
              <th>登记时间</th>
              <th>店铺</th>
              <th>原店铺订单号</th>
              <th>客户姓名</th>
              <th>客户电话</th>
              <th>客户地址</th>
              <th>系列</th>
              <th>SKU</th>
              <th>名称</th>
              <th>快递公司</th>
              <th>快递单号</th>
              <th>备注</th>
              <th>状态</th>
              {isAdmin ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.createdAt?.slice(0, 10)}</td>
                <td>{row.storeName || "-"}</td>
                <td>{row.storeOrderNo}</td>
                <td>{row.customerName || "-"}</td>
                <td>{row.customerPhone || "-"}</td>
                <td>{row.customerAddress || "-"}</td>
                <td>{row.series || "-"}</td>
                <td>{row.sku || "-"}</td>
                <td>{row.name || "-"}</td>
                <td>{row.carrierCompany || "-"}</td>
                <td>{row.trackingNo || "-"}</td>
                <td>{row.note || "-"}</td>
                <td><span className={`status ${row.isCompleted ? "shipped" : "pending"}`}>{row.status}</span></td>
                {isAdmin ? (
                  <td className="row-actions">
                    <button type="button" onClick={() => setEditing(row)}>编辑</button>
                    {row.isCompleted ? null : (
                      <button type="button" className="primary-button" onClick={() => completeRepair.mutate(row.id)}>顾客确定没问题</button>
                    )}
                    <button type="button" onClick={() => { if (window.confirm("确定删除？")) deleteRepair.mutate(row.id); }}>删除</button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {completeRepair.error ? <div className="error">{completeRepair.error.message}</div> : null}
      </Panel>
      {editing ? (
        <div className="modal-backdrop">
          <form className="modal repair-modal" onSubmit={submitEdit}>
            <h2>编辑维修换货</h2>
            <div className="repair-form-row repair-form-row-4">
              <label className="modal-field"><span>原店铺订单号</span><input name="storeOrderNo" defaultValue={editing.storeOrderNo} required /></label>
              <label className="modal-field">
                <span>店铺</span>
                <select name="storeName" defaultValue={editing.storeName} required>
                  <option value="">选择店铺</option>
                  {stores.map((store) => (
                    <option value={store.name} key={store.id}>{store.shortName || store.name}</option>
                  ))}
                </select>
              </label>
              <label className="modal-field"><span>客户姓名</span><input name="customerName" defaultValue={editing.customerName} /></label>
              <label className="modal-field"><span>客户地址</span><input name="customerAddress" defaultValue={editing.customerAddress} /></label>
            </div>
            <div className="repair-form-row repair-form-row-3">
              <label className="modal-field">
                <span>SKU</span>
                <select name="sku" value={editingSku} onChange={(event) => setEditingSku(event.target.value)} required>
                  <option value="">选择SKU</option>
                  {products.map((product) => (
                    <option value={productSku(product)} key={product.id}>{product.name} / {productSku(product)}</option>
                  ))}
                </select>
              </label>
              <label className="modal-field"><span>系列</span><input name="series" value={editingProduct?.series || ""} readOnly /></label>
              <label className="modal-field"><span>名称</span><input name="name" value={editingProduct?.name || ""} readOnly /></label>
            </div>
            <div className="repair-form-row repair-form-row-3">
              <label className="modal-field">
                <span>快递公司</span>
                <select name="carrierCompany" defaultValue={editing.carrierCompany || ""}>
                  <option value="">选择快递公司（可选）</option>
                  {carrierOptions.map((carrier) => (
                    <option value={carrier} key={carrier}>{carrier}</option>
                  ))}
                </select>
              </label>
              <label className="modal-field"><span>快递单号</span><input name="trackingNo" defaultValue={editing.trackingNo} /></label>
              <label className="modal-field"><span>备注</span><textarea name="note" defaultValue={editing.note} /></label>
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setEditing(null)}>取消</button>
              <button className="primary-button" disabled={updateRepair.isPending}>保存修改</button>
            </div>
            {updateRepair.error ? <div className="error">{updateRepair.error.message}</div> : null}
          </form>
        </div>
      ) : null}
    </>
  );
}
