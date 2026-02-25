#!/usr/bin/env python3
"""SVG to PSD converter CLI tool - each SVG element becomes a separate PSD layer."""

import argparse
import copy
import io
import os
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

# Ensure Homebrew cairo is discoverable
if sys.platform == "darwin":
    os.environ.setdefault("DYLD_FALLBACK_LIBRARY_PATH", "/opt/homebrew/lib:/usr/local/lib")

import cairosvg
import numpy as np
from PIL import Image
from psd_tools import PSDImage
from psd_tools.constants import Compression

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)


def get_svg_canvas(root):
    """Get canvas width/height from SVG root."""
    w = int(float(root.get("width", 1920)))
    h = int(float(root.get("height", 1080)))
    return w, h


def collect_elements(root):
    """Collect renderable child elements from SVG, skipping <defs>."""
    ns = "{%s}" % SVG_NS
    elements = []
    # Find the main content group (usually first <g>), or use direct children
    top_children = list(root)
    for child in top_children:
        tag = child.tag.replace(ns, "")
        if tag == "defs":
            continue
        if tag == "g":
            # Unpack one level of wrapper groups to get actual content
            inner = list(child)
            for item in inner:
                itag = item.tag.replace(ns, "")
                if itag == "defs":
                    continue
                # If it's a group with filter/clip, look inside
                if itag == "g":
                    for sub in list(item):
                        stag = sub.tag.replace(ns, "")
                        if stag != "defs":
                            elements.append(sub)
                else:
                    elements.append(item)
        else:
            elements.append(child)
    return elements


def guess_layer_name(elem, index):
    """Try to generate a meaningful layer name."""
    ns = "{%s}" % SVG_NS
    tag = elem.tag.replace(ns, "")
    elem_id = elem.get("id", "")
    if elem_id:
        return elem_id

    fill = elem.get("fill", "") or elem.get("style", "")
    if "url(#pattern" in fill or tag == "image":
        return "Image_%d" % index
    if tag == "rect":
        return "Rect_%d" % index
    if tag == "circle" or tag == "ellipse":
        return "Shape_%d" % index

    # For paths, try to identify by fill color or position
    d = elem.get("d", "")
    if d:
        # Very rough heuristic: long path = likely text outline
        if len(d) > 500:
            return "Text_%d" % index
        return "Path_%d" % index

    return "%s_%d" % (tag, index)


def render_element_to_image(svg_root, elem, canvas_w, canvas_h, scale, dpi):
    """Render a single SVG element by creating a temporary SVG with only that element."""
    # Deep copy the root to preserve defs (filters, patterns, clipPaths, images)
    new_root = copy.deepcopy(svg_root)
    ns = "{%s}" % SVG_NS

    # Find and remove all non-defs children, then add our element
    defs_elems = []
    to_remove = []
    for child in list(new_root):
        tag = child.tag.replace(ns, "")
        if tag == "defs":
            defs_elems.append(child)
        else:
            to_remove.append(child)
    for child in to_remove:
        new_root.remove(child)

    # Add the element directly (no wrapper group, no clip/filter that might hide it)
    new_elem = copy.deepcopy(elem)
    new_root.append(new_elem)

    svg_bytes = ET.tostring(new_root, encoding="unicode")
    # Ensure XML declaration
    svg_str = '<?xml version="1.0" encoding="UTF-8"?>\n' + svg_bytes

    try:
        png_data = cairosvg.svg2png(
            bytestring=svg_str.encode("utf-8"),
            output_width=int(canvas_w * scale),
            output_height=int(canvas_h * scale),
            dpi=dpi,
        )
        img = Image.open(io.BytesIO(png_data)).convert("RGBA")
        # Check if the layer has any visible content
        arr = np.array(img)
        if arr[:, :, 3].max() == 0:
            return None
        return img
    except Exception as e:
        print(f"  警告: 渲染元素失败 - {e}", file=sys.stderr)
        return None


def svg_to_psd(svg_path, output_path=None, scale=1.0, dpi=300):
    svg_path = Path(svg_path)
    if not svg_path.exists():
        print(f"错误: 文件不存在 - {svg_path}", file=sys.stderr)
        sys.exit(1)

    if output_path is None:
        output_path = svg_path.with_suffix(".psd")
    else:
        output_path = Path(output_path)

    # Parse SVG
    tree = ET.parse(str(svg_path))
    root = tree.getroot()
    canvas_w, canvas_h = get_svg_canvas(root)

    # Collect elements
    elements = collect_elements(root)
    if not elements:
        print(f"警告: SVG 中没有找到可渲染的元素", file=sys.stderr)
        return

    psd_w = int(canvas_w * scale)
    psd_h = int(canvas_h * scale)
    print(f"解析: {svg_path} ({canvas_w}x{canvas_h}), 发现 {len(elements)} 个元素")

    # Create PSD
    psd = PSDImage.new("RGBA", (psd_w, psd_h))

    layer_count = 0
    for i, elem in enumerate(elements):
        name = guess_layer_name(elem, i)
        img = render_element_to_image(root, elem, canvas_w, canvas_h, scale, dpi)
        if img is None:
            print(f"  跳过: {name} (空白)")
            continue

        psd.create_pixel_layer(
            image=img,
            name=name,
            compression=Compression.RLE,
        )
        layer_count += 1
        print(f"  图层: {name}")

    psd.save(str(output_path))
    print(f"完成: {output_path} ({psd_w}x{psd_h}, {layer_count} 个图层)")


def main():
    parser = argparse.ArgumentParser(description="SVG 转 PSD 工具（保留图层）")
    parser.add_argument("input", nargs="+", help="输入的 SVG 文件路径（支持多个）")
    parser.add_argument("-o", "--output", help="输出 PSD 路径（仅单文件时有效）")
    parser.add_argument("-s", "--scale", type=float, default=1.0, help="缩放倍数 (默认: 1.0)")
    parser.add_argument("--dpi", type=int, default=300, help="渲染 DPI (默认: 300)")

    args = parser.parse_args()

    if args.output and len(args.input) > 1:
        print("错误: 多文件模式下不支持 -o 参数", file=sys.stderr)
        sys.exit(1)

    for svg_file in args.input:
        svg_to_psd(svg_file, args.output, args.scale, args.dpi)


if __name__ == "__main__":
    main()
