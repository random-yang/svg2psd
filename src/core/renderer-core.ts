import type { Matrix, RenderResult, BBox } from "../types.js";

export function buildStandaloneSvg(
  element: Element,
  svgRoot: Element,
  transform: Matrix | null | undefined,
  serializeFn: (node: Node) => string,
): string {
  const clone = svgRoot.cloneNode(false) as Element;

  const children = svgRoot.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType !== 1) continue;
    const tag = ((c as Element).localName || c.nodeName || "").replace(/^.*:/, "");
    if (tag === "defs" || tag === "style") {
      clone.appendChild(c.cloneNode(true));
    }
  }

  const elClone = element.cloneNode(true) as Element;
  removeForeignObjects(elClone);

  if (transform && !isIdentity(transform)) {
    const [a, b, c, d, e, f] = transform;
    elClone.setAttribute("transform", `matrix(${a},${b},${c},${d},${e},${f})`);
  }

  clone.appendChild(elClone);

  return '<?xml version="1.0" encoding="UTF-8"?>\n' + serializeFn(clone);
}

export function processRenderResult(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): RenderResult | null {
  if (isCompletelyTransparent(pixels)) return null;

  const bbox = computeTightBBox(pixels, width, height);
  if (!bbox) return null;

  const cropW = bbox.right - bbox.left;
  const cropH = bbox.bottom - bbox.top;
  const cropped = new Uint8ClampedArray(cropW * cropH * 4);

  for (let y = 0; y < cropH; y++) {
    const srcOffset = ((bbox.top + y) * width + bbox.left) * 4;
    const dstOffset = y * cropW * 4;
    cropped.set(pixels.subarray(srcOffset, srcOffset + cropW * 4), dstOffset);
  }

  return {
    data: cropped,
    width: cropW,
    height: cropH,
    top: bbox.top,
    left: bbox.left,
    right: bbox.right,
    bottom: bbox.bottom,
  };
}

export function removeForeignObjects(node: Element): void {
  const toRemove: Element[] = [];
  const children = node.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType === 1) {
      const tag = ((c as Element).localName || c.nodeName || "").replace(/^.*:/, "");
      if (tag === "foreignObject") {
        toRemove.push(c as Element);
      } else {
        removeForeignObjects(c as Element);
      }
    }
  }
  toRemove.forEach((c) => node.removeChild(c));
}

export function isCompletelyTransparent(pixels: Uint8Array | Uint8ClampedArray): boolean {
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > 0) return false;
  }
  return true;
}

export function computeTightBBox(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): BBox | null {
  let top = height, left = width, bottom = 0, right = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (bottom < top) return null;

  top = Math.max(0, top);
  left = Math.max(0, left);
  bottom = Math.min(height, bottom + 1);
  right = Math.min(width, right + 1);

  return { top, left, bottom, right };
}

function isIdentity(m: Matrix): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}
