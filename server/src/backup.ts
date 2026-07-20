import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { getDb } from "./db/index.js";
import { assertDatabaseHealthy, assertSnapshotsMatch, inspectDatabase, inspectDatabaseFile } from "./db/safety.js";

export type BackupMetadata = {
  ok: true;
  triggeredBy: "auto" | "manual";
  createdAt: string;
  generation: string;
  databaseFile: string;
  uploadsCopied: boolean;
  fileCount: number;
  totalBytes: number;
  nextRunAt?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const CHINA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const MAX_GENERATIONS = 14;

export const backupDir = config.backupDir;
const latestMetadataPath = path.join(backupDir, "latest-metadata.json");

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
  for (const entry of await fs.readdir(target, { withFileTypes: true })) {
    const stats = await directoryStats(path.join(target, entry.name));
    fileCount += stats.fileCount;
    totalBytes += stats.totalBytes;
  }
  return { fileCount, totalBytes };
}

async function pruneOldGenerations() {
  const generations = (await fs.readdir(backupDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("backup-"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const name of generations.slice(MAX_GENERATIONS)) {
    await fs.rm(path.join(backupDir, name), { recursive: true, force: true });
  }
}

export async function createBackup(triggeredBy: "auto" | "manual" = "auto"): Promise<BackupMetadata> {
  await fs.mkdir(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const generation = `backup-${timestamp}`;
  const tempDir = path.join(backupDir, `.tmp-${generation}`);
  const finalDir = path.join(backupDir, generation);
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });

  try {
    const database = getDb();
    const sourceSnapshot = inspectDatabase(database);
    assertDatabaseHealthy(sourceSnapshot, "备份源数据库");
    const databaseFile = path.join(tempDir, "daifa.sqlite");
    await database.backup(databaseFile);
    const backupSnapshot = inspectDatabaseFile(databaseFile);
    assertSnapshotsMatch(sourceSnapshot, backupSnapshot);

    const uploadsCopied = await pathExists(config.uploadDir);
    if (uploadsCopied) await fs.cp(config.uploadDir, path.join(tempDir, "uploads"), { recursive: true, force: false });

    const stats = await directoryStats(tempDir);
    const metadata: BackupMetadata = {
      ok: true,
      triggeredBy,
      createdAt: new Date().toISOString(),
      generation,
      databaseFile: "daifa.sqlite",
      uploadsCopied,
      fileCount: stats.fileCount,
      totalBytes: stats.totalBytes,
      nextRunAt: toChinaIso(nextChinaMidnightMs())
    };
    await fs.writeFile(path.join(tempDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf8");
    await fs.rename(tempDir, finalDir);

    const pointerTemp = `${latestMetadataPath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(pointerTemp, JSON.stringify(metadata, null, 2), "utf8");
    await fs.rename(pointerTemp, latestMetadataPath);
    await pruneOldGenerations();
    return metadata;
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export async function getBackupStatus() {
  const nextRunAt = toChinaIso(nextChinaMidnightMs());
  if (!(await pathExists(latestMetadataPath))) return { exists: false, nextRunAt };
  const metadata = JSON.parse(await fs.readFile(latestMetadataPath, "utf8")) as BackupMetadata;
  const databaseFile = path.join(backupDir, metadata.generation, metadata.databaseFile);
  if (!(await pathExists(databaseFile))) return { exists: false, nextRunAt };
  inspectDatabaseFile(databaseFile);
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
    setTimeout(runAutoBackup, Math.max(1000, nextChinaMidnightMs() - Date.now()));
  }

  scheduleNext();
}
