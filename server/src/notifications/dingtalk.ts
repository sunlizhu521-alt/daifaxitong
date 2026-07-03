import crypto from "node:crypto";
import { config } from "../config.js";

type NotifyField = {
  label: string;
  value: unknown;
};

type NotifyInput = {
  action: string;
  operator?: string;
  order?: Record<string, unknown> | null;
  fields?: NotifyField[];
};

type DingtalkResponse = {
  errcode?: number;
  errmsg?: string;
};

function appendDingtalkSignature(webhook: string) {
  if (!config.dingtalkSecret) return webhook;
  const timestamp = Date.now();
  const signSource = `${timestamp}\n${config.dingtalkSecret}`;
  const sign = crypto.createHmac("sha256", config.dingtalkSecret).update(signSource).digest("base64");
  const separator = webhook.includes("?") ? "&" : "?";
  return `${webhook}${separator}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
}

function valueText(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (Array.isArray(value)) return value.map(valueText).join(" / ");
  return String(value).trim() || "-";
}

function orderTypeText(value: unknown) {
  return value === "accessory" ? "配件" : "成品";
}

function firstItem(order?: Record<string, unknown> | null) {
  const items = order?.items;
  return Array.isArray(items) ? (items[0] as Record<string, unknown> | undefined) : undefined;
}

function latestShipment(order?: Record<string, unknown> | null) {
  const shipments = order?.shipments;
  return Array.isArray(shipments) ? (shipments[0] as Record<string, unknown> | undefined) : undefined;
}

function encodeJsonPayload(payload: unknown) {
  return Buffer.from(
    JSON.stringify(payload).replace(/[^\x00-\x7F]/g, (char) =>
      "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0")
    ),
    "utf8"
  );
}

async function sendDingtalkPayload(payload: unknown) {
  const response = await fetch(appendDingtalkSignature(config.dingtalkWebhook), {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: encodeJsonPayload(payload)
  });
  const result = (await response.json().catch(() => null)) as DingtalkResponse | null;
  return { response, result };
}

export async function notifyBusinessAction(input: NotifyInput) {
  if (!config.dingtalkWebhook) return;

  const order = input.order ?? undefined;
  const item = firstItem(order);
  const shipment = latestShipment(order);
  const fields: NotifyField[] = [
    { label: "操作人", value: input.operator },
    { label: "操作", value: input.action },
    { label: "订单类型", value: order ? orderTypeText(order.orderType) : "" },
    { label: "订单号", value: order?.orderNo },
    { label: "店铺", value: order?.storeName },
    { label: "登记人", value: order?.registrarName },
    { label: "客户", value: order?.customerName },
    { label: "电话", value: order?.customerPhone },
    { label: "地址", value: order?.address },
    { label: "商品", value: item?.productName },
    { label: "SKU/品号", value: item?.productSku },
    { label: "数量", value: item?.quantity },
    { label: "快递公司", value: shipment?.carrier },
    { label: "发货单号", value: shipment?.trackingNo },
    { label: "采购订单号填写人", value: order?.purchaseOrderUser },
    { label: "采购订单号", value: order?.purchaseOrderNo },
    ...(input.fields ?? [])
  ].filter((field) => valueText(field.value) !== "-");

  const title = `一件代发系统：${input.action}`;
  const text = [`### ${title}`, "", ...fields.map((field) => `- **${field.label}**：${valueText(field.value)}`)].join("\n");
  const payload = {
    msgtype: "markdown",
    markdown: { title, text }
  };

  try {
    const atAllPayload = { ...payload, at: { isAtAll: true } };
    const firstResult = await sendDingtalkPayload(atAllPayload);
    if (firstResult.response.ok && !firstResult.result?.errcode) return;

    if (firstResult.result?.errcode === 450103) {
      const retryResult = await sendDingtalkPayload(payload);
      if (retryResult.response.ok && !retryResult.result?.errcode) return;
      console.warn("钉钉通知发送失败", retryResult.result ?? retryResult.response.statusText);
      return;
    }

    console.warn("钉钉通知发送失败", firstResult.result ?? firstResult.response.statusText);
  } catch (error) {
    console.warn("钉钉通知发送失败", error);
  }
}
