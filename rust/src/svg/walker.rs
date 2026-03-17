use crate::svg::style_resolver::{
    get_matched_css_properties, parse_style_attr, parse_style_sheet, CssRule,
};
use crate::svg::transforms::{identity, multiply, parse_transform};
use crate::types::{LayerDescriptor, Matrix};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKIP_TAGS: &[&str] = &[
    "defs",
    "style",
    "metadata",
    "clipPath",
    "mask",
    "pattern",
    "linearGradient",
    "radialGradient",
    "filter",
    "symbol",
    "marker",
    "title",
    "desc",
];

const GRAPHIC_TAGS: &[&str] = &[
    "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "image", "use",
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Entry point: walk the SVG document tree and return a flat list of layer descriptors.
pub fn walk_svg(doc: &roxmltree::Document) -> Vec<LayerDescriptor> {
    let stylesheet = parse_style_sheet(doc);
    let root = doc.root_element();
    walk_children(root, &identity(), &stylesheet)
}

// ---------------------------------------------------------------------------
// Internal tree walk
// ---------------------------------------------------------------------------

fn walk_children(
    parent: roxmltree::Node,
    parent_transform: &Matrix,
    stylesheet: &[CssRule],
) -> Vec<LayerDescriptor> {
    let mut result = Vec::new();
    for child in parent.children().filter(|n| n.is_element()) {
        let tag = child.tag_name().name();
        if SKIP_TAGS.contains(&tag) {
            continue;
        }
        if let Some(desc) = process_element(child, tag, parent_transform, stylesheet) {
            result.push(desc);
        }
    }
    result
}

fn process_element(
    node: roxmltree::Node,
    tag: &str,
    parent_transform: &Matrix,
    stylesheet: &[CssRule],
) -> Option<LayerDescriptor> {
    let transform = get_accumulated_transform(node, parent_transform);
    let opacity = get_opacity(node, stylesheet);
    let blend_mode = get_blend_mode(node, stylesheet);
    let hidden = is_hidden(node, stylesheet);

    if tag == "g" {
        return process_group(node, transform, opacity, blend_mode, hidden, stylesheet);
    }

    if tag == "text" {
        return Some(LayerDescriptor {
            layer_type: "text".into(),
            name: get_text_layer_name(node),
            transform: Some(transform),
            opacity: Some(opacity),
            blend_mode,
            hidden: if hidden { Some(true) } else { None },
            children: None,
            text_info: None,
            element_idx: Some(node.id().get()),
        });
    }

    if tag == "foreignObject" {
        return Some(LayerDescriptor {
            layer_type: "text".into(),
            name: get_foreign_object_layer_name(node),
            transform: Some(transform),
            opacity: Some(opacity),
            blend_mode,
            hidden: if hidden { Some(true) } else { None },
            children: None,
            text_info: None,
            element_idx: Some(node.id().get()),
        });
    }

    if GRAPHIC_TAGS.contains(&tag) {
        return Some(LayerDescriptor {
            layer_type: "graphic".into(),
            name: get_element_name(node, tag),
            transform: Some(transform),
            opacity: Some(opacity),
            blend_mode,
            hidden: if hidden { Some(true) } else { None },
            children: None,
            text_info: None,
            element_idx: Some(node.id().get()),
        });
    }

    if tag == "svg" {
        let children = walk_children(node, &transform, stylesheet);
        if children.is_empty() {
            return None;
        }
        return Some(LayerDescriptor {
            layer_type: "group".into(),
            name: node.attribute("id").unwrap_or("svg").to_string(),
            transform: Some(transform),
            opacity: Some(opacity),
            blend_mode,
            hidden: if hidden { Some(true) } else { None },
            children: Some(children),
            text_info: None,
            element_idx: Some(node.id().get()),
        });
    }

    None
}

fn process_group(
    node: roxmltree::Node,
    transform: Matrix,
    opacity: f64,
    blend_mode: Option<String>,
    hidden: bool,
    stylesheet: &[CssRule],
) -> Option<LayerDescriptor> {
    let children = walk_children(node, &transform, stylesheet);

    if children.is_empty() {
        return None;
    }

    // Flatten: if group has no id, opacity=1, no blend mode, not hidden, and exactly 1 child
    if children.len() == 1
        && opacity == 1.0
        && blend_mode.is_none()
        && !hidden
        && node.attribute("id").is_none()
    {
        return Some(children.into_iter().next().unwrap());
    }

    let name = node
        .attribute("id")
        .map(|s| s.to_string())
        .unwrap_or_else(|| guess_group_name(&children));

    Some(LayerDescriptor {
        layer_type: "group".into(),
        name,
        transform: Some(transform),
        opacity: Some(opacity),
        blend_mode,
        hidden: if hidden { Some(true) } else { None },
        children: Some(children),
        text_info: None,
        element_idx: Some(node.id().get()),
    })
}

// ---------------------------------------------------------------------------
// Transform helpers
// ---------------------------------------------------------------------------

fn get_accumulated_transform(node: roxmltree::Node, parent_transform: &Matrix) -> Matrix {
    let local = parse_transform(node.attribute("transform"));
    multiply(parent_transform, &local)
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

/// Get computed style value for a property: CSS class < presentation attribute < inline style.
fn get_computed_style_value(
    node: roxmltree::Node,
    prop: &str,
    stylesheet: &[CssRule],
) -> Option<String> {
    let mut value: Option<String> = None;

    // CSS class selector (lowest priority)
    if !stylesheet.is_empty() {
        let css_props = get_matched_css_properties(node, stylesheet);
        if let Some(v) = css_props.get(prop) {
            value = Some(v.clone());
        }
    }

    // Presentation attribute (medium priority)
    if let Some(attr) = node.attribute(prop) {
        if !attr.is_empty() {
            value = Some(attr.to_string());
        }
    }

    // Inline style (highest priority)
    if let Some(style_attr) = node.attribute("style") {
        let style_map = parse_style_attr(Some(style_attr));
        if let Some(v) = style_map.get(prop) {
            value = Some(v.clone());
        }
    }

    value
}

fn get_opacity(node: roxmltree::Node, stylesheet: &[CssRule]) -> f64 {
    match get_computed_style_value(node, "opacity", stylesheet) {
        Some(val) => val.parse::<f64>().unwrap_or(1.0),
        None => 1.0,
    }
}

fn get_blend_mode(node: roxmltree::Node, stylesheet: &[CssRule]) -> Option<String> {
    get_computed_style_value(node, "mix-blend-mode", stylesheet)
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn is_hidden(node: roxmltree::Node, stylesheet: &[CssRule]) -> bool {
    if let Some(vis) = get_computed_style_value(node, "visibility", stylesheet) {
        if vis == "hidden" {
            return true;
        }
    }
    if let Some(disp) = get_computed_style_value(node, "display", stylesheet) {
        if disp == "none" {
            return true;
        }
    }
    false
}

// ---------------------------------------------------------------------------
// Naming helpers
// ---------------------------------------------------------------------------

/// Recursively collect all text content from a node.
pub fn get_all_text(node: roxmltree::Node) -> String {
    let mut text = String::new();
    for child in node.children() {
        if child.is_text() {
            if let Some(t) = child.text() {
                text.push_str(t);
            }
        } else if child.is_element() {
            text.push_str(&get_all_text(child));
        }
    }
    text
}

fn get_text_layer_name(node: roxmltree::Node) -> String {
    if let Some(id) = node.attribute("id") {
        return id.to_string();
    }
    let text = get_all_text(node).trim().to_string();
    if text.is_empty() {
        "Text".into()
    } else {
        let truncated: String = text.chars().take(30).collect();
        format!("Text: {}", truncated)
    }
}

fn get_foreign_object_layer_name(node: roxmltree::Node) -> String {
    let text = get_all_text(node).trim().to_string();
    if text.is_empty() {
        "ForeignObject".into()
    } else {
        let truncated: String = text.chars().take(30).collect();
        format!("Text: {}", truncated)
    }
}

fn get_element_name(node: roxmltree::Node, tag: &str) -> String {
    if let Some(id) = node.attribute("id") {
        return id.to_string();
    }
    let mut chars = tag.chars();
    match chars.next() {
        None => tag.to_string(),
        Some(c) => {
            let mut s = c.to_uppercase().to_string();
            s.push_str(chars.as_str());
            s
        }
    }
}

fn guess_group_name(children: &[LayerDescriptor]) -> String {
    if children.iter().all(|c| c.layer_type == "text") {
        "TextGroup".into()
    } else {
        "Group".into()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn walk(svg_str: &str) -> Vec<LayerDescriptor> {
        let doc = roxmltree::Document::parse(svg_str).unwrap();
        walk_svg(&doc)
    }

    #[test]
    fn single_rect_graphic_descriptor() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red"/></svg>"#,
        );
        assert_eq!(descs.len(), 1);
        assert_eq!(descs[0].layer_type, "graphic");
    }

    #[test]
    fn nested_groups_with_children() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
              <g id="outer"><g id="inner"><rect width="50" height="50" fill="red"/><rect x="60" width="50" height="50" fill="blue"/></g></g>
            </svg>"#,
        );
        assert_eq!(descs.len(), 1);
        assert_eq!(descs[0].layer_type, "group");
        assert_eq!(descs[0].name, "outer");
        assert!(descs[0].children.as_ref().unwrap().len() > 0);
    }

    #[test]
    fn skip_defs_style_metadata() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
              <defs><clipPath id="c"><rect width="100" height="100"/></clipPath></defs>
              <style>.a{fill:red}</style>
              <metadata>info</metadata>
              <rect width="50" height="50" fill="red"/>
            </svg>"#,
        );
        assert_eq!(descs.len(), 1);
        assert_eq!(descs[0].layer_type, "graphic");
    }

    #[test]
    fn text_element_type_text() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50">Hello</text></svg>"#,
        );
        assert_eq!(descs.len(), 1);
        assert_eq!(descs[0].layer_type, "text");
    }

    #[test]
    fn foreign_object_type_text() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
              <foreignObject x="0" y="0" width="200" height="100">
                <div xmlns="http://www.w3.org/1999/xhtml">Hello</div>
              </foreignObject>
            </svg>"#,
        );
        assert_eq!(descs.len(), 1);
        assert_eq!(descs[0].layer_type, "text");
    }

    #[test]
    fn display_none_hidden() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red" style="display:none"/></svg>"#,
        );
        assert_eq!(descs[0].hidden, Some(true));
    }

    #[test]
    fn visibility_hidden() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red" visibility="hidden"/></svg>"#,
        );
        assert_eq!(descs[0].hidden, Some(true));
    }

    #[test]
    fn opacity_extraction() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red" opacity="0.5"/></svg>"#,
        );
        assert_eq!(descs[0].opacity, Some(0.5));
    }

    #[test]
    fn mix_blend_mode_extraction() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red" style="mix-blend-mode: multiply"/></svg>"#,
        );
        assert_eq!(descs[0].blend_mode, Some("multiply".to_string()));
    }

    #[test]
    fn empty_group_skipped() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><g id="empty"></g></svg>"#,
        );
        assert_eq!(descs.len(), 0);
    }

    #[test]
    fn single_child_group_no_id_flattened() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><g><rect width="50" height="50" fill="red"/></g></svg>"#,
        );
        assert_eq!(descs.len(), 1);
        assert_eq!(descs[0].layer_type, "graphic");
    }

    #[test]
    fn css_class_opacity() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><style>.half { opacity: 0.5 }</style><rect class="half" width="50" height="50" fill="red"/></svg>"#,
        );
        assert_eq!(descs.len(), 1);
        assert_eq!(descs[0].opacity, Some(0.5));
    }

    #[test]
    fn css_class_display_none_hidden() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><style>.hidden { display: none }</style><rect class="hidden" width="50" height="50" fill="red"/></svg>"#,
        );
        assert_eq!(descs[0].hidden, Some(true));
    }

    #[test]
    fn css_class_visibility_hidden() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><style>.invisible { visibility: hidden }</style><rect class="invisible" width="50" height="50" fill="red"/></svg>"#,
        );
        assert_eq!(descs[0].hidden, Some(true));
    }

    #[test]
    fn css_class_mix_blend_mode() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><style>.blend { mix-blend-mode: multiply }</style><rect class="blend" width="50" height="50" fill="red"/></svg>"#,
        );
        assert_eq!(descs[0].blend_mode, Some("multiply".to_string()));
    }

    #[test]
    fn inline_style_overrides_css_class_opacity() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><style>.half { opacity: 0.5 }</style><rect class="half" style="opacity: 0.8" width="50" height="50" fill="red"/></svg>"#,
        );
        assert_eq!(descs[0].opacity, Some(0.8));
    }

    #[test]
    fn text_layer_name_from_content() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="10" y="50">Hello World</text></svg>"#,
        );
        assert_eq!(descs[0].name, "Text: Hello World");
    }

    #[test]
    fn text_layer_name_from_id() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text id="myText" x="10" y="50">Hello</text></svg>"#,
        );
        assert_eq!(descs[0].name, "myText");
    }

    #[test]
    fn graphic_layer_name_capitalized_tag() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red"/></svg>"#,
        );
        assert_eq!(descs[0].name, "Rect");
    }

    #[test]
    fn graphic_layer_name_from_id() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect id="myRect" width="50" height="50" fill="red"/></svg>"#,
        );
        assert_eq!(descs[0].name, "myRect");
    }

    #[test]
    fn group_name_text_group() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
              <g><text x="10" y="20">A</text><text x="10" y="40">B</text></g>
            </svg>"#,
        );
        // Group has no id but 2 children, so not flattened; all children are text
        assert_eq!(descs.len(), 1);
        assert_eq!(descs[0].layer_type, "group");
        assert_eq!(descs[0].name, "TextGroup");
    }

    #[test]
    fn group_name_generic() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
              <g><text x="10" y="20">A</text><rect width="50" height="50" fill="red"/></g>
            </svg>"#,
        );
        assert_eq!(descs.len(), 1);
        assert_eq!(descs[0].layer_type, "group");
        assert_eq!(descs[0].name, "Group");
    }

    #[test]
    fn element_idx_is_set() {
        let descs = walk(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="50" fill="red"/></svg>"#,
        );
        assert!(descs[0].element_idx.is_some());
    }

    #[test]
    fn get_all_text_recursive() {
        let doc = roxmltree::Document::parse(
            r#"<svg xmlns="http://www.w3.org/2000/svg"><text>Hello <tspan>World</tspan></text></svg>"#,
        )
        .unwrap();
        let text_node = doc
            .descendants()
            .find(|n| n.is_element() && n.tag_name().name() == "text")
            .unwrap();
        assert_eq!(get_all_text(text_node), "Hello World");
    }
}
