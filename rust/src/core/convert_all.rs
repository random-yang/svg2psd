use crate::types::{LayerDescriptor, ViewBox};
use crate::svg;
use super::psd_bridge;
use super::renderer_resvg;

/// 一次性将 SVG 字符串转换为 PSD 字节
pub fn convert_svg_to_psd(svg_xml: &str, scale: f64) -> Result<Vec<u8>, String> {
    // 1. Parse
    let doc = roxmltree::Document::parse(svg_xml)
        .map_err(|e| format!("SVG 解析错误: {}", e))?;

    let root = doc.root_element();
    let view_box = svg::parser::parse_view_box(root.attribute("viewBox"));
    let width: f64 = root.attribute("width").and_then(|v| v.parse().ok())
        .unwrap_or_else(|| view_box.as_ref().map(|vb| vb.w).unwrap_or(800.0));
    let height: f64 = root.attribute("height").and_then(|v| v.parse().ok())
        .unwrap_or_else(|| view_box.as_ref().map(|vb| vb.h).unwrap_or(600.0));

    // 2. Walk
    let mut descriptors = svg::walker::walk_svg(&doc);

    // 3. Enrich text
    let stylesheet = svg::style_resolver::parse_style_sheet(&doc);
    enrich_text(&mut descriptors, &doc, view_box.as_ref(), &stylesheet);

    // 4. Build SVG shell for standalone SVG assembly
    let (prefix, suffix) = crate::build_svg_shell(svg_xml, &doc);
    let fo_re = regex::Regex::new(r"(?s)<foreignObject[^>]*>.*?</foreignObject>").unwrap();

    // 5. Convert to ag-psd-rs layers
    let psd_w = (width * scale).round() as u32;
    let psd_h = (height * scale).round() as u32;

    let children = process_descriptors(
        &descriptors, svg_xml, &doc, &prefix, &suffix, &fo_re,
        width, height, scale, view_box.as_ref(),
    );

    // 6. Write PSD
    let psd = ag_psd_rs::Psd {
        width: psd_w,
        height: psd_h,
        children,
    };

    let options = ag_psd_rs::WriteOptions::default();
    Ok(ag_psd_rs::write_psd(&psd, &options))
}

fn process_descriptors(
    descs: &[LayerDescriptor],
    svg_xml: &str,
    doc: &roxmltree::Document,
    prefix: &str,
    suffix: &str,
    fo_re: &regex::Regex,
    width: f64,
    height: f64,
    scale: f64,
    view_box: Option<&ViewBox>,
) -> Vec<ag_psd_rs::Layer> {
    let mut layers = Vec::new();
    for desc in descs {
        if let Some(layer) = process_descriptor(
            desc, svg_xml, doc, prefix, suffix, fo_re,
            width, height, scale, view_box,
        ) {
            layers.push(layer);
        }
    }
    layers
}

fn process_descriptor(
    desc: &LayerDescriptor,
    svg_xml: &str,
    doc: &roxmltree::Document,
    prefix: &str,
    suffix: &str,
    fo_re: &regex::Regex,
    width: f64,
    height: f64,
    scale: f64,
    view_box: Option<&ViewBox>,
) -> Option<ag_psd_rs::Layer> {
    if desc.hidden == Some(true) {
        return psd_bridge::descriptor_to_agpsd_layer(desc, None, view_box, scale);
    }

    match desc.layer_type.as_str() {
        "group" => {
            let children = process_descriptors(
                desc.children.as_deref().unwrap_or(&[]),
                svg_xml, doc, prefix, suffix, fo_re,
                width, height, scale, view_box,
            );
            if children.is_empty() {
                return None;
            }
            Some(psd_bridge::build_group_layer(desc, children))
        }
        "text" => {
            // 优先尝试文字图层
            if let Some(layer) = psd_bridge::descriptor_to_agpsd_layer(desc, None, view_box, scale) {
                if layer.text.is_some() {
                    return Some(layer);
                }
            }
            // fallback: 渲染为像素图层
            render_graphic_layer(desc, svg_xml, doc, prefix, suffix, fo_re, width, height, scale, view_box)
        }
        "graphic" => {
            render_graphic_layer(desc, svg_xml, doc, prefix, suffix, fo_re, width, height, scale, view_box)
        }
        _ => None,
    }
}

fn render_graphic_layer(
    desc: &LayerDescriptor,
    svg_xml: &str,
    doc: &roxmltree::Document,
    prefix: &str,
    suffix: &str,
    fo_re: &regex::Regex,
    width: f64,
    height: f64,
    scale: f64,
    view_box: Option<&ViewBox>,
) -> Option<ag_psd_rs::Layer> {
    let element_idx = desc.element_idx?;
    let node = doc.get_node(roxmltree::NodeId::new(element_idx))?;
    if !node.is_element() {
        return None;
    }

    let el_range = node.range();
    if el_range.is_empty() || el_range.end > svg_xml.len() {
        return None;
    }

    let el_xml = fo_re.replace_all(&svg_xml[el_range], "");

    // 拼接 standalone SVG
    let mut standalone = String::with_capacity(prefix.len() + el_xml.len() + suffix.len() + 100);
    standalone.push_str(prefix);

    if let Some(ref m) = desc.transform {
        if !svg::transforms::is_identity(m) {
            let [a, b, c, d, e, f] = m;
            standalone.push_str(&format!(
                "<g transform=\"matrix({},{},{},{},{},{})\">",
                a, b, c, d, e, f
            ));
            standalone.push_str(&el_xml);
            standalone.push_str("</g>");
        } else {
            standalone.push_str(&el_xml);
        }
    } else {
        standalone.push_str(&el_xml);
    }
    standalone.push_str(suffix);

    // 用 resvg 渲染
    let render_result = renderer_resvg::render_svg_to_pixels(&standalone, width, height, scale)?;
    psd_bridge::descriptor_to_agpsd_layer(desc, Some(&render_result), view_box, scale)
}

fn enrich_text(
    descriptors: &mut [LayerDescriptor],
    doc: &roxmltree::Document,
    view_box: Option<&ViewBox>,
    stylesheet: &[svg::style_resolver::CssRule],
) {
    for desc in descriptors.iter_mut() {
        if desc.layer_type == "group" {
            if let Some(ref mut children) = desc.children {
                enrich_text(children, doc, view_box, stylesheet);
            }
        } else if desc.layer_type == "text" {
            if let Some(idx) = desc.element_idx {
                if let Some(node) = doc.get_node(roxmltree::NodeId::new(idx)) {
                    let transform = desc.transform.unwrap_or([1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
                    desc.text_info = svg::text_extractor::extract_text_info_from_node(
                        node, &transform, view_box, stylesheet,
                    );
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn convert_simple_rect() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
            <rect x="10" y="10" width="80" height="80" fill="red"/>
        </svg>"#;
        let psd_bytes = convert_svg_to_psd(svg, 1.0).unwrap();
        // PSD 文件以 "8BPS" 开头
        assert!(psd_bytes.len() > 26);
        assert_eq!(&psd_bytes[0..4], b"8BPS");
    }

    #[test]
    fn convert_with_text() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
            <text x="10" y="50" font-size="24" fill="black">Hello</text>
        </svg>"#;
        let psd_bytes = convert_svg_to_psd(svg, 1.0).unwrap();
        assert!(psd_bytes.len() > 26);
        assert_eq!(&psd_bytes[0..4], b"8BPS");
    }

    #[test]
    fn convert_with_group() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
            <g id="mygroup">
                <rect width="50" height="50" fill="red"/>
                <circle cx="75" cy="75" r="25" fill="blue"/>
            </g>
        </svg>"#;
        let psd_bytes = convert_svg_to_psd(svg, 1.0).unwrap();
        assert!(psd_bytes.len() > 26);
        assert_eq!(&psd_bytes[0..4], b"8BPS");
    }

    #[test]
    fn convert_with_scale() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
            <rect width="100" height="100" fill="green"/>
        </svg>"#;
        let psd_bytes = convert_svg_to_psd(svg, 2.0).unwrap();
        assert!(psd_bytes.len() > 26);
        assert_eq!(&psd_bytes[0..4], b"8BPS");
    }

    #[test]
    fn convert_empty_svg() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>"#;
        let psd_bytes = convert_svg_to_psd(svg, 1.0).unwrap();
        // 即使没有图层也能生成有效 PSD
        assert_eq!(&psd_bytes[0..4], b"8BPS");
    }

    #[test]
    fn convert_invalid_svg_returns_error() {
        let result = convert_svg_to_psd("not xml", 1.0);
        assert!(result.is_err());
    }
}
