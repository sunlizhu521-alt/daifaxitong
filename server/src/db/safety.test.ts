import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { assertDatabaseHealthy, assertSnapshotsMatch, createPreMigrationBackup, inspectDatabase, inspectDatabaseFile } from "./safety.js";

test("database snapshots validate integrity, counts and transaction rollback", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "daifa-safety-"));
  const sourceFile = path.join(directory, "source.sqlite");
  const backupFile = path.join(directory, "backup.sqlite");
  const database = new Database(sourceFile);
  try {
    database.exec("CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL); INSERT INTO records (value) VALUES ('kept')");
    const failedWrite = database.transaction(() => {
      database.prepare("INSERT INTO records (value) VALUES (?)").run("rolled-back");
      throw new Error("stop");
    });
    assert.throws(() => failedWrite.immediate(), /stop/);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM records").get() as { count: number }).count, 1);

    const source = inspectDatabase(database);
    assertDatabaseHealthy(source, "source");
    const generatedBackup = createPreMigrationBackup(database, sourceFile, path.join(directory, "safety-backups"));
    fs.copyFileSync(generatedBackup, backupFile);
    const backup = inspectDatabaseFile(backupFile);
    assertSnapshotsMatch(source, backup);
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
