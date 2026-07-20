import path from "node:path";
import multer from "multer";
import { config } from "./config.js";

const excelExtensions = new Set([".xlsx", ".xls", ".csv"]);

export const excelUpload = multer({
  dest: config.uploadDir,
  limits: { files: 1, fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!excelExtensions.has(extension)) {
      callback(new Error("仅允许上传 .xlsx、.xls 或 .csv 文件"));
      return;
    }
    callback(null, true);
  }
});
