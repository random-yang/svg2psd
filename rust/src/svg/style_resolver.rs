use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use regex::Regex;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

static INHERITABLE: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    HashSet::from([
        "fill",
        "fill-opacity",
        "stroke",
        "stroke-opacity",
        "stroke-width",
        "font-family",
        "font-size",
        "font-weight",
        "font-style",
        "text-anchor",
        "text-decoration",
        "letter-spacing",
        "word-spacing",
        "line-height",
        "color",
        "direction",
        "writing-mode",
        "dominant-baseline",
        "visibility",
        "opacity",
    ])
});

static NON_INHERITABLE_EXTRA: &[&str] = &["opacity", "mix-blend-mode", "display", "visibility"];

// ---------------------------------------------------------------------------
// CssRule
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
pub struct CssRule {
    pub selector: String,
    pub specificity: i32,
    pub properties: HashMap<String, String>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Extract CSS rules from all `<style>` elements in the document.
pub fn parse_style_sheet(doc: &roxmltree::Document) -> Vec<CssRule> {
    let mut rules = Vec::new();
    for node in doc.descendants() {
        if node.is_element() && node.tag_name().name() == "style" {
            if let Some(text_node) = node.first_child() {
                if text_node.is_text() {
                    if let Some(text) = text_node.text() {
                        parse_rules(text, &mut rules);
                    }
                }
            }
        }
    }
    rules
}

/// Check whether `node` matches the given CSS `selector`.
pub fn match_selector(node: roxmltree::Node, selector: &str) -> bool {
    // Child selector ">"
    if selector.contains('>') {
        let parts: Vec<&str> = selector
            .split('>')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        if parts.len() < 2 {
            return false;
        }
        let last_sel = parts[parts.len() - 1];
        if !match_simple_selector(node, last_sel) {
            return false;
        }
        let mut current = node.parent();
        for i in (0..parts.len() - 1).rev() {
            match current {
                Some(p) if p.is_element() => {
                    if !match_simple_selector(p, parts[i]) {
                        return false;
                    }
                    current = p.parent();
                }
                _ => return false,
            }
        }
        return true;
    }

    // Descendant selector (space separated)
    let parts: Vec<&str> = selector.split_whitespace().collect();
    if parts.len() == 1 {
        return match_simple_selector(node, parts[0]);
    }

    // Rightmost must match current element
    if !match_simple_selector(node, parts[parts.len() - 1]) {
        return false;
    }

    // Remaining: match ancestor chain right-to-left
    let mut part_idx = parts.len() as i64 - 2;
    let mut ancestor = node.parent();
    while part_idx >= 0 {
        match ancestor {
            Some(a) if a.is_element() => {
                if match_simple_selector(a, parts[part_idx as usize]) {
                    part_idx -= 1;
                }
                ancestor = a.parent();
            }
            _ => break,
        }
    }
    part_idx < 0
}

/// Collect all CSS properties from `stylesheet` that match `node`,
/// applied in specificity order.
pub fn get_matched_css_properties(
    node: roxmltree::Node,
    stylesheet: &[CssRule],
) -> HashMap<String, String> {
    let mut matched: Vec<(i32, usize, &HashMap<String, String>)> = Vec::new();

    for (i, rule) in stylesheet.iter().enumerate() {
        if match_selector(node, &rule.selector) {
            matched.push((rule.specificity, i, &rule.properties));
        }
    }

    // Sort by specificity ascending, then by source order
    matched.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));

    let mut result = HashMap::new();
    for (_, _, props) in matched {
        for (k, v) in props {
            result.insert(k.clone(), v.clone());
        }
    }
    result
}

/// Parse an inline `style` attribute string into key-value pairs.
pub fn parse_style_attr(style: Option<&str>) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let style = match style {
        Some(s) if !s.is_empty() => s,
        _ => return map,
    };
    for decl in style.split(';') {
        if let Some(idx) = decl.find(':') {
            let k = decl[..idx].trim();
            let v = decl[idx + 1..].trim();
            if !k.is_empty() && !v.is_empty() {
                map.insert(k.to_string(), v.to_string());
            }
        }
    }
    map
}

/// Resolve the complete style context for `node`.
/// Priority: inheritance < CSS class < presentation attributes < inline style.
pub fn resolve_styles(
    node: roxmltree::Node,
    parent_styles: &HashMap<String, String>,
    stylesheet: &[CssRule],
) -> HashMap<String, String> {
    let mut resolved = HashMap::new();

    // 1. Inherit inheritable properties from parent
    for &prop in INHERITABLE.iter() {
        if let Some(val) = parent_styles.get(prop) {
            resolved.insert(prop.to_string(), val.clone());
        }
    }

    // 2. CSS class selector match (lower than presentation attrs and inline style)
    if !stylesheet.is_empty() {
        let css_props = get_matched_css_properties(node, stylesheet);
        for (k, v) in css_props {
            resolved.insert(k, v);
        }
    }

    // 3. Presentation attributes (override CSS)
    for &prop in INHERITABLE.iter() {
        if let Some(attr) = node.attribute(prop) {
            if !attr.is_empty() {
                resolved.insert(prop.to_string(), attr.to_string());
            }
        }
    }

    // Also check non-inheritable but common attributes
    for &prop in NON_INHERITABLE_EXTRA {
        if let Some(attr) = node.attribute(prop) {
            if !attr.is_empty() {
                resolved.insert(prop.to_string(), attr.to_string());
            }
        }
    }

    // 4. Highest priority: inline style attribute
    if let Some(style_attr) = node.attribute("style") {
        let style_map = parse_style_attr(Some(style_attr));
        for (k, v) in style_map {
            resolved.insert(k, v);
        }
    }

    resolved
}

/// Get a single style value for `node`, checking inline style first,
/// then presentation attribute, then falling back to `inherited`.
pub fn get_style_value(
    node: roxmltree::Node,
    prop: &str,
    inherited: Option<&str>,
) -> Option<String> {
    // Inline style highest priority
    if let Some(style_attr) = node.attribute("style") {
        let style_map = parse_style_attr(Some(style_attr));
        if let Some(v) = style_map.get(prop) {
            return Some(v.clone());
        }
    }

    // Presentation attribute
    if let Some(attr) = node.attribute(prop) {
        return Some(attr.to_string());
    }

    // Inherited fallback
    inherited.map(|s| s.to_string())
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn parse_rules(css: &str, out: &mut Vec<CssRule>) {
    // Remove comments
    static RE_COMMENT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"/\*[\s\S]*?\*/").unwrap());
    let css = RE_COMMENT.replace_all(css, "");

    static RE_RULE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"([^{}\s][^{}]*)\{([^}]*)\}").unwrap());

    for cap in RE_RULE.captures_iter(&css) {
        let selector_group = cap[1].trim();
        let body = cap[2].trim();
        if selector_group.is_empty() || body.is_empty() {
            continue;
        }
        let properties = parse_declarations(body);
        // Support comma-separated selector groups
        for sel in selector_group.split(',') {
            let selector = sel.trim();
            if !selector.is_empty() {
                out.push(CssRule {
                    selector: selector.to_string(),
                    specificity: compute_specificity(selector),
                    properties: properties.clone(),
                });
            }
        }
    }
}

fn parse_declarations(body: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for decl in body.split(';') {
        if let Some(idx) = decl.find(':') {
            let k = decl[..idx].trim();
            let v = decl[idx + 1..].trim();
            if !k.is_empty() && !v.is_empty() {
                map.insert(k.to_string(), v.to_string());
            }
        }
    }
    map
}

/// Simple CSS specificity: ID = 100, class/attribute = 10, element = 1.
fn compute_specificity(selector: &str) -> i32 {
    static RE_COMBINATOR: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[>+~]").unwrap());
    static RE_ID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"#[\w-]+").unwrap());
    static RE_CLASS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[.\[]").unwrap());
    static RE_STRIP: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"#[\w-]+|\.[\w-]+|\[.*?\]|:[\w-]+(\(.*?\))?").unwrap());

    let cleaned = RE_COMBINATOR.replace_all(selector, " ");
    let parts: Vec<&str> = cleaned.split_whitespace().filter(|s| !s.is_empty()).collect();

    let mut spec = 0i32;
    for part in parts {
        // IDs
        spec += RE_ID.find_iter(part).count() as i32 * 100;
        // Classes / attributes
        spec += RE_CLASS.find_iter(part).count() as i32 * 10;
        // Element tag
        let tag = RE_STRIP.replace_all(part, "");
        let tag = tag.trim();
        if !tag.is_empty() && tag != "*" {
            spec += 1;
        }
    }
    spec
}

/// Match a single simple selector (no spaces/combinators).
fn match_simple_selector(node: roxmltree::Node, selector: &str) -> bool {
    if !node.is_element() {
        return false;
    }
    let el_tag = node.tag_name().name().to_lowercase();

    // Parse selector into tag + classes + id
    static RE_TOKENS: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"[#.]?[^#.]+").unwrap());

    let tokens: Vec<&str> = RE_TOKENS.find_iter(selector).map(|m| m.as_str()).collect();
    if tokens.is_empty() {
        return false;
    }

    let mut tag = String::new();
    let mut classes: Vec<String> = Vec::new();
    let mut id = String::new();

    for token in &tokens {
        if let Some(stripped) = token.strip_prefix('#') {
            id = stripped.to_string();
        } else if let Some(stripped) = token.strip_prefix('.') {
            classes.push(stripped.to_string());
        } else {
            tag = token.to_lowercase();
        }
    }

    // Match tag
    if !tag.is_empty() && tag != "*" && tag != el_tag {
        return false;
    }

    // Match id
    if !id.is_empty() {
        match node.attribute("id") {
            Some(node_id) if node_id == id => {}
            _ => return false,
        }
    }

    // Match classes
    if !classes.is_empty() {
        let el_class = node.attribute("class").unwrap_or("");
        let el_classes: HashSet<&str> = el_class.split_whitespace().collect();
        for cls in &classes {
            if !el_classes.contains(cls.as_str()) {
                return false;
            }
        }
    }

    true
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_svg(inner: &str) -> String {
        format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">{}</svg>"#,
            inner
        )
    }

    fn find_first<'a, 'input>(doc: &'a roxmltree::Document<'input>, tag: &str) -> roxmltree::Node<'a, 'input> {
        doc.descendants()
            .find(|n| n.is_element() && n.tag_name().name() == tag)
            .unwrap()
    }

    /// Helper: create a minimal SVG wrapping `inner` and return the XML string.
    fn wrap_svg(inner: &str) -> String {
        format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg">{}</svg>"#,
            inner
        )
    }

    /// Parse doc and return the NodeId of the first child element of the root.
    fn first_child_id(doc: &roxmltree::Document) -> roxmltree::NodeId {
        let root = doc.root_element();
        root.first_element_child().unwrap().id()
    }

    // -----------------------------------------------------------------------
    // parseStyleAttr
    // -----------------------------------------------------------------------

    #[test]
    fn parse_style_attr_multiple_properties() {
        let result = parse_style_attr(Some("fill:red; font-size:16px"));
        assert_eq!(result.get("fill").unwrap(), "red");
        assert_eq!(result.get("font-size").unwrap(), "16px");
    }

    #[test]
    fn parse_style_attr_empty() {
        assert!(parse_style_attr(Some("")).is_empty());
        assert!(parse_style_attr(None).is_empty());
    }

    // -----------------------------------------------------------------------
    // getStyleValue
    // -----------------------------------------------------------------------

    #[test]
    fn get_style_value_inline_over_presentation() {
        let xml = wrap_svg(r#"<rect fill="blue" style="fill:red"/>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let nid = first_child_id(&doc);
        let node = doc.get_node(nid).unwrap();
        assert_eq!(get_style_value(node, "fill", None), Some("red".into()));
    }

    #[test]
    fn get_style_value_presentation_over_inherited() {
        let xml = wrap_svg(r#"<rect fill="blue"/>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let nid = first_child_id(&doc);
        let node = doc.get_node(nid).unwrap();
        assert_eq!(
            get_style_value(node, "fill", Some("green")),
            Some("blue".into())
        );
    }

    #[test]
    fn get_style_value_inline_over_all() {
        let xml = wrap_svg(r#"<rect fill="blue" style="fill:green"/>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let nid = first_child_id(&doc);
        let node = doc.get_node(nid).unwrap();
        assert_eq!(
            get_style_value(node, "fill", Some("red")),
            Some("green".into())
        );
    }

    // -----------------------------------------------------------------------
    // resolveStyles
    // -----------------------------------------------------------------------

    #[test]
    fn resolve_styles_own_attrs_override_inherited() {
        let xml = wrap_svg(r#"<rect fill="red" font-weight="bold"/>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let nid = first_child_id(&doc);
        let node = doc.get_node(nid).unwrap();
        let mut parent = HashMap::new();
        parent.insert("font-weight".to_string(), "normal".to_string());
        parent.insert("fill".to_string(), "blue".to_string());
        let resolved = resolve_styles(node, &parent, &[]);
        assert_eq!(resolved.get("fill").unwrap(), "red");
        assert_eq!(resolved.get("font-weight").unwrap(), "bold");
    }

    #[test]
    fn resolve_styles_inline_highest_priority() {
        let xml = wrap_svg(r#"<rect fill="blue" style="fill:green"/>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let nid = first_child_id(&doc);
        let node = doc.get_node(nid).unwrap();
        let mut parent = HashMap::new();
        parent.insert("fill".to_string(), "red".to_string());
        let resolved = resolve_styles(node, &parent, &[]);
        assert_eq!(resolved.get("fill").unwrap(), "green");
    }

    #[test]
    fn resolve_styles_mix_blend_mode_from_inline() {
        let xml = wrap_svg(r#"<rect style="mix-blend-mode: multiply"/>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let nid = first_child_id(&doc);
        let node = doc.get_node(nid).unwrap();
        let resolved = resolve_styles(node, &HashMap::new(), &[]);
        assert_eq!(resolved.get("mix-blend-mode").unwrap(), "multiply");
    }

    // -----------------------------------------------------------------------
    // parseStyleSheet
    // -----------------------------------------------------------------------

    #[test]
    fn parse_style_sheet_single_block() {
        let xml = make_svg(r#"<style>.cls-1 { fill: red; font-size: 16px }</style>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let rules = parse_style_sheet(&doc);
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].selector, ".cls-1");
        assert_eq!(rules[0].properties.get("fill").unwrap(), "red");
        assert_eq!(rules[0].properties.get("font-size").unwrap(), "16px");
    }

    #[test]
    fn parse_style_sheet_multiple_rules() {
        let xml = make_svg(
            r#"<style>.a { fill: red } .b { fill: blue } #c { font-weight: bold }</style>"#,
        );
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let rules = parse_style_sheet(&doc);
        assert_eq!(rules.len(), 3);
    }

    #[test]
    fn parse_style_sheet_comma_separated_selectors() {
        let xml = make_svg(r#"<style>.a, .b { fill: red }</style>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let rules = parse_style_sheet(&doc);
        assert_eq!(rules.len(), 2);
        assert_eq!(rules[0].selector, ".a");
        assert_eq!(rules[1].selector, ".b");
        assert_eq!(rules[0].properties.get("fill").unwrap(), "red");
        assert_eq!(rules[1].properties.get("fill").unwrap(), "red");
    }

    #[test]
    fn parse_style_sheet_ignores_comments() {
        let xml = make_svg(r#"<style>/* comment */ .a { fill: red } /* another */</style>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let rules = parse_style_sheet(&doc);
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].properties.get("fill").unwrap(), "red");
    }

    #[test]
    fn parse_style_sheet_no_style_element() {
        let xml = make_svg(r#"<rect width="10" height="10"/>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let rules = parse_style_sheet(&doc);
        assert_eq!(rules.len(), 0);
    }

    #[test]
    fn parse_style_sheet_multiple_style_elements() {
        let xml = make_svg(r#"<style>.a { fill: red }</style><style>.b { fill: blue }</style>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let rules = parse_style_sheet(&doc);
        assert_eq!(rules.len(), 2);
    }

    // -----------------------------------------------------------------------
    // matchSelector
    // -----------------------------------------------------------------------

    #[test]
    fn match_selector_class() {
        let xml = wrap_svg(r#"<rect class="cls-1" width="10" height="10"/>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let nid = first_child_id(&doc);
        let node = doc.get_node(nid).unwrap();
        assert!(match_selector(node, ".cls-1"));
        assert!(!match_selector(node, ".cls-2"));
    }

    #[test]
    fn match_selector_id() {
        let xml = wrap_svg(r#"<rect id="myRect" width="10" height="10"/>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let nid = first_child_id(&doc);
        let node = doc.get_node(nid).unwrap();
        assert!(match_selector(node, "#myRect"));
        assert!(!match_selector(node, "#other"));
    }

    #[test]
    fn match_selector_tag() {
        let xml = wrap_svg(r#"<rect width="10" height="10"/>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let nid = first_child_id(&doc);
        let node = doc.get_node(nid).unwrap();
        assert!(match_selector(node, "rect"));
        assert!(!match_selector(node, "circle"));
    }

    #[test]
    fn match_selector_tag_class() {
        let xml = wrap_svg(r#"<rect class="cls-1" width="10" height="10"/>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let nid = first_child_id(&doc);
        let node = doc.get_node(nid).unwrap();
        assert!(match_selector(node, "rect.cls-1"));
        assert!(!match_selector(node, "circle.cls-1"));
    }

    #[test]
    fn match_selector_multi_class() {
        let xml = wrap_svg(r#"<rect class="a b" width="10" height="10"/>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let nid = first_child_id(&doc);
        let node = doc.get_node(nid).unwrap();
        assert!(match_selector(node, ".a.b"));
        assert!(match_selector(node, ".a"));
        assert!(match_selector(node, ".b"));
        assert!(!match_selector(node, ".a.c"));
    }

    #[test]
    fn match_selector_descendant() {
        let xml = make_svg(r#"<g><rect class="inner" width="10" height="10"/></g>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let rect = find_first(&doc, "rect");
        assert!(match_selector(rect, "g rect"));
        assert!(match_selector(rect, "svg rect"));
        assert!(!match_selector(rect, "circle rect"));
    }

    #[test]
    fn match_selector_child() {
        let xml = make_svg(r#"<g><rect class="inner" width="10" height="10"/></g>"#);
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let rect = find_first(&doc, "rect");
        assert!(match_selector(rect, "g > rect"));
        // svg > g > rect, not svg > rect
        assert!(!match_selector(rect, "svg > rect"));
    }

    // -----------------------------------------------------------------------
    // getMatchedCssProperties
    // -----------------------------------------------------------------------

    #[test]
    fn get_matched_css_properties_class_match() {
        let xml = make_svg(
            r#"<style>.red { fill: red }</style><rect class="red" width="10" height="10"/>"#,
        );
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let rules = parse_style_sheet(&doc);
        let rect = find_first(&doc, "rect");
        let props = get_matched_css_properties(rect, &rules);
        assert_eq!(props.get("fill").unwrap(), "red");
    }

    #[test]
    fn get_matched_css_properties_higher_specificity_wins() {
        let xml = make_svg(
            r#"<style>rect { fill: blue } .red { fill: red }</style><rect class="red" width="10" height="10"/>"#,
        );
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let rules = parse_style_sheet(&doc);
        let rect = find_first(&doc, "rect");
        let props = get_matched_css_properties(rect, &rules);
        assert_eq!(props.get("fill").unwrap(), "red"); // .red (10) > rect (1)
    }

    #[test]
    fn get_matched_css_properties_no_match() {
        let xml = make_svg(
            r#"<style>.blue { fill: blue }</style><rect class="red" width="10" height="10"/>"#,
        );
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let rules = parse_style_sheet(&doc);
        let rect = find_first(&doc, "rect");
        let props = get_matched_css_properties(rect, &rules);
        assert!(props.get("fill").is_none());
    }

    // -----------------------------------------------------------------------
    // resolveStyles with stylesheet
    // -----------------------------------------------------------------------

    #[test]
    fn resolve_styles_css_class_applied() {
        let xml = make_svg(
            r#"<style>.label { font-size: 20px; fill: blue }</style><text class="label" x="10" y="20">Hello</text>"#,
        );
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let rules = parse_style_sheet(&doc);
        let text = find_first(&doc, "text");
        let styles = resolve_styles(text, &HashMap::new(), &rules);
        assert_eq!(styles.get("font-size").unwrap(), "20px");
        assert_eq!(styles.get("fill").unwrap(), "blue");
    }

    #[test]
    fn resolve_styles_inline_over_css_class() {
        let xml = make_svg(
            r#"<style>.label { fill: blue }</style><text class="label" style="fill: red" x="10" y="20">Hello</text>"#,
        );
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let rules = parse_style_sheet(&doc);
        let text = find_first(&doc, "text");
        let styles = resolve_styles(text, &HashMap::new(), &rules);
        assert_eq!(styles.get("fill").unwrap(), "red");
    }

    #[test]
    fn resolve_styles_presentation_attr_over_css_class() {
        let xml = make_svg(
            r#"<style>.label { fill: blue }</style><text class="label" fill="green" x="10" y="20">Hello</text>"#,
        );
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let rules = parse_style_sheet(&doc);
        let text = find_first(&doc, "text");
        let styles = resolve_styles(text, &HashMap::new(), &rules);
        assert_eq!(styles.get("fill").unwrap(), "green");
    }

    #[test]
    fn resolve_styles_css_class_over_inherited() {
        let xml = make_svg(
            r#"<style>.child { fill: red }</style><g fill="blue"><rect class="child" width="10" height="10"/></g>"#,
        );
        let doc = roxmltree::Document::parse(&xml).unwrap();
        let rules = parse_style_sheet(&doc);
        let rect = find_first(&doc, "rect");
        let mut parent = HashMap::new();
        parent.insert("fill".to_string(), "blue".to_string());
        let styles = resolve_styles(rect, &parent, &rules);
        assert_eq!(styles.get("fill").unwrap(), "red");
    }
}
