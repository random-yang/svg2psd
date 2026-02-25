/**
 * 批量渲染模块
 * 并发控制，内存管理
 */

import { renderElement } from "./renderer.mjs";

const DEFAULT_CONCURRENCY = 8;

/**
 * 批量渲染多个元素
 * @param {Array<{element: Element, name: string}>} items
 * @param {Element} svgRoot
 * @param {number} width
 * @param {number} height
 * @param {number} scale
 * @param {Object} [options]
 * @param {number} [options.concurrency=8]
 * @param {Function} [options.onProgress]
 * @returns {Promise<Map<Element, {data, width, height, top, left, right, bottom}|null>>}
 */
export async function batchRender(items, svgRoot, width, height, scale, options = {}) {
  const { concurrency = DEFAULT_CONCURRENCY, onProgress } = options;
  const results = new Map();
  let completed = 0;

  // 分批处理
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          const result = renderElement(item.element, svgRoot, width, height, scale);
          return { item, result };
        } catch (e) {
          console.error(`  警告: ${item.name} 渲染失败 - ${e.message}`);
          return { item, result: null };
        }
      })
    );

    for (const { item, result } of batchResults) {
      results.set(item.element, result);
      completed++;
      if (onProgress) onProgress(completed, items.length);
    }
  }

  return results;
}
