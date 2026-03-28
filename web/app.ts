import type { Layer } from "ag-psd";
import { parseSvgString } from "./platform/parser.js";
import { init as initRenderer, renderElement } from "./platform/renderer.js";
import { writePsdBlob, initPsdWriter } from "./platform/psd-writer.js";
import { convertSvg } from "../src/core/converter-core.js";
import { buildTextLayer } from "../src/psd/text-layer.js";

// ── State ──
let downloadUrl: string | null = null;
let downloadFilename = "output.psd";
let pendingSvgText: string | null = null;
let pendingFile: File | null = null;
let isConverting = false;

interface HistoryEntry {
  name: string;
  size: string;
  url: string;
  filename: string;
}
const history: HistoryEntry[] = [];

// ── DOM ──
const dropZone = document.getElementById("dropZone")!;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const browseLink = document.getElementById("browseLink")!;
const scaleInput = document.getElementById("scaleInput") as HTMLInputElement;
const centerPanel = document.getElementById("centerPanel")!;
const previewArea = document.getElementById("previewArea")!;
const fileNameEl = document.getElementById("fileName")!;
const fileDimsEl = document.getElementById("fileDims")!;
const fileSizeEl = document.getElementById("fileSize")!;
const previewCanvas = document.getElementById("previewCanvas")!;
const dimBadge = document.getElementById("dimBadge")!;
const changeFileBtn = document.getElementById("changeFileBtn")!;
const convertBtn = document.getElementById("convertBtn")!;
const conversionStatus = document.getElementById("conversionStatus")!;
const progressBar = document.getElementById("progressBar")!;
const statusMsg = document.getElementById("statusMsg")!;
const statusTime = document.getElementById("statusTime")!;
const resultArea = document.getElementById("resultArea")!;
const resultName = document.getElementById("resultName")!;
const resultMeta = document.getElementById("resultMeta")!;
const downloadBtn = document.getElementById("downloadBtn")!;
const placeholder = document.getElementById("placeholder")!;
const layerTree = document.getElementById("layerTree")!;
const layerCount = document.getElementById("layerCount")!;
const historyHead = document.getElementById("historyHead")!;
const historyChevron = document.getElementById("historyChevron")!;
const historyItems = document.getElementById("historyItems")!;

// ── Init ──
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

// ── Drag & Drop ──
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
  if (file) loadFile(file);
});

browseLink.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  fileInput.click();
});

dropZone.addEventListener("click", (e) => {
  if (e.target === browseLink) return;
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) loadFile(file);
  fileInput.value = "";
});

changeFileBtn.addEventListener("click", () => fileInput.click());

convertBtn.addEventListener("click", () => {
  if (pendingSvgText && pendingFile) {
    handleConvert(pendingFile, pendingSvgText);
  }
});

downloadBtn.addEventListener("click", () => {
  if (!downloadUrl) return;
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = downloadFilename;
  a.click();
});

// ── History Toggle ──
let historyOpen = false;
historyHead.addEventListener("click", () => {
  historyOpen = !historyOpen;
  historyChevron.classList.toggle("open", historyOpen);
  historyItems.classList.toggle("visible", historyOpen);
});

// ── Load File → Preview ──
async function loadFile(file: File): Promise<void> {
  if (!file.name.toLowerCase().endsWith(".svg")) {
    showError("请选择 .svg 文件");
    return;
  }

  pendingFile = file;
  const text = await file.text();
  pendingSvgText = text;

  // Parse dimensions
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  let w = 0, h = 0;
  if (svgEl) {
    const vb = svgEl.getAttribute("viewBox");
    if (vb) {
      const parts = vb.split(/[\s,]+/).map(Number);
      w = parts[2] || 0;
      h = parts[3] || 0;
    }
    if (!w) w = parseFloat(svgEl.getAttribute("width") || "0");
    if (!h) h = parseFloat(svgEl.getAttribute("height") || "0");
  }

  fileNameEl.textContent = file.name;
  fileDimsEl.textContent = w && h ? `${Math.round(w)} × ${Math.round(h)}` : "—";
  fileSizeEl.textContent = formatBytes(file.size);
  dimBadge.textContent = w && h ? `${Math.round(w)}×${Math.round(h)}` : "";

  // SVG preview image
  const old = previewCanvas.querySelector(".svg-img");
  if (old) old.remove();
  const blob = new Blob([text], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const img = document.createElement("img");
  img.className = "svg-img";
  img.src = url;
  img.alt = file.name;
  previewCanvas.appendChild(img);

  // Show preview, hide drop zone
  dropZone.style.display = "none";
  previewArea.classList.add("visible");
  centerPanel.classList.add("has-preview");
  resultArea.classList.remove("visible");
  hideStatus();
}

// ── Convert ──
async function handleConvert(file: File, text: string): Promise<void> {
  if (isConverting) return;
  isConverting = true;
  convertBtn.textContent = "转换中...";
  convertBtn.style.pointerEvents = "none";
  downloadFilename = file.name.replace(/\.svg$/i, ".psd");

  resultArea.classList.remove("visible");
  clearLayers();

  try {
    const scale = parseFloat(scaleInput.value) || 1;
    const t0 = performance.now();

    showStatus("解析 SVG...");
    const { svg, width, height, viewBox } = parseSvgString(text);

    showStatus("转换图层...");
    const { psd, layerCount: count } = await convertSvg(svg, width, height, viewBox, {
      scale,
      renderElement,
      buildTextLayer: (desc, svgRoot, w, h, s) => buildTextLayer(desc, svgRoot, w, h, s),
      onProgress: (current, total) => {
        const pct = Math.round((current / total) * 100);
        setProgress(pct);
        statusMsg.textContent = `渲染图层 ${current}/${total}`;
      },
    });

    showStatus("生成 PSD...");
    setProgress(100);

    const psdBlob = writePsdBlob(psd);

    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(psdBlob);

    const elapsed = (performance.now() - t0).toFixed(0);
    const sizeMB = (psdBlob.size / 1024 / 1024).toFixed(2);

    progressBar.style.width = "100%";
    progressBar.classList.add("done");
    statusMsg.textContent = `${psd.width}×${psd.height} · ${count} 图层`;
    statusTime.textContent = `${elapsed}ms`;

    showResult(downloadFilename, `${sizeMB} MB · ${count} 图层`);
    showLayerPreview(psd.children || []);
    addHistory(downloadFilename, sizeMB);
  } catch (e) {
    showError((e as Error).message);
  } finally {
    isConverting = false;
    convertBtn.textContent = "转换";
    convertBtn.style.pointerEvents = "";
  }
}

// ── Layer Tree ──
function showLayerPreview(children: Layer[]): void {
  layerTree.innerHTML = "";
  placeholder.style.display = "none";

  let total = 0;
  function count(items: Layer[]) {
    for (const c of items) { total++; if (c.children) count(c.children); }
  }
  count(children);
  layerCount.textContent = String(total);

  buildNodes(children, layerTree, 0);
}

function buildNodes(children: Layer[], container: HTMLElement, depth: number): void {
  for (const child of children) {
    const isGroup = !!child.children;
    const isText = !!child.text;
    const type = isGroup ? "group" : isText ? "text" : "graphic";

    const row = document.createElement("div");
    row.className = "layer-row";

    if (depth > 0) {
      const indent = document.createElement("span");
      indent.className = "layer-indent";
      indent.style.width = `${depth * 14}px`;
      row.appendChild(indent);
    }

    if (isGroup) {
      const toggle = document.createElement("span");
      toggle.className = "layer-toggle";
      toggle.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`;
      row.appendChild(toggle);

      const childBox = document.createElement("div");
      childBox.className = "layer-children";

      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        toggle.classList.toggle("collapsed");
        childBox.classList.toggle("collapsed");
      });

      row.appendChild(layerIcon(type));
      row.appendChild(layerName(child.name || "Group"));

      const node = document.createElement("div");
      node.appendChild(row);
      node.appendChild(childBox);
      container.appendChild(node);
      buildNodes(child.children!, childBox, depth + 1);
    } else {
      const spacer = document.createElement("span");
      spacer.className = "layer-spacer";
      row.appendChild(spacer);
      row.appendChild(layerIcon(type));
      row.appendChild(layerName(child.name || "unnamed"));
      container.appendChild(row);
    }
  }
}

function layerIcon(type: string): HTMLElement {
  const el = document.createElement("span");
  el.className = `layer-icon ${type}`;
  if (type === "group") {
    el.innerHTML = `<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`;
  } else if (type === "text") {
    el.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9.5" y1="20" x2="14.5" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`;
  } else {
    el.innerHTML = `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
  }
  return el;
}

function layerName(name: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "layer-name";
  el.textContent = name;
  return el;
}

function clearLayers(): void {
  layerTree.innerHTML = "";
  placeholder.style.display = "";
  layerCount.textContent = "0";
}

// ── History ──
function addHistory(name: string, size: string): void {
  if (!downloadUrl) return;
  history.unshift({ name, size: `${size} MB`, url: downloadUrl, filename: downloadFilename });
  renderHistory();
}

function renderHistory(): void {
  historyItems.innerHTML = "";
  for (const entry of history) {
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML = `
      <span class="history-dot"></span>
      <span class="history-name">${esc(entry.name)}</span>
      <span class="history-size">${esc(entry.size)}</span>
    `;
    row.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = entry.url;
      a.download = entry.filename;
      a.click();
    });
    historyItems.appendChild(row);
  }
}

// ── Status Helpers ──
function showStatus(msg: string): void {
  conversionStatus.classList.add("visible");
  statusMsg.classList.remove("error");
  statusMsg.textContent = msg;
  progressBar.style.width = "0%";
  progressBar.classList.remove("done");
}

function hideStatus(): void {
  conversionStatus.classList.remove("visible");
}

function showError(msg: string): void {
  conversionStatus.classList.add("visible");
  statusMsg.classList.add("error");
  statusMsg.textContent = msg;
  progressBar.style.width = "0%";
  progressBar.classList.remove("done");
}

function setProgress(pct: number): void {
  progressBar.style.width = `${pct}%`;
}

function showResult(name: string, meta: string): void {
  resultArea.classList.add("visible");
  resultName.textContent = name;
  resultMeta.textContent = meta;
}

// ── Utils ──
function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

initialize();
