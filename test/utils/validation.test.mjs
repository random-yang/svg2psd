import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { validateInput } from "../../src/utils/validation.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "..", "fixtures");

describe("validateInput", () => {
  const tmpEmpty = path.join(fixturesDir, "__empty_test.svg");
  const tmpTxt = path.join(fixturesDir, "__test.txt");

  before(() => {
    fs.writeFileSync(tmpEmpty, "");
    fs.writeFileSync(tmpTxt, "hello");
  });

  after(() => {
    try { fs.unlinkSync(tmpEmpty); } catch {}
    try { fs.unlinkSync(tmpTxt); } catch {}
  });

  it("有效 .svg 文件不抛异常", () => {
    assert.doesNotThrow(() => validateInput(path.join(fixturesDir, "simple.svg")));
  });

  it("文件不存在 → 抛错", () => {
    assert.throws(() => validateInput("/no/such/file.svg"), /文件不存在/);
  });

  it("非 .svg 扩展名 → 抛错", () => {
    assert.throws(() => validateInput(tmpTxt), /不支持的文件格式/);
  });

  it("空文件 → 抛错", () => {
    assert.throws(() => validateInput(tmpEmpty), /文件为空/);
  });

  it("null → 抛错", () => {
    assert.throws(() => validateInput(null), /未指定/);
  });

  it("空字符串 → 抛错", () => {
    assert.throws(() => validateInput(""), /未指定/);
  });
});
