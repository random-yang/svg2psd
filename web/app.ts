// TS engine
import { parseSvgString as tsParseString } from "./platform/parser.js";
import { init as tsInitRenderer, renderElement as tsRenderElement } from "./platform/renderer.js";
import { writePsdBlob, initPsdWriter } from "./platform/psd-writer.js";
import { convertSvg as tsConvertSvg } from "../src/core/converter-core.js";
import { buildTextLayer as tsBuildTextLayer } from "../src/psd/text-layer.js";

// Rust engine
import * as rustEngine from "./engine-rust.js";

type Engine = "ts" | "rust";
let currentEngine: Engine = "ts";

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
const engineToggle = document.getElementById("engineToggle") as HTMLInputElement;
const engineLabel = document.getElementById("engineLabel")!;
const timingEl = document.getElementById("timing")!;

let downloadUrl: string | null = null;
let downloadFilename = "output.psd";

engineToggle.addEventListener("change", () => {
  currentEngine = engineToggle.checked ? "rust" : "ts";
  engineLabel.textContent = currentEngine === "rust" ? "Rust WASM" : "TypeScript";
  engineLabel.className = `engine-name ${currentEngine}`;
});

async function initialize(): Promise<void> {
  showStatus("初始化 WASM...");
  try {
    await tsInitRenderer();
    initPsdWriter();
    await rustEngine.initRustWasm();
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
  timingEl.textContent = "";

  try {
    showStatus("读取文件...");
    const text = await file.text();
    const scale = parseFloat(scaleInput.value) || 1;

    const t0 = performance.now();

    let psd: Record<string, unknown>;
    let layerCount: number;

    if (currentEngine === "rust") {
      showStatus("转换中 (Rust all-in-one)...");
      setProgress(50);
      const psdBytes = rustEngine.convertSvgToPsd(text, scale);
      setProgress(100);

      // 直接生成 Blob 下载，跳过 ag-psd JS 和 resvg-wasm
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadUrl = URL.createObjectURL(new Blob([psdBytes], { type: "application/octet-stream" }));

      const sizeMB = (psdBytes.byteLength / 1024 / 1024).toFixed(2);
      const elapsed = (performance.now() - t0).toFixed(0);
      setStatusText(`完成! ${sizeMB} MB`);
      timingEl.textContent = `Rust 耗时: ${elapsed} ms`;
      showDownload();
      // all-in-one 模式无法获取详细图层树，跳过预览
      return;
    } else {
      showStatus("解析 SVG (TS)...");
      const { svg, width, height, viewBox } = tsParseString(text);

      showStatus("转换中 (TS)...");
      const result = await tsConvertSvg(svg, width, height, viewBox, {
        scale,
        renderElement: tsRenderElement,
        buildTextLayer: (desc, svgRoot, w, h, s) => tsBuildTextLayer(desc, svgRoot, w, h, s),
        onProgress: (current, total) => {
          const pct = Math.round((current / total) * 100);
          setProgress(pct);
          setStatusText(`渲染图层 (TS): ${current}/${total}`);
        },
      });
      psd = result.psd;
      layerCount = result.layerCount;
    }

    const t1 = performance.now();
    const elapsed = (t1 - t0).toFixed(0);

    showStatus("生成 PSD 文件...");
    setProgress(100);

    const blob = writePsdBlob(psd as Parameters<typeof writePsdBlob>[0]);

    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(blob);

    const psdObj = psd as { width: number; height: number };
    const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
    setStatusText(`完成! ${psdObj.width}×${psdObj.height}, ${layerCount} 个图层, ${sizeMB} MB`);
    timingEl.textContent = `${currentEngine === "rust" ? "Rust" : "TS"} 耗时: ${elapsed} ms`;
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
