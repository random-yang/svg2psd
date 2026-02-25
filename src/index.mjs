#!/usr/bin/env node
/**
 * SVG to PSD 转换工具 CLI 入口
 *
 * Usage: node src/index.mjs <input.svg> [-o output.psd] [-s scale]
 */

import { convertSvgToPsd } from "./converter.mjs";

function printUsage() {
  console.log("用法: node src/index.mjs <input.svg> [options]");
  console.log("选项:");
  console.log("  -o, --output <path>   输出 PSD 路径");
  console.log("  -s, --scale <n>       缩放倍数 (默认: 1)");
  console.log("  -h, --help            显示帮助");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  let inputs = [];
  let output = null;
  let scale = 1;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o" || args[i] === "--output") {
      output = args[++i];
    } else if (args[i] === "-s" || args[i] === "--scale") {
      scale = parseFloat(args[++i]);
    } else {
      inputs.push(args[i]);
    }
  }

  if (inputs.length === 0) {
    console.error("错误: 请指定输入 SVG 文件");
    process.exit(1);
  }

  if (output && inputs.length > 1) {
    console.error("错误: 多文件模式下不支持 -o 参数");
    process.exit(1);
  }

  for (const input of inputs) {
    try {
      await convertSvgToPsd(input, output, { scale });
    } catch (e) {
      console.error(`错误: ${e.message}`);
      process.exitCode = 1;
    }
  }
}

main();
