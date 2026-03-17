use crate::types::{Matrix, RenderResult, BBox};
use crate::svg::transforms::is_identity;

pub fn build_standalone_svg(
    element_xml: &str,
    svg_root_xml: &str,
    transform: Option<&Matrix>,
) -> String {
    let mut result = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");

    if let Ok(doc) = roxmltree::Document::parse(svg_root_xml) {
        let root = doc.root_element();
        result.push_str("<svg");
        for attr in root.attributes() {
            result.push_str(&format!(" {}=\"{}\"", attr.name(), attr.value()));
        }
        result.push('>');

        for child in root.children() {
            if child.is_element() {
                let tag = child.tag_name().name();
                if tag == "defs" || tag == "style" {
                    result.push_str(&serialize_node(child, svg_root_xml));
                }
            }
        }
    } else {
        result.push_str(svg_root_xml);
        return result;
    }

    if let Some(m) = transform {
        if !is_identity(m) {
            let [a, b, c, d, e, f] = m;
            result.push_str(&format!(
                "<g transform=\"matrix({},{},{},{},{},{})\">{}</g>",
                a, b, c, d, e, f, element_xml
            ));
        } else {
            result.push_str(element_xml);
        }
    } else {
        result.push_str(element_xml);
    }

    result.push_str("</svg>");
    result
}

fn serialize_node(node: roxmltree::Node, original_xml: &str) -> String {
    let range = node.range();
    if !range.is_empty() && range.end <= original_xml.len() {
        return original_xml[range].to_string();
    }
    // Fallback: manual serialization
    let mut s = String::new();
    s.push('<');
    s.push_str(node.tag_name().name());
    for attr in node.attributes() {
        s.push_str(&format!(" {}=\"{}\"", attr.name(), attr.value()));
    }
    if node.has_children() {
        s.push('>');
        for child in node.children() {
            if child.is_text() {
                s.push_str(child.text().unwrap_or(""));
            } else if child.is_element() {
                s.push_str(&serialize_node(child, original_xml));
            }
        }
        s.push_str(&format!("</{}>", node.tag_name().name()));
    } else {
        s.push_str("/>");
    }
    s
}

pub fn process_render_result(
    pixels: &[u8],
    width: u32,
    height: u32,
) -> Option<RenderResult> {
    if is_completely_transparent(pixels) {
        return None;
    }

    let bbox = compute_tight_bbox(pixels, width, height)?;

    let crop_w = bbox.right - bbox.left;
    let crop_h = bbox.bottom - bbox.top;
    let mut cropped = vec![0u8; (crop_w * crop_h * 4) as usize];

    for y in 0..crop_h {
        let src_offset = (((bbox.top + y) * width + bbox.left) * 4) as usize;
        let dst_offset = (y * crop_w * 4) as usize;
        let len = (crop_w * 4) as usize;
        cropped[dst_offset..dst_offset + len].copy_from_slice(&pixels[src_offset..src_offset + len]);
    }

    Some(RenderResult {
        data: cropped,
        width: crop_w,
        height: crop_h,
        top: bbox.top,
        left: bbox.left,
        right: bbox.right,
        bottom: bbox.bottom,
    })
}

pub fn is_completely_transparent(pixels: &[u8]) -> bool {
    for i in (3..pixels.len()).step_by(4) {
        if pixels[i] > 0 {
            return false;
        }
    }
    true
}

pub fn compute_tight_bbox(pixels: &[u8], width: u32, height: u32) -> Option<BBox> {
    let mut top = height;
    let mut left = width;
    let mut bottom: u32 = 0;
    let mut right: u32 = 0;

    for y in 0..height {
        for x in 0..width {
            let alpha = pixels[((y * width + x) * 4 + 3) as usize];
            if alpha > 0 {
                if y < top { top = y; }
                if y > bottom { bottom = y; }
                if x < left { left = x; }
                if x > right { right = x; }
            }
        }
    }

    if bottom < top {
        return None;
    }

    top = top.max(0);
    left = left.max(0);
    bottom = (bottom + 1).min(height);
    right = (right + 1).min(width);

    Some(BBox { top, left, bottom, right })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transparent_returns_none() {
        let pixels = vec![0u8; 100 * 4];
        assert!(process_render_result(&pixels, 10, 10).is_none());
    }

    #[test]
    fn crops_to_non_transparent() {
        let w: u32 = 10;
        let h: u32 = 10;
        let mut pixels = vec![0u8; (w * h * 4) as usize];
        let idx = ((3 * w + 2) * 4) as usize;
        pixels[idx] = 255;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 255;

        let result = process_render_result(&pixels, w, h).unwrap();
        assert!(result.width > 0);
        assert!(result.height > 0);
        assert!(result.left <= 2);
        assert!(result.top <= 3);
    }

    #[test]
    fn completely_transparent_true() {
        assert!(is_completely_transparent(&vec![0u8; 40]));
    }

    #[test]
    fn not_completely_transparent() {
        let mut p = vec![0u8; 40];
        p[3] = 1;
        assert!(!is_completely_transparent(&p));
    }

    #[test]
    fn bbox_transparent_none() {
        assert!(compute_tight_bbox(&vec![0u8; 100 * 4], 10, 10).is_none());
    }

    #[test]
    fn bbox_correct() {
        let w: u32 = 10;
        let h: u32 = 10;
        let mut pixels = vec![0u8; (w * h * 4) as usize];
        pixels[((5 * w + 5) * 4 + 3) as usize] = 255;
        let bbox = compute_tight_bbox(&pixels, w, h).unwrap();
        assert!(bbox.left <= 5);
        assert!(bbox.top <= 5);
        assert!(bbox.right > 5);
        assert!(bbox.bottom > 5);
    }
}
