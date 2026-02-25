import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import { parseSvgFromDocument, parseViewBox } from "../../src/core/parser-core.mjs";

describe("parseSvgFromDocument", () => {
  function makeDoc(svgStr) {
    return new DOMParser().parseFromString(svgStr, "image/svg+xml");
  }

  it("提取 width/height/viewBox", () => {
    const doc = makeDoc('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"></svg>');
    const result = parseSvgFromDocument(doc);
    assert.equal(result.width, 200);
    assert.equal(result.height, 100);
    assert.deepEqual(result.viewBox, { x: 0, y: 0, w: 200, h: 100 });
    assert.ok(result.svg);
    assert.ok(result.doc);
  });

  it("无 width/height 时从 viewBox 推断", () => {
    const doc = makeDoc('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"></svg>');
    const result = parseSvgFromDocument(doc);
    assert.equal(result.width, 400);
    assert.equal(result.height, 300);
  });

  it("无 width/height/viewBox 时使用默认值", () => {
    const doc = makeDoc('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const result = parseSvgFromDocument(doc);
    assert.equal(result.width, 800);
    assert.equal(result.height, 600);
    assert.equal(result.viewBox, null);
  });

  it("非 svg 根元素抛错", () => {
    const doc = makeDoc('<div xmlns="http://www.w3.org/1999/xhtml">hello</div>');
    assert.throws(() => parseSvgFromDocument(doc), /缺少 <svg> 根元素/);
  });
});

describe("parseViewBox", () => {
  it("正常解析", () => {
    assert.deepEqual(parseViewBox("0 0 100 200"), { x: 0, y: 0, w: 100, h: 200 });
  });

  it("逗号分隔", () => {
    assert.deepEqual(parseViewBox("10,20,300,400"), { x: 10, y: 20, w: 300, h: 400 });
  });

  it("null → null", () => {
    assert.equal(parseViewBox(null), null);
  });

  it("不完整 → null", () => {
    assert.equal(parseViewBox("0 0 100"), null);
  });

  it("含 NaN → null", () => {
    assert.equal(parseViewBox("0 0 abc 100"), null);
  });
});
