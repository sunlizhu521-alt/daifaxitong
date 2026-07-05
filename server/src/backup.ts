import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { getDb } from "./db/index.js";

export type BackupMetadata = {
  ok: true;
  triggeredBy: "auto" | "manual";
  createdAt: string;
  databaseFile: string;
  uploadsCopied: boolean;
  fileCount: number;
  totalBytes: number;
  nextRunAt?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const CHINA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export const backupDir = config.backupDir;
const latestDir = path.join(backupDir, "latest");
const metadataPath = path.join(latestDir, "metadata.json");

function toChinaIso(ms: number) {
  return new Date(ms + CHINA_UTC_OFFSET_MS).toISOString().replace("Z", "+08:00");
}

function nextChinaMidnightMs(now = Date.now()) {
  const chinaNow = now + CHINA_UTC_OFFSET_MS;
  return Math.floor(chinaNow / DAY_MS) * DAY_MS + DAY_MS - CHINA_UTC_OFFSET_MS;
}

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function directoryStats(target: string): Promise<{ fileCount: number; totalBytes: number }> {
  if (!(await pathExists(target))) return { fileCount: 0, totalBytes: 0 };
  const stat = await fs.stat(target);
  if (stat.isFile()) return { fileCount: 1, totalBytes: stat.size };
  if (!stat.isDirectory()) return { fileCount: 0, totalBytes: 0 };

  let fileCount = 0;
  let totalBytes = 0;
  const entries = await fs.readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(target, entry.name);
    const stats = await directoryStats(child);
    fileCount += stats.fileCount;
    totalBytes += stats.totalBytes;
  }
  return { fileCount, totalBytes };
}

export async function createBackup(triggeredBy: "auto" | "manual" = "auto"): Promise<BackupMetadata> {
  await fs.mkdir(backupDir, { recursive: true });
  const tempDir = path.join(backupDir, `.tmp-latest-${Date.now()}`);
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });

  try {
    const databaseFile = path.join(tempDir, "daifa.sqlite");
    await getDb().backup(databaseFile);

    const uploadsCopied = await pathExists(config.uploadDir);
    if (uploadsCopied) {
      await fs.cp(config.uploadDir, path.join(tempDir, "uploads"), { recursive: true, force: true });
    }

    const stats = await directoryStats(tempDir);
    const metadata: BackupMetadata = {
      ok: true,
      triggeredBy,
      createdAt: new Date().toISOString(),
      databaseFile: "daifa.sqlite",
      uploadsCopied,
      fileCount: stats.fileCount,
      totalBytes: stats.totalBytes,
      nextRunAt: toChinaIso(nextChinaMidnightMs())
    };
    await fs.writeFile(path.join(tempDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf8");
    await fs.rm(latestDir, { recursive: true, force: true });
    await fs.rename(tempDir, latestDir);
    return metadata;
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export async function getBackupStatus() {
  const nextRunAt = toChinaIso(nextChinaMidnightMs());
  if (!(await pathExists(metadataPath))) {
    return { exists: false, nextRunAt };
  }
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8")) as BackupMetadata;
  return { exists: true, ...metadata, nextRunAt };
}

export function startDailyBackupScheduler() {
  async function runAutoBackup() {
    try {
      const metadata = await createBackup("auto");
      console.log(`自动备份完成：${metadata.createdAt}`);
    } catch (error) {
      console.error("自动备份失败", error);
    } finally {
      scheduleNext();
    }
  }

  function scheduleNext() {
    const delay = Math.max(1000, nextChinaMidnightMs() - Date.now());
    setTimeout(runAutoBackup, delay);
  }

  scheduleNext();
}
