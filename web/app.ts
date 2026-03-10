import { parseSvgString } from "./platform/parser.js";
import { init as initRenderer, renderElement } from "./platform/renderer.js";
import { writePsdBlob, initPsdWriter } from "./platform/psd-writer.js";
import { convertSvg } from "../src/core/converter-core.js";
import { buildTextLayer } from "../src/psd/text-layer.js";

const dropZone = document.getElementById("dropZone")!;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const browseLink = document.getElementById("browseLink")!;
const scaleInput = document.getElementById("scaleInput") as HTMLInputElement;
const status = document.getElementById("status")!;
const progressFill = document.getElementById("progressFill")!;
const statusText = document.getElementById("statusText")!;
const downloadBtn = document.getElementById("downloadBtn")!;
const layerList = document.getElementById("layerList")!;
const layerItems = document.getElementById("layerItems")!;

let downloadUrl: string | null = null;
let downloadFilename = "output.psd";

async function initialize(): Promise<void> {
  showStatus("初始化 WASM 渲染器...");
  try {
    await initRenderer();
    initPsdWriter();
    hideStatus();
  } catch (e) {
    showError(`初始化失败: ${(e as Error).message}`);
  }
}

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
  const file = e.dataTransfer?.files[0];
  if (file) handleFile(file);
});

browseLink.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("click", (e) => {
  if (e.target === browseLink) return;
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
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

async function handleFile(file: File): Promise<void> {
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

    const blob = writePsdBlob(psd as Parameters<typeof writePsdBlob>[0]);

    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(blob);

    const psdObj = psd as { width: number; height: number };
    const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
    setStatusText(`完成! ${psdObj.width}×${psdObj.height}, ${layerCount} 个图层, ${sizeMB} MB`);
    showDownload();
    showLayerPreview((psd as { children?: PsdChild[] }).children || []);
  } catch (e) {
    showError((e as Error).message);
  }
}

interface PsdChild {
  name?: string;
  children?: PsdChild[];
  text?: unknown;
}

function showLayerPreview(children: PsdChild[], indent = 0): void {
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

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function showStatus(msg: string): void {
  status.classList.add("visible");
  statusText.classList.remove("error");
  statusText.textContent = msg;
  progressFill.style.width = "0%";
}

function hideStatus(): void {
  status.classList.remove("visible");
}

function showError(msg: string): void {
  status.classList.add("visible");
  statusText.classList.add("error");
  statusText.textContent = msg;
  progressFill.style.width = "0%";
}

function setProgress(pct: number): void {
  progressFill.style.width = `${pct}%`;
}

function setStatusText(msg: string): void {
  statusText.classList.remove("error");
  statusText.textContent = msg;
}

function showDownload(): void {
  downloadBtn.classList.add("visible");
}

function hideDownload(): void {
  downloadBtn.classList.remove("visible");
}

function hideLayerList(): void {
  layerList.classList.remove("visible");
}

initialize();
