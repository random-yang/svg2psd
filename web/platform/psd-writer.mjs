/**
 * 浏览器端 PSD 写入适配
 * 使用 ag-psd 浏览器版 + 真实 Canvas
 */

import { initializeCanvas, writePsdUint8Array } from "ag-psd";

let initialized = false;

/**
 * 初始化 ag-psd 的 Canvas 支持（浏览器用真实 Canvas）
 */
export function initPsdWriter() {
  if (initialized) return;
  initializeCanvas(
    (w, h) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    },
    (w, h) => new ImageData(w, h)
  );
  initialized = true;
}

/**
 * 将 ag-psd 文档对象写入 Blob
 * @param {Object} psdDoc - ag-psd 文档对象
 * @returns {Blob}
 */
export function writePsdBlob(psdDoc) {
  initPsdWriter();
  const buffer = writePsdUint8Array(psdDoc, {
    invalidateTextLayers: true,
    generateThumbnail: true,
  });
  return new Blob([buffer], { type: "application/octet-stream" });
}
