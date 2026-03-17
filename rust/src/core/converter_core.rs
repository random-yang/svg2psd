use crate::types::{LayerDescriptor, ViewBox};
use crate::svg::walker::walk_svg;
use crate::svg::text_extractor::extract_text_info_from_node;
use crate::svg::style_resolver::parse_style_sheet;

pub fn walk_and_get_descriptors(svg_xml: &str) -> Result<Vec<LayerDescriptor>, String> {
    let doc = roxmltree::Document::parse(svg_xml)
        .map_err(|e| format!("SVG 解析错误: {}", e))?;
    Ok(walk_svg(&doc))
}

pub fn enrich_text_descriptors(
    descriptors: &mut [LayerDescriptor],
    svg_xml: &str,
    view_box: Option<&ViewBox>,
) {
    let Ok(doc) = roxmltree::Document::parse(svg_xml) else { return };
    let svg_root = doc.root_element();
    let stylesheet = parse_style_sheet(&doc);
    let svg_root_id = Some(svg_root.id().get_usize());

    enrich_recursive(descriptors, &doc, view_box, &stylesheet, svg_root_id);
}

fn enrich_recursive(
    descriptors: &mut [LayerDescriptor],
    doc: &roxmltree::Document,
    view_box: Option<&ViewBox>,
    stylesheet: &[crate::svg::style_resolver::CssRule],
    _svg_root_id: Option<usize>,
) {
    for desc in descriptors.iter_mut() {
        if desc.layer_type == "group" {
            if let Some(ref mut children) = desc.children {
                enrich_recursive(children, doc, view_box, stylesheet, _svg_root_id);
            }
        } else if desc.layer_type == "text" {
            if let Some(node_id) = desc.element_idx {
                if let Some(node) = doc.get_node(roxmltree::NodeId::new(node_id)) {
                    let transform = desc.transform.unwrap_or([1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
                    desc.text_info = extract_text_info_from_node(node, &transform, view_box, stylesheet);
                }
            }
        }
    }
}

pub fn count_all_layers(descriptors: &[LayerDescriptor]) -> usize {
    let mut count = 0;
    for desc in descriptors {
        if desc.layer_type == "group" {
            if let Some(ref children) = desc.children {
                count += count_all_layers(children);
            }
        } else {
            count += 1;
        }
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn count_flat() {
        let descs = vec![
            LayerDescriptor {
                layer_type: "graphic".to_string(),
                name: "a".to_string(),
                transform: None, opacity: None, blend_mode: None,
                hidden: None, children: None, text_info: None, element_idx: None,
            },
            LayerDescriptor {
                layer_type: "graphic".to_string(),
                name: "b".to_string(),
                transform: None, opacity: None, blend_mode: None,
                hidden: None, children: None, text_info: None, element_idx: None,
            },
        ];
        assert_eq!(count_all_layers(&descs), 2);
    }

    #[test]
    fn count_nested() {
        let descs = vec![
            LayerDescriptor {
                layer_type: "group".to_string(),
                name: "g".to_string(),
                transform: None, opacity: None, blend_mode: None,
                hidden: None,
                children: Some(vec![
                    LayerDescriptor {
                        layer_type: "graphic".to_string(),
                        name: "a".to_string(),
                        transform: None, opacity: None, blend_mode: None,
                        hidden: None, children: None, text_info: None, element_idx: None,
                    },
                    LayerDescriptor {
                        layer_type: "text".to_string(),
                        name: "t".to_string(),
                        transform: None, opacity: None, blend_mode: None,
                        hidden: None, children: None, text_info: None, element_idx: None,
                    },
                ]),
                text_info: None, element_idx: None,
            },
        ];
        assert_eq!(count_all_layers(&descs), 2);
    }

    #[test]
    fn count_empty() {
        assert_eq!(count_all_layers(&[]), 0);
    }

    #[test]
    fn walk_simple_svg() {
        let descs = walk_and_get_descriptors(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red"/></svg>"#
        ).unwrap();
        assert_eq!(descs.len(), 1);
        assert_eq!(descs[0].layer_type, "graphic");
    }

    #[test]
    fn empty_svg_zero_layers() {
        let descs = walk_and_get_descriptors(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>"#
        ).unwrap();
        assert_eq!(count_all_layers(&descs), 0);
    }
}
