import { describe, it } from "vitest";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import { parseSvg, parseSvgString } from "../../src/svg/parser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "..", "fixtures");

describe("parseSvg (file)", () => {
  it("从文件解析 simple.svg", () => {
    const result = parseSvg(path.join(fixturesDir, "simple.svg"));
    assert.ok(result.doc);
    assert.ok(result.svg);
    assert.strictEqual(result.width, 200);
    assert.strictEqual(result.height, 200);
  });
});

describe("parseSvgString", () => {
  it("正确提取 width/height", () => {
    const result = parseSvgString('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"></svg>');
    assert.strictEqual(result.width, 400);
    assert.strictEqual(result.height, 300);
  });

  it('正确解析 viewBox "0 0 800 600"', () => {
    const result = parseSvgString('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 800 600"></svg>');
    assert.deepStrictEqual(result.viewBox, { x: 0, y: 0, w: 800, h: 600 });
  });

  it("无 width/height 时从 viewBox 推断", () => {
    const result = parseSvgString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 768"></svg>');
    assert.strictEqual(result.width, 1024);
    assert.strictEqual(result.height, 768);
  });

  it("无 viewBox 时默认 800×600", () => {
    const result = parseSvgString('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    assert.strictEqual(result.width, 800);
    assert.strictEqual(result.height, 600);
    assert.strictEqual(result.viewBox, null);
  });

  it("无效 XML → 抛错", () => {
    assert.throws(() => parseSvgString("<not-valid<<>>"), /解析错误|无效/);
  });
});
