import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";

export const kuaidi100Router = Router();

const querySchema = z.object({
  trackingNo: z.string().trim().min(1, "快递单号不能为空"),
  carrierName: z.string().optional().default(""),
  carrierCode: z.string().optional().default(""),
  com: z.string().optional().default(""),
  phone: z.string().optional().default("")
});

// 快递100查询状态码（不是物流状态，是查询结果状态）
// 200: 查询成功  201: 暂无信息  其他: 异常
const STATUS_LABEL: Record<string, string> = {
  "200": "查询成功",
  "201": "暂无信息"
};

const STATE_MAP: Record<string, string> = {
  "0": "在途",
  "1": "已揽收",
  "2": "疑难",
  "3": "已签收",
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

type Kuaidi100QueryResponse = {
  message?: string;
  state?: string;
  status?: string;
  com?: string;
  nu?: string;
  data?: Array<{ time: string; ftime: string; context: string; location?: string }>;
  routeInfo?: { from: { name: string }; cur: { name: string }; to: { name: string } };
};

type Kuaidi100AutoResponse = {
  auto?: Array<{
    comCode?: string;
    id?: string;
    name?: string;
  }>;
};

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

function carrierCodeFromInput(carrierName: string, carrierCode: string, com: string) {
  const explicitCode = (carrierCode || com).trim();
  if (explicitCode) return explicitCode;
  return carrierCodeMap.find(([pattern]) => pattern.test(carrierName))?.[1] ?? "";
}

function phoneTail(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : digits;
}

async function detectCarrierByTrackingNo(trackingNo: string) {
  if (!config.kuaidi100Key || !trackingNo) return "";
  const params = new URLSearchParams({ key: config.kuaidi100Key, text: trackingNo, resultv2: "1" });
  const response = await fetch(`https://www.kuaidi100.com/autonumber/autoComNum?${params.toString()}`);
  if (!response.ok) return "";
  const data = (await response.json().catch(() => null)) as Kuaidi100AutoResponse | null;
  const first = data?.auto?.find((item) => String(item.comCode ?? item.id ?? "").trim());
  return String(first?.comCode ?? first?.id ?? "").trim();
}

async function queryKuaidi100(input: unknown) {
  const parsed = querySchema.safeParse(input);
  if (!parsed.success) {
    return {
      httpStatus: 400,
      body: { ok: false, message: parsed.error.issues[0]?.message ?? "参数错误" }
    };
  }
  if (!config.kuaidi100Customer || !config.kuaidi100Key) {
    return {
      httpStatus: 200,
      body: { ok: false, message: "快递100配置未设置，请检查 KUAIDI100_CUSTOMER 和 KUAIDI100_KEY" }
    };
  }

  const { trackingNo, carrierName, phone } = parsed.data;
  const com = carrierCodeFromInput(carrierName, parsed.data.carrierCode, parsed.data.com) || (await detectCarrierByTrackingNo(trackingNo));
  if (!com) {
    return {
      httpStatus: 200,
      body: { ok: false, message: "未识别快递公司，请选择或填写正确的快递公司" }
    };
  }

  const param = JSON.stringify({
    com,
    num: trackingNo,
    phone: phoneTail(phone),
    resultv2: "4",
    show: "0",
    order: "desc"
  });
  const sign = crypto.createHash("md5").update(param + config.kuaidi100Key + config.kuaidi100Customer).digest("hex").toUpperCase();
  const body = new URLSearchParams({ customer: config.kuaidi100Customer, sign, param });
  const response = await fetch("https://poll.kuaidi100.com/poll/query.do", { method: "POST", body });
  const data = (await response.json().catch(() => ({}))) as Kuaidi100QueryResponse;

  // 快递单号暂无信息（刚发出的单号或已过期单号）
  if (data.status === "201" || data.message === "false") {
    return {
      httpStatus: 200,
      body: {
        ok: true,
        statusCode: "201",
        statusLabel: "暂无信息",
        hint: "快递信息尚未录入系统，或者单号已经过期",
        state: "",
        stateName: "",
        status: "",
        traces: []
      }
    };
  }

  // 查询失败（网络问题、参数错误等）
  if (!response.ok || (data.status && data.status !== "200")) {
    return {
      httpStatus: 200,
      body: {
        ok: false,
        message: data.message || "查询失败，请检查单号和快递公司是否正确"
      }
    };
  }

  // 查询成功
  const state = data.state ?? "";
  const stateName = STATE_MAP[state] || (state ? `未知状态(${state})` : "暂无轨迹");
  const traces = (data.data ?? []).map((trace) => ({
    time: trace.time || trace.ftime,
    context: trace.context,
    location: trace.location || ""
  }));

  return {
    httpStatus: 200,
    body: {
      ok: true,
      statusCode: data.status || "200",
      statusLabel: STATUS_LABEL[data.status || "200"] || "查询成功",
      carrierCode: data.com || com,
      trackingNo: data.nu || trackingNo,
      state,
      stateName,
      status: traces[0]?.context || stateName,
      traces,
      routeInfo: data.routeInfo || null
    }
  };
}

kuaidi100Router.get("/", async (req, res) => {
  const result = await queryKuaidi100(req.query);
  res.status(result.httpStatus).json(result.body);
});

kuaidi100Router.post("/query", async (req, res) => {
  const result = await queryKuaidi100(req.body);
  res.status(result.httpStatus).json(result.body);
});
