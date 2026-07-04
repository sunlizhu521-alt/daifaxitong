import crypto from "node:crypto";
import { config } from "../config.js";

export type SimpleLogisticsStatus = string;

type CacheEntry = {
  status: SimpleLogisticsStatus;
  expiresAt: number;
};

type Kuaidi100Response = {
  message?: string;
  state?: string;
  ischeck?: string | number;
  status?: string;
  result?: boolean;
  data?: Array<{
    context?: string;
    status?: string;
  }>;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 1000 * 60 * 30;

const carrierCodeMap: Array<[RegExp, string]> = [
  [/顺丰|SF/i, "shunfeng"],
  [/圆通/i, "yuantong"],
  [/中通/i, "zhongtong"],
  [/申通/i, "shentong"],
  [/京东/i, "jd"],
  [/邮政|EMS/i, "ems"],
  [/韵达/i, "yunda"],
  [/极兔|JT/i, "jtexpress"],
  [/百世/i, "huitongkuaidi"],
  [/德邦/i, "debangwuliu"]
];

export function carrierCodeFromName(name?: string | null) {
  const value = String(name ?? "").trim();
  return carrierCodeMap.find(([pattern]) => pattern.test(value))?.[1] ?? "";
}

export function fallbackLogisticsStatus(orderStatus?: string | null, trackingNo?: string | null, returnStatus?: string | null): SimpleLogisticsStatus | "" {
  if (!trackingNo) return "";
  if (returnStatus === "退货成功" || returnStatus === "已收到退货" || returnStatus === "已收货") return "已签收";
  if (orderStatus === "shipped") return "已发货";
  return "已揽件";
}

function mapKuaidi100State(data: Kuaidi100Response): SimpleLogisticsStatus | null {
  const latestTrace = data.data?.find((item) => String(item.status ?? item.context ?? "").trim());
  const latestStatus = String(latestTrace?.status ?? "").trim();
  if (latestStatus) return latestStatus;
  const latestContext = String(latestTrace?.context ?? "").trim();
  if (latestContext) return latestContext;

  if (String(data.ischeck ?? "") === "1" || data.state === "3") return "已签收";
  const stateText: Record<string, string> = {
    "0": "在途中",
    "1": "已揽收",
    "2": "疑难件",
    "4": "退签",
    "5": "派件中",
    "6": "退回中",
    "7": "转单",
    "10": "待清关",
    "11": "清关中",
    "12": "已清关",
    "13": "清关异常",
    "14": "拒签"
  };
  if (data.state) return stateText[data.state] ?? `快递状态${data.state}`;
  return null;
}

function phoneTail(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : digits;
}

export async function queryKuaidi100Status(options: {
  carrierName?: string | null;
  trackingNo?: string | null;
  phone?: string | null;
}): Promise<SimpleLogisticsStatus | null> {
  const trackingNo = String(options.trackingNo ?? "").trim();
  const com = carrierCodeFromName(options.carrierName);
  if (!config.kuaidi100Customer || !config.kuaidi100Key || !trackingNo || !com) return null;

  const cacheKey = `${com}:${trackingNo}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.status;

  const param = JSON.stringify({
    com,
    num: trackingNo,
    phone: phoneTail(options.phone),
    resultv2: "4",
    show: "0",
    order: "desc"
  });
  const sign = crypto.createHash("md5").update(param + config.kuaidi100Key + config.kuaidi100Customer).digest("hex").toUpperCase();
  const body = new URLSearchParams({ customer: config.kuaidi100Customer, sign, param });
  const response = await fetch("https://poll.kuaidi100.com/poll/query.do", { method: "POST", body });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as Kuaidi100Response | null;
  if (!data || data.result === false || data.status === "400") return null;

  const status = mapKuaidi100State(data);
  if (!status) return null;
  cache.set(cacheKey, { status, expiresAt: Date.now() + CACHE_TTL });
  return status;
}
