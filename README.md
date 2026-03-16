# svg2psd

将 SVG 转换为分层 PSD（Photoshop）文件。`<g>` 映射为图层组，图形元素保留为独立图层，`<text>` 转为可编辑文字图层。

支持 CLI 和浏览器 Web App 两种使用方式。

## 使用

```bash
pnpm install

# CLI
pnpm start input.svg -o output.psd -s 2

# Web App
pnpm dev
```

## 支持的 SVG 特性

**图形元素** — `<rect>` `<circle>` `<ellipse>` `<line>` `<polyline>` `<polygon>` `<path>` `<image>` `<use>`

**文字** — `<text>` 及 `<tspan>` 多段样式（字体、字号、字重、颜色）、letter-spacing、line-height、text-anchor 对齐；`<foreignObject>` HTML 文本提取

**变换** — translate / scale / rotate / skewX / skewY / matrix，支持链式与嵌套累积

**样式** — inline style > 属性 > CSS 类/ID/元素选择器（含后代、子代组合器及优先级计算）> 继承

**图层** — `<g>` 嵌套层级、opacity、mix-blend-mode（multiply / screen / overlay 等 16 种）、visibility / display 隐藏

## 不支持

- 渐变填充（linearGradient / radialGradient）
- SVG 滤镜（blur、drop-shadow 等）
- 裁剪路径（clipPath）与蒙版（mask）
- 图案填充（pattern）
- 描边细节属性（dasharray、linecap、linejoin）
- 文字装饰（underline、strikethrough）与沿路径排列
- 动画（SMIL）

## 测试

```bash
pnpm test
```
