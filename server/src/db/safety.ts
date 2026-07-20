import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type DatabaseSnapshot = {
  integrity: string;
  foreignKeyErrors: number;
  counts: Record<string, number>;
};

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function inspectDatabase(database: Database.Database): DatabaseSnapshot {
  const integrityRows = database.pragma("integrity_check") as Array<{ integrity_check: string }>;
  const integrity = integrityRows.map((row) => row.integrity_check).join("; ");
  const foreignKeyErrors = (database.pragma("foreign_key_check") as unknown[]).length;
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string }>;
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    const row = database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)}`).get() as { count: number };
    counts[name] = row.count;
  }
  return { integrity, foreignKeyErrors, counts };
}

export function assertDatabaseHealthy(snapshot: DatabaseSnapshot, label: string) {
  if (snapshot.integrity !== "ok") throw new Error(`${label} integrity_check failed: ${snapshot.integrity}`);
  if (snapshot.foreignKeyErrors !== 0) throw new Error(`${label} has ${snapshot.foreignKeyErrors} foreign key errors`);
}

export function assertSnapshotsMatch(source: DatabaseSnapshot, backup: DatabaseSnapshot) {
  const names = new Set([...Object.keys(source.counts), ...Object.keys(backup.counts)]);
  for (const name of names) {
    if ((source.counts[name] ?? -1) !== (backup.counts[name] ?? -1)) {
      throw new Error(`backup count mismatch for ${name}: ${source.counts[name]} != ${backup.counts[name]}`);
    }
  }
}

export function inspectDatabaseFile(filename: string): DatabaseSnapshot {
  const stat = fs.statSync(filename);
  if (!stat.isFile() || stat.size === 0) throw new Error(`database backup is empty: ${filename}`);
  const database = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    const snapshot = inspectDatabase(database);
    assertDatabaseHealthy(snapshot, filename);
    return snapshot;
  } finally {
    database.close();
  }
}

export function createPreMigrationBackup(database: Database.Database, sourceFile: string, backupRoot: string) {
  database.pragma("wal_checkpoint(FULL)");
  const source = inspectDatabase(database);
  assertDatabaseHealthy(source, sourceFile);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const directory = path.join(backupRoot, `pre-migration-${timestamp}`);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, path.basename(sourceFile));
  fs.copyFileSync(sourceFile, destination, fs.constants.COPYFILE_EXCL);
  const backup = inspectDatabaseFile(destination);
  assertSnapshotsMatch(source, backup);
  return destination;
}
