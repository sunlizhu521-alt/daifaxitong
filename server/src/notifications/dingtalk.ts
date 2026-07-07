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

type FeishuResponse = {
  code?: number;
  msg?: string;
  StatusCode?: number;
  StatusMessage?: string;
};

const mainDingtalkActions = new Set(["登记代发", "配件登记", "填写发货单号", "发货单号", "已提货", "发货安排修改", "配件发货"]);
const returnDingtalkActions = new Set(["退货登记", "提交退货"]);
const feishuActions = new Set(["填写发货单号", "发货单号", "退货操作", "发货安排修改"]);
const accessoryFeishuActions = new Set(["配件登记", "配件发货", "发货安排修改", "修改订单"]);

function appendDingtalkSignature(webhook: string, secret: string) {
  if (!secret) return webhook;
  const timestamp = Date.now();
  const signSource = `${timestamp}\n${secret}`;
  const sign = crypto.createHmac("sha256", secret).update(signSource).digest("base64");
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

function feishuSignature(timestamp: string) {
  if (!config.feishuSecret) return "";
  return crypto.createHmac("sha256", `${timestamp}\n${config.feishuSecret}`).update("").digest("base64");
}

function buildNotification(input: NotifyInput) {
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
  return { title, text };
}

async function notifyDingtalk(title: string, text: string, webhook: string, secret: string, errorLabel: string) {
  if (!webhook) return;
  try {
    const response = await fetch(appendDingtalkSignature(webhook, secret), {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        msgtype: "markdown",
        markdown: { title, text }
      })
    });
    const result = (await response.json().catch(() => null)) as DingtalkResponse | null;
    if (!response.ok || result?.errcode) {
      console.warn(`${errorLabel}发送失败`, result ?? response.statusText);
    }
  } catch (error) {
    console.warn(`${errorLabel}发送失败`, error);
  }
}

async function notifyFeishu(title: string, text: string) {
  if (!config.feishuWebhook) return;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = {
    msg_type: "interactive",
    card: {
      config: {
        wide_screen_mode: true
      },
      header: {
        template: "blue",
        title: {
          tag: "plain_text",
          content: title
        }
      },
      elements: [
        {
          tag: "markdown",
          content: text
        }
      ]
    }
  };
  const signedPayload = config.feishuSecret ? { ...payload, timestamp, sign: feishuSignature(timestamp) } : payload;

  try {
    const response = await fetch(config.feishuWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(signedPayload)
    });
    const result = (await response.json().catch(() => null)) as FeishuResponse | null;
    if (!response.ok || (result?.code ?? result?.StatusCode ?? 0) !== 0) {
      console.warn("飞书通知发送失败", result ?? response.statusText);
    }
  } catch (error) {
    console.warn("飞书通知发送失败", error);
  }
}

export async function notifyBusinessAction(input: NotifyInput) {
  const { title, text } = buildNotification(input);
  const tasks: Array<Promise<void>> = [];
  const isAccessoryOrder = input.order?.orderType === "accessory";

  if (mainDingtalkActions.has(input.action)) {
    tasks.push(notifyDingtalk(title, text, config.dingtalkWebhook, config.dingtalkSecret, "主钉钉通知"));
  }
  if (returnDingtalkActions.has(input.action)) {
    tasks.push(notifyDingtalk(title, text, config.returnDingtalkWebhook, config.returnDingtalkSecret, "退货钉钉通知"));
  }
  if (feishuActions.has(input.action) || (isAccessoryOrder && accessoryFeishuActions.has(input.action))) {
    tasks.push(notifyFeishu(title, text));
  }

  await Promise.all(tasks);
}
