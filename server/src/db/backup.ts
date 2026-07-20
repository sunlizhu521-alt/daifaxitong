import { createBackup } from "../backup.js";

const metadata = await createBackup("manual");
console.log(`数据库已完成校验备份：${metadata.generation}`);
