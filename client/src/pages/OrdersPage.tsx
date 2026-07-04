import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, downloadFile, Product, Store, Supplier, User } from "../api";
import { notifyApp } from "../ui/AppNotifications";
import { PageHeader, Panel } from "../ui/Section";

const addressStartPattern =
  /(北京市|上海市|天津市|重庆市|河北省|山西省|辽宁省|吉林省|黑龙江省|江苏省|浙江省|安徽省|福建省|江西省|山东省|河南省|湖北省|湖南省|广东省|海南省|四川省|贵州省|云南省|陕西省|甘肃省|青海省|台湾省|内蒙古自治区|广西壮族自治区|西藏自治区|宁夏回族自治区|新疆维吾尔自治区|香港特别行政区|澳门特别行政区|[\u4e00-\u9fa5]{2,}(?:市|区|县|镇|乡|街道|路|号|小区|村))/;
const addressSignalPattern = /(省|市|区|县|镇|乡|街道|路|街|巷|村|号|栋|幢|楼|室|单元|门|小区|园|公司|店|大道|广场|中心|仓库|科技园)/;
const receiverLabelPattern = /(收件人|收货人|姓名|电话|手机|地址)[:：]/g;
const phonePattern = /(?:\+?86[-\s]?)?1[3-9]\d{9}(?:[-－—]\d{1,8})?/;
const chineseSurnamePattern = /^[赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣邓郁单杭洪包诸左石崔吉龚程嵇邢裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘斜厉戎祖武符刘景詹龙叶幸司韶郜黎蓟溥印怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴郁胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍却璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公司上欧夏诸闻东方赫皇尉公羊澹公宗濮淳单太申公仲轩令钟宇长慕司司]/;
const addressNameBoundaryPattern = /[省市区县镇乡村路街巷号栋幢楼室单元门旁口台处店馆院园户]$/;

function cleanReceiverText(value: string) {
  return value.replace(receiverLabelPattern, " ").replace(/[，,、;]/g, " ").replace(/\s+/g, " ").trim();
}

function isAddressLike(value: string) {
  return addressStartPattern.test(value) || addressSignalPattern.test(value);
}

function isLikelyReceiverName(value: string) {
  const compact = value.replace(/\s/g, "").replace(/[，,。；;、]/g, "");
  if (compact.length < 1 || compact.length > 8 || /\d/.test(compact)) return false;
  if (!/^[\u4e00-\u9fa5A-Za-z·]+$/.test(compact) || isAddressLike(compact)) return false;
  if (compact.length === 1) return chineseSurnamePattern.test(compact) || /^[A-Za-z]$/.test(compact);
  return true;
}

function normalizePhone(value: string) {
  return value.replace(/^(?:\+?86[-\s]?)/, "").replace(/[－—]/g, "-").replace(/\s/g, "");
}

function splitReceiverParts(value: string) {
  return cleanReceiverText(value).split(/\s+/).filter(Boolean);
}

function removeNameFromText(value: string, name: string) {
  if (!name) return cleanReceiverText(value);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return cleanReceiverText(value.replace(new RegExp(escaped), " "));
}

function findSeparatedName(lines: string[]) {
  const lineIndex = lines.findIndex(isLikelyReceiverName);
  if (lineIndex >= 0) {
    return {
      name: lines[lineIndex],
      address: lines.filter((_, index) => index !== lineIndex).join(" ")
    };
  }

  const parts = lines.flatMap(splitReceiverParts);
  const partIndex = parts.findIndex(isLikelyReceiverName);
  if (partIndex >= 0) {
    return {
      name: parts[partIndex],
      address: parts.filter((_, index) => index !== partIndex).join(" ")
    };
  }
  return null;
}

function extractTrailingName(value: string) {
  const compact = cleanReceiverText(value);
  const parts = compact.split(/\s+/).filter(Boolean);
  const lastPart = parts.at(-1);
  if (lastPart && isLikelyReceiverName(lastPart)) {
    return { name: lastPart, address: parts.slice(0, -1).join(" ") };
  }

  const titleMatch = compact.match(/([\u4e00-\u9fa5]{1,4}(?:先生|女士|小姐))$/);
  if (titleMatch && chineseSurnamePattern.test(titleMatch[1])) {
    return { name: titleMatch[1], address: compact.slice(0, -titleMatch[1].length).trim() };
  }

  for (const length of [4, 3, 2, 1]) {
    const candidate = compact.slice(-length);
    const address = compact.slice(0, -length).trim();
    if (!address || !isAddressLike(address) || !addressNameBoundaryPattern.test(address)) continue;
    if (!isLikelyReceiverName(candidate) || !chineseSurnamePattern.test(candidate)) continue;
    return { name: candidate, address };
  }
  return null;
}

function extractLeadingName(value: string) {
  const compact = cleanReceiverText(value);
  const parts = compact.split(/\s+/).filter(Boolean);
  const firstPart = parts[0];
  if (firstPart && isLikelyReceiverName(firstPart)) {
    return { name: firstPart, address: parts.slice(1).join(" ") };
  }
  return null;
}

function parseReceiverInfo(raw: string) {
  const text = raw.replace(/\r/g, "\n").trim();
  const phoneMatch = text.match(phonePattern);
  const phone = phoneMatch?.[0] ? normalizePhone(phoneMatch[0]) : "";
  const beforePhone = phoneMatch?.index !== undefined ? text.slice(0, phoneMatch.index) : "";
  const afterPhone = phoneMatch?.index !== undefined ? text.slice(phoneMatch.index + phoneMatch[0].length) : "";
  const withoutPhoneRaw = phone ? text.replace(phoneMatch?.[0] ?? "", "\n") : text;
  const lines = withoutPhoneRaw
    .split(/\n+/)
    .map(cleanReceiverText)
    .filter(Boolean);

  const separated = findSeparatedName(lines);
  if (separated) {
    return { name: separated.name, phone, address: cleanReceiverText(separated.address) };
  }

  const trailingBeforePhone = extractTrailingName(beforePhone);
  if (trailingBeforePhone) {
    return {
      name: trailingBeforePhone.name,
      phone,
      address: cleanReceiverText([trailingBeforePhone.address, afterPhone].filter(Boolean).join(" "))
    };
  }

  const leadingAfterPhone = extractLeadingName(afterPhone);
  if (leadingAfterPhone) {
    return {
      name: leadingAfterPhone.name,
      phone,
      address: cleanReceiverText([beforePhone, leadingAfterPhone.address].filter(Boolean).join(" "))
    };
  }

  const withoutPhone = cleanReceiverText(withoutPhoneRaw);
  const addressStart = withoutPhone.search(addressStartPattern);
  const name = (addressStart > 0 ? withoutPhone.slice(0, addressStart) : "").trim();
  const address = (addressStart >= 0 ? withoutPhone.slice(addressStart).trim() : removeNameFromText(withoutPhone, name))
    .replace(/^(地址|收货地址)[:：]/, "")
    .trim();
  return { name, phone, address };
}

function findDefaultSupplierId(suppliers: Supplier[]) {
  return suppliers.find((supplier) => supplier.shortName?.trim() === "易乐" || supplier.name.trim() === "易乐")?.id.toString() ?? "";
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
  const [supplierId, setSupplierId] = useState("");
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<{ user: User | null }>("/auth/me") });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/suppliers") });
  const { data: stores = [] } = useQuery({ queryKey: ["stores"], queryFn: () => api<Store[]>("/stores") });

  useEffect(() => {
    if (supplierId) return;
    setSupplierId(findDefaultSupplierId(suppliers));
  }, [suppliers, supplierId]);

  const createOrder = useMutation({
    mutationFn: (body: unknown) => api<{ duplicateWarning?: string }>("/orders", { method: "POST", body: JSON.stringify(body), notify: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: [orderType === "accessory" ? "accessory-summary" : "dropship-summary"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
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
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const product = itemInputMode === "select" ? products.find((item) => item.id === Number(form.get("productId"))) : undefined;
    if (itemInputMode === "select" && !product) return;
    const manualProductSku = String(form.get("productSku") ?? "").trim();
    const manualProductName = String(form.get("productName") ?? "").trim();
    createOrder.mutate(
      {
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
      },
      {
        onSuccess: (data) => {
          if (data.duplicateWarning) {
            notifyApp({ variant: "success", message: data.duplicateWarning });
            return;
          }
          notifyApp({ variant: "success", message: "登记成功" });
          formElement.reset();
          setReceiverRaw("");
          setReceiver({ customerName: "", customerPhone: "", address: "" });
        },
        onError: (error) => {
          notifyApp({ variant: "error", message: error instanceof Error ? error.message : "登记失败，请检查填写内容" });
        }
      }
    );
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
                <select name="supplierId" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required>
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
