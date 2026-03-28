import type { Psd } from "ag-psd";
import { initializeCanvas, writePsdUint8Array } from "ag-psd";

let initialized = false;

export function initPsdWriter(): void {
  if (initialized) return;
  initializeCanvas(
    (w: number, h: number) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    },
    (w: number, h: number) => new ImageData(w, h),
  );
  initialized = true;
}

export function writePsdBlob(psdDoc: Psd): Blob {
  initPsdWriter();
  const buffer = writePsdUint8Array(psdDoc, {
    invalidateTextLayers: true,
    generateThumbnail: true,
  });
  return new Blob([buffer], { type: "application/octet-stream" });
}
