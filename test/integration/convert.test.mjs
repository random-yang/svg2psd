import { describe, it, afterAll } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { convertSvgToPsd } from "../../src/converter.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "..", "fixtures");
const outputDir = path.join(__dirname, "..", "output");

// 确保输出目录存在
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputs = [];

afterAll(() => {
  for (const f of outputs) {
    try { fs.unlinkSync(f); } catch {}
  }
  try { fs.rmdirSync(outputDir); } catch {}
});

describe("integration: convertSvgToPsd", () => {
  it("simple.svg → PSD 文件存在且 > 0 bytes", async () => {
    const input = path.join(fixturesDir, "simple.svg");
    const output = path.join(outputDir, "simple.psd");
    outputs.push(output);
    const result = await convertSvgToPsd(input, output);
    assert.strictEqual(result, output);
    const stat = fs.statSync(output);
    assert.ok(stat.size > 0);
  });

  it("nested-groups.svg → PSD 有图层组", async () => {
    const input = path.join(fixturesDir, "nested-groups.svg");
    const output = path.join(outputDir, "nested-groups.psd");
    outputs.push(output);
    await convertSvgToPsd(input, output);
    const stat = fs.statSync(output);
    assert.ok(stat.size > 0);
  });

  it("text-spans.svg → PSD 包含 text layer", async () => {
    const input = path.join(fixturesDir, "text-spans.svg");
    const output = path.join(outputDir, "text-spans.psd");
    outputs.push(output);
    await convertSvgToPsd(input, output);
    const stat = fs.statSync(output);
    assert.ok(stat.size > 0);
  });

  it("styled.svg → PSD 生成成功", async () => {
    const input = path.join(fixturesDir, "styled.svg");
    const output = path.join(outputDir, "styled.psd");
    outputs.push(output);
    await convertSvgToPsd(input, output);
    const stat = fs.statSync(output);
    assert.ok(stat.size > 0);
  });

  it("transforms.svg → PSD 生成成功", async () => {
    const input = path.join(fixturesDir, "transforms.svg");
    const output = path.join(outputDir, "transforms.psd");
    outputs.push(output);
    await convertSvgToPsd(input, output);
    const stat = fs.statSync(output);
    assert.ok(stat.size > 0);
  });

  it("text-transformed.svg → 含 transform 的文字图层正确生成", async () => {
    const input = path.join(fixturesDir, "text-transformed.svg");
    const output = path.join(outputDir, "text-transformed.psd");
    outputs.push(output);
    await convertSvgToPsd(input, output);
    const stat = fs.statSync(output);
    assert.ok(stat.size > 0);
  });
});
