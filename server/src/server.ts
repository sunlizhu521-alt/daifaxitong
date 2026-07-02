import { config, validateConfig } from "./config.js";
import { createApp } from "./http.js";
import { getDb } from "./db/index.js";

getDb();
validateConfig();

createApp().listen(config.port, () => {
  console.log(`一件代发系统已启动：http://localhost:${config.port}`);
});
