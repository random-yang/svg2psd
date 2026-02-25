/**
 * Web App 主逻辑
 * 拖放上传 SVG → 转换 → 下载 PSD
 */

import { parseSvgString } from "./platform/parser.mjs";
import { init as initRenderer, renderElement } from "./platform/renderer.mjs";
import { writePsdBlob, initPsdWriter } from "./platform/psd-writer.mjs";
import { convertSvg } from "../src/core/converter-core.mjs";
import { buildTextLayer } from "../src/psd/text-layer.mjs";

// DOM 元素
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const browseLink = document.getElementById("browseLink");
const scaleInput = document.getElementById("scaleInput");
const status = document.getElementById("status");
const progressFill = document.getElementById("progressFill");
const statusText = document.getElementById("statusText");
const downloadBtn = document.getElementById("downloadBtn");
const layerList = document.getElementById("layerList");
const layerItems = document.getElementById("layerItems");

let downloadUrl = null;
let downloadFilename = "output.psd";

// 初始化
async function initialize() {
  showStatus("初始化 WASM 渲染器...");
  try {
    await initRenderer();
    initPsdWriter();
    hideStatus();
  } catch (e) {
    showError(`初始化失败: ${e.message}`);
  }
}

// 拖放事件
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

browseLink.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("click", (e) => {
  if (e.target === browseLink) return;
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) handleFile(file);
  fileInput.value = "";
});

downloadBtn.addEventListener("click", () => {
  if (!downloadUrl) return;
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = downloadFilename;
  a.click();
});

// 处理文件
async function handleFile(file) {
  if (!file.name.toLowerCase().endsWith(".svg")) {
    showError("请选择 .svg 文件");
    return;
  }

  downloadFilename = file.name.replace(/\.svg$/i, ".psd");
  hideDownload();
  hideLayerList();

  try {
    showStatus("读取文件...");
    const text = await file.text();

    showStatus("解析 SVG...");
    const { svg, width, height, viewBox } = parseSvgString(text);

    const scale = parseFloat(scaleInput.value) || 1;

    showStatus("转换中...");
    const { psd, layerCount } = await convertSvg(svg, width, height, viewBox, {
      scale,
      renderElement,
      buildTextLayer: (desc, svgRoot, w, h, s) => buildTextLayer(desc, svgRoot, w, h, s),
      onProgress: (current, total) => {
        const pct = Math.round((current / total) * 100);
        setProgress(pct);
        setStatusText(`渲染图层: ${current}/${total}`);
      },
    });

    showStatus("生成 PSD 文件...");
    setProgress(100);

    const blob = writePsdBlob(psd);

    // 释放之前的 URL
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(blob);

    const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
    setStatusText(`完成! ${psd.width}×${psd.height}, ${layerCount} 个图层, ${sizeMB} MB`);
    showDownload();
    showLayerPreview(psd.children || []);
  } catch (e) {
    showError(e.message);
  }
}

// 图层预览
function showLayerPreview(children, indent = 0) {
  if (indent === 0) layerItems.innerHTML = "";
  for (const child of children) {
    const div = document.createElement("div");
    div.className = "layer-item";
    div.style.paddingLeft = `${0.75 + indent * 1.2}rem`;

    const type = child.children ? "group" : child.text ? "text" : "graphic";
    div.innerHTML = `<span class="layer-type ${type}">${type}</span> ${escapeHtml(child.name || "unnamed")}`;
    layerItems.appendChild(div);

    if (child.children) {
      showLayerPreview(child.children, indent + 1);
    }
  }
  if (indent === 0) {
    layerList.classList.add("visible");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// UI 辅助函数
function showStatus(msg) {
  status.classList.add("visible");
  statusText.classList.remove("error");
  statusText.textContent = msg;
  progressFill.style.width = "0%";
}

function hideStatus() {
  status.classList.remove("visible");
}

function showError(msg) {
  status.classList.add("visible");
  statusText.classList.add("error");
  statusText.textContent = msg;
  progressFill.style.width = "0%";
}

function setProgress(pct) {
  progressFill.style.width = `${pct}%`;
}

function setStatusText(msg) {
  statusText.classList.remove("error");
  statusText.textContent = msg;
}

function showDownload() {
  downloadBtn.classList.add("visible");
}

function hideDownload() {
  downloadBtn.classList.remove("visible");
}

function hideLayerList() {
  layerList.classList.remove("visible");
}

// 启动
initialize();
