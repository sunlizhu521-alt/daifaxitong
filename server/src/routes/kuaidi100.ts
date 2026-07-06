import { Router } from "express";
import { z } from "zod";
import { fallbackLogisticsStatus, queryKuaidi100Info } from "../logistics/kuaidi100.js";

export const kuaidi100Router = Router();

const querySchema = z.object({
  trackingNo: z.string().trim().min(1, "快递单号不能为空"),
  carrierName: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  orderStatus: z.string().optional().default(""),
  returnStatus: z.string().optional().default("")
});

async function queryLogistics(input: unknown) {
  const parsed = querySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      message: parsed.error.issues[0]?.message ?? "参数错误"
    };
  }

  const { trackingNo, carrierName, phone, orderStatus, returnStatus } = parsed.data;
  const info = await queryKuaidi100Info({ carrierName, trackingNo, phone }).catch(() => null);
  const status = info?.status ?? fallbackLogisticsStatus(orderStatus, trackingNo, returnStatus) ?? "";

  return {
    ok: true as const,
    data: {
      trackingNo,
      carrierName: info?.carrierName ?? carrierName,
      status
    }
  };
}

kuaidi100Router.get("/", async (req, res) => {
  const result = await queryLogistics(req.query);
  if (!result.ok) {
    res.status(400).json({ message: result.message });
    return;
  }
  res.json(result.data);
});

kuaidi100Router.post("/query", async (req, res) => {
  const result = await queryLogistics(req.body);
  if (!result.ok) {
    res.status(400).json({ message: result.message });
    return;
  }
  res.json(result.data);
});
