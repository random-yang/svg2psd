import { renderElement } from "./renderer.js";
import type { RenderResult } from "../types.js";

const DEFAULT_CONCURRENCY = 8;

interface BatchItem {
  element: Element;
  name: string;
}

interface BatchRenderOptions {
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
}

export async function batchRender(
  items: BatchItem[],
  svgRoot: Element,
  width: number,
  height: number,
  scale: number,
  options: BatchRenderOptions = {},
): Promise<Map<Element, RenderResult | null>> {
  const { concurrency = DEFAULT_CONCURRENCY, onProgress } = options;
  const results = new Map<Element, RenderResult | null>();
  let completed = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          const result = renderElement(item.element, svgRoot, width, height, scale);
          return { item, result };
        } catch (e) {
          console.error(`  警告: ${item.name} 渲染失败 - ${(e as Error).message}`);
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
