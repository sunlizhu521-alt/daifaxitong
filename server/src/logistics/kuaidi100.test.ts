import test from "node:test";
import assert from "node:assert/strict";
import { withLogisticsDeadline } from "./kuaidi100.js";

test("logistics lookup deadline does not block list responses", async () => {
  const startedAt = Date.now();
  const result = await withLogisticsDeadline(new Promise<string>((resolve) => setTimeout(() => resolve("late"), 200)), 20);
  assert.equal(result, null);
  assert.ok(Date.now() - startedAt < 150);
});
