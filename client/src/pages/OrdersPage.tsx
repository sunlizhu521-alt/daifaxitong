import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile, Product, Store, Supplier, User } from "../api";
import { PageHeader, Panel } from "../ui/Section";

const addressStartPattern =
  /(北京市|上海市|天津市|重庆市|河北省|山西省|辽宁省|吉林省|黑龙江省|江苏省|浙江省|安徽省|福建省|江西省|山东省|河南省|湖北省|湖南省|广东省|海南省|四川省|贵州省|云南省|陕西省|甘肃省|青海省|台湾省|内蒙古自治区|广西壮族自治区|西藏自治区|宁夏回族自治区|新疆维吾尔自治区|香港特别行政区|澳门特别行政区|[\u4e00-\u9fa5]{2,}(?:市|区|县|镇|乡|街道|路|号|小区|村))/;
const addressSignalPattern = /(省|市|区|县|镇|乡|街道|路|街|巷|村|号|栋|幢|楼|室|单元|门|小区|园|公司|店|大道|广场|中心|仓库|科技园)/;
const receiverLabelPattern = /(收件人|收货人|姓名|电话|手机|地址)[:：]/g;

function cleanReceiverText(value: string) {
  return value.replace(receiverLabelPattern, " ").replace(/[，,]/g, " ").replace(/\s+/g, " ").trim();
}

function isAddressLike(value: string) {
  return addressStartPattern.test(value) || addressSignalPattern.test(value);
}

function isLikelyReceiverName(value: string) {
  const compact = value.replace(/\s/g, "");
  return compact.length >= 2 && compact.length <= 8 && !/\d/.test(compact) && /^[\u4e00-\u9fa5A-Za-z·]+$/.test(compact) && !isAddressLike(compact);
}

function parseReceiverInfo(raw: string) {
  const text = raw.replace(/\r/g, "\n").trim();
  const phoneMatch = text.match(/(?:\+?86[-\s]?)?1[3-9]\d{9}(?:[-－—]\d{1,8})?/);
  const phone = phoneMatch?.[0].replace(/^(?:\+?86[-\s]?)/, "").replace(/[－—]/g, "-").replace(/\s/g, "") ?? "";
  const withoutPhoneRaw = phone ? text.replace(phoneMatch?.[0] ?? "", "\n") : text;
  const lines = withoutPhoneRaw
    .split(/\n+/)
    .map(cleanReceiverText)
    .filter(Boolean);

  const nameLineIndex = lines.findIndex(isLikelyReceiverName);
  if (nameLineIndex >= 0) {
    return {
      name: lines[nameLineIndex],
      phone,
      address: lines.filter((_, index) => index !== nameLineIndex).join(" ")
    };
  }

  const withoutPhone = cleanReceiverText(withoutPhoneRaw);
  const parts = withoutPhone.split(/\s+/).filter(Boolean);
  const namePartIndex = parts.findIndex(isLikelyReceiverName);
  if (namePartIndex >= 0) {
    return {
      name: parts[namePartIndex],
      phone,
      address: parts.filter((_, index) => index !== namePartIndex).join(" ")
    };
  }

  const addressStart = withoutPhone.search(addressStartPattern);
  const name = (addressStart > 0 ? withoutPhone.slice(0, addressStart) : "").trim();
  const address = (addressStart >= 0 ? withoutPhone.slice(addressStart).trim() : withoutPhone.replace(name, "").trim())
    .replace(/^(地址|收货地址)[:：]/, "")
    .trim();
  return { name, phone, address };
}

type OrderEntryPageProps = {
  title?: string;
  description?: string;
  panelTitle?: string;
  submitLabel?: string;
  itemInputMode?: "select" | "manual";
  receiverNameLabel?: string;
  receiverPhoneLabel?: string;
  addressLabel?: string;
  orderType?: "dropship" | "accessory";
};

export function OrderEntryPage({
  title = "登记代发",
  description = "手工登记代发订单、识别收货信息、Excel 批量导入并维护发货物流。",
  panelTitle = "新增代发",
  submitLabel = "登记代发",
  itemInputMode = "select",
  receiverNameLabel = "收货人姓名",
  receiverPhoneLabel = "收货人电话",
  addressLabel = "收货地址",
  orderType = "dropship"
}: OrderEntryPageProps) {
  const qc = useQueryClient();
  const [receiverRaw, setReceiverRaw] = useState("");
  const [receiver, setReceiver] = useState({ customerName: "", customerPhone: "", address: "" });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const { data: stores = [] } = useQuery({ queryKey: ["stores"], queryFn: () => api<Store[]>("/stores") });

  const createOrder = useMutation({
    mutationFn: (body: unknown) => api("/orders", { method: "POST", body: JSON.stringify(body), notify: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: [orderType === "accessory" ? "accessory-summary" : "dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      setReceiverRaw("");
      setReceiver({ customerName: "", customerPhone: "", address: "" });
    }
  });
  const importOrders = useMutation({
    mutationFn: (form: FormData) => api("/orders/import", { method: "POST", body: form, notify: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dropship-summary"] });
    }
  });

  function recognizeReceiver() {
    const parsed = parseReceiverInfo(receiverRaw);
    setReceiver({
      customerName: parsed.name,
      customerPhone: parsed.phone,
      address: parsed.address
    });
  }

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const product = itemInputMode === "select" ? products.find((item) => item.id === Number(form.get("productId"))) : undefined;
    if (itemInputMode === "select" && !product) return;
    const manualProductSku = String(form.get("productSku") ?? "").trim();
    const manualProductName = String(form.get("productName") ?? "").trim();
    createOrder.mutate({
      orderNo: form.get("orderNo"),
      orderType,
      supplierId: form.get("supplierId"),
      storeName: form.get("storeName"),
      registrarName: form.get("registrarName"),
      customerName: form.get("customerName"),
      customerPhone: form.get("customerPhone"),
      address: form.get("address"),
      note: form.get("note"),
      items: [
        {
          productId: product?.id ?? null,
          productName: product?.name ?? manualProductName,
          productSku: product?.ssku ?? product?.sku ?? manualProductSku,
          quantity: form.get("quantity"),
          unitCost: product?.costPrice ?? 0,
          unitSalePrice: product?.salePrice ?? 0
        }
      ]
    });
    event.currentTarget.reset();
  }

  function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    importOrders.mutate(form);
  }

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            <button className="ghost-button" onClick={() => downloadFile("/orders/template")}>下载模板</button>
            <button className="primary-button" onClick={() => downloadFile("/orders/export")}>导出代发单</button>
          </>
        }
      />
      <div className="order-entry-layout">
        <Panel title={`${panelTitle}  登记人：${me?.user?.username ?? ""}`}>
          <form className="form-grid order-form" onSubmit={submitOrder}>
            <div className="receiver-action order-form-section section-receiver">
              <div className="order-section-title">
                <strong>收货信息识别</strong>
                <span>粘贴原始收货信息后识别姓名、电话、地址</span>
              </div>
              <label className="field-block">
                <span>粘贴收货信息</span>
                <textarea
                  placeholder="例如：张三 13800000000 上海市浦东新区示例路1号"
                  value={receiverRaw}
                  onChange={(event) => setReceiverRaw(event.target.value)}
                  required
                />
              </label>
              <button type="button" className="ghost-button" onClick={recognizeReceiver}>识别姓名/电话/地址</button>
            </div>
            <div className="receiver-result-grid order-form-section section-result">
              <div className="order-section-title">
                <strong>收货信息明细</strong>
                <span>识别结果可手动修改</span>
              </div>
              <label className="field-block">
                <span>{receiverNameLabel}</span>
                <input
                  name="customerName"
                  placeholder={receiverNameLabel}
                  value={receiver.customerName}
                  onChange={(event) => setReceiver((current) => ({ ...current, customerName: event.target.value }))}
                  required
                />
              </label>
              <label className="field-block">
                <span>{receiverPhoneLabel}</span>
                <input
                  name="customerPhone"
                  placeholder={receiverPhoneLabel}
                  value={receiver.customerPhone}
                  onChange={(event) => setReceiver((current) => ({ ...current, customerPhone: event.target.value }))}
                  required
                />
              </label>
              <label className="field-block">
                <span>{addressLabel}</span>
                <input
                  name="address"
                  placeholder={addressLabel}
                  value={receiver.address}
                  onChange={(event) => setReceiver((current) => ({ ...current, address: event.target.value }))}
                  required
                />
              </label>
            </div>
            <div className="order-detail-grid order-form-section section-detail">
              <div className="order-section-title">
                <strong>订单与商品</strong>
                <span>{itemInputMode === "manual" ? "店铺、订单、供应商、品号、商品名称、数量均为必填" : "店铺、订单、供应商、SKU、数量均为必填"}</span>
              </div>
              <label className="field-block">
                <span>选择店铺</span>
                <select name="storeName" required>
                  <option value="">选择店铺</option>
                  {stores.map((store) => (
                    <option value={store.name} key={store.id}>
                      {store.shortName || store.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-block">
                <span>店铺订单编号</span>
                <input name="orderNo" placeholder="店铺订单编号" required />
              </label>
              <label className="field-block">
                <span>选择供应商</span>
                <select name="supplierId" required>
                  <option value="">选择供应商</option>
                  {suppliers.map((supplier) => (
                    <option value={supplier.id} key={supplier.id}>
                      {supplier.shortName || supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              {itemInputMode === "manual" ? (
                <>
                  <label className="field-block">
                    <span>填写品号</span>
                    <input name="productSku" placeholder="填写品号" required />
                  </label>
                  <label className="field-block">
                    <span>商品名称</span>
                    <input name="productName" placeholder="商品名称" required />
                  </label>
                </>
              ) : (
                <label className="field-block">
                  <span>选择SKU</span>
                  <select name="productId" required>
                    <option value="">选择SKU</option>
                    {products.map((product) => (
                      <option value={product.id} key={product.id}>
                        {product.name} / {product.ssku ?? product.sku}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field-block">
                <span>数量</span>
                <input name="quantity" type="number" min="1" placeholder="数量" required />
              </label>
            </div>
            <input key={me?.user?.username ?? "registrar"} type="hidden" name="registrarName" value={me?.user?.username ?? ""} />
            <div className="order-note-row order-form-section section-note">
              <div className="order-section-title">
                <strong>备注</strong>
                <span>可填写特殊要求或补充信息</span>
              </div>
              <label className="field-block">
                <span>备注内容</span>
                <textarea name="note" placeholder="备注" />
              </label>
            </div>
            {createOrder.error ? <div className="error">{createOrder.error.message}</div> : null}
            <button className="primary-button">{submitLabel}</button>
          </form>
        </Panel>
        <Panel title="Excel 导入">
          <form className="upload-box" onSubmit={uploadFile}>
            <label className="field-block">
              <span>导入文件</span>
              <input name="file" type="file" accept=".xlsx,.xls" required />
            </label>
            <button className="primary-button">导入代发单</button>
          </form>
          {importOrders.error ? <div className="error">{importOrders.error.message}</div> : null}
          {importOrders.isSuccess ? <div className="success">导入成功</div> : null}
        </Panel>
      </div>
    </>
  );
}

export function OrdersPage() {
  return <OrderEntryPage />;
}
