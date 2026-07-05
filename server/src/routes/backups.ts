import { Router } from "express";
import { createBackup, getBackupStatus } from "../backup.js";

export const backupsRouter = Router();

backupsRouter.get("/", async (_req, res) => {
  res.json(await getBackupStatus());
});

backupsRouter.post("/run", async (_req, res) => {
  try {
    res.json(await createBackup("manual"));
  } catch {
    res.status(500).json({ message: "备份失败，请稍后重试" });
  }
});
