/**
 * 渲染核心逻辑（平台无关）
 * 纯函数：SVG 构建、透明检测、边界框计算、像素裁剪
 */

/**
 * 构建只包含指定元素的完整 SVG 字符串
 * 保留原始 SVG 的 defs、style 和 viewBox
 * @param {Element} element
 * @param {Element} svgRoot
 * @param {number[]} [transform] - 累积变换矩阵 [a,b,c,d,e,f]
 * @param {function} serializeFn - 序列化函数 (node) => string
 */
export function buildStandaloneSvg(element, svgRoot, transform, serializeFn) {
  const clone = svgRoot.cloneNode(false); // 浅克隆 <svg> 属性

  // 复制 <defs> 和 <style>
  const children = svgRoot.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType !== 1) continue;
    const tag = (c.localName || c.nodeName || "").replace(/^.*:/, "");
    if (tag === "defs" || tag === "style") {
      clone.appendChild(c.cloneNode(true));
    }
  }

  // 克隆目标元素，移除 foreignObject（文字单独处理）
  const elClone = element.cloneNode(true);
  removeForeignObjects(elClone);

  // 将累积变换矩阵应用到克隆元素上
  if (transform && !isIdentity(transform)) {
    const [a, b, c, d, e, f] = transform;
    elClone.setAttribute("transform", `matrix(${a},${b},${c},${d},${e},${f})`);
  }

  clone.appendChild(elClone);

  return '<?xml version="1.0" encoding="UTF-8"?>\n' + serializeFn(clone);
}

/**
 * 处理渲染结果：透明检测 + bbox 裁剪
 * @param {Uint8Array} pixels - RGBA 像素数据
 * @param {number} width - 渲染宽度
 * @param {number} height - 渲染高度
 * @returns {{ data: Uint8ClampedArray, width: number, height: number, top: number, left: number, right: number, bottom: number } | null}
 */
export function processRenderResult(pixels, width, height) {
  if (isCompletelyTransparent(pixels)) return null;

  const bbox = computeTightBBox(pixels, width, height);
  if (!bbox) return null;

  // 裁剪到紧凑区域
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

export function removeForeignObjects(node) {
  const toRemove = [];
  const children = node.childNodes || [];
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType === 1) {
      const tag = (c.localName || c.nodeName || "").replace(/^.*:/, "");
      if (tag === "foreignObject") {
        toRemove.push(c);
      } else {
        removeForeignObjects(c);
      }
    }
  }
  toRemove.forEach((c) => node.removeChild(c));
}

export function isCompletelyTransparent(pixels) {
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > 0) return false;
  }
  return true;
}

/**
 * 计算像素数据的紧凑边界框（非透明区域）
 */
export function computeTightBBox(pixels, width, height) {
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

  if (bottom < top) return null; // 全透明

  // 扩展 1px padding
  top = Math.max(0, top);
  left = Math.max(0, left);
  bottom = Math.min(height, bottom + 1);
  right = Math.min(width, right + 1);

  return { top, left, bottom, right };
}

function isIdentity(m) {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}
