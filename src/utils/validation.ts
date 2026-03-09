import fs from "fs";
import path from "path";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export function validateInput(filePath: string | null | undefined): void {
  if (!filePath) {
    throw new Error("未指定输入文件");
  }

  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`文件不存在: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`不是文件: ${resolved}`);
  }

  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，限制 ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  if (stat.size === 0) {
    throw new Error("文件为空");
  }

  const ext = path.extname(resolved).toLowerCase();
  if (ext !== ".svg") {
    throw new Error(`不支持的文件格式: ${ext}，仅支持 .svg`);
  }
}
