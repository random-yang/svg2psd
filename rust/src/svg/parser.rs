use crate::types::ViewBox;

pub struct SvgParseResult {
    pub width: f64,
    pub height: f64,
    pub view_box: Option<ViewBox>,
    pub xml: String,
}

pub fn parse_svg_string(xml: &str) -> Result<SvgParseResult, String> {
    let doc = roxmltree::Document::parse(xml)
        .map_err(|e| format!("SVG 解析错误: {}", e))?;

    let svg = doc.root_element();
    if svg.tag_name().name() != "svg" {
        return Err("无效的 SVG 文件：缺少 <svg> 根元素".to_string());
    }

    let view_box = parse_view_box(svg.attribute("viewBox"));
    let width: f64 = svg.attribute("width")
        .and_then(|v| v.parse().ok())
        .unwrap_or_else(|| view_box.as_ref().map(|vb| vb.w).unwrap_or(800.0));
    let height: f64 = svg.attribute("height")
        .and_then(|v| v.parse().ok())
        .unwrap_or_else(|| view_box.as_ref().map(|vb| vb.h).unwrap_or(600.0));

    Ok(SvgParseResult {
        width,
        height,
        view_box,
        xml: xml.to_string(),
    })
}

pub fn parse_view_box(attr: Option<&str>) -> Option<ViewBox> {
    let attr = attr?;
    let parts: Vec<f64> = attr.split(|c: char| c.is_whitespace() || c == ',')
        .filter(|s| !s.is_empty())
        .map(|s| s.parse::<f64>())
        .collect::<Result<Vec<_>, _>>()
        .ok()?;

    if parts.len() < 4 {
        return None;
    }

    Some(ViewBox {
        x: parts[0],
        y: parts[1],
        w: parts[2],
        h: parts[3],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_width_height() {
        let result = parse_svg_string(r#"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"></svg>"#).unwrap();
        assert_eq!(result.width, 400.0);
        assert_eq!(result.height, 300.0);
    }

    #[test]
    fn parse_viewbox() {
        let result = parse_svg_string(r#"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 800 600"></svg>"#).unwrap();
        assert_eq!(result.view_box, Some(ViewBox { x: 0.0, y: 0.0, w: 800.0, h: 600.0 }));
    }

    #[test]
    fn infer_from_viewbox() {
        let result = parse_svg_string(r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 768"></svg>"#).unwrap();
        assert_eq!(result.width, 1024.0);
        assert_eq!(result.height, 768.0);
    }

    #[test]
    fn defaults_800x600() {
        let result = parse_svg_string(r#"<svg xmlns="http://www.w3.org/2000/svg"></svg>"#).unwrap();
        assert_eq!(result.width, 800.0);
        assert_eq!(result.height, 600.0);
        assert!(result.view_box.is_none());
    }

    #[test]
    fn invalid_xml_error() {
        let result = parse_svg_string("<not-valid<<>>");
        assert!(result.is_err());
    }

    #[test]
    fn parse_viewbox_normal() {
        assert_eq!(parse_view_box(Some("0 0 100 200")), Some(ViewBox { x: 0.0, y: 0.0, w: 100.0, h: 200.0 }));
    }

    #[test]
    fn parse_viewbox_comma() {
        assert_eq!(parse_view_box(Some("10,20,300,400")), Some(ViewBox { x: 10.0, y: 20.0, w: 300.0, h: 400.0 }));
    }

    #[test]
    fn parse_viewbox_null() {
        assert_eq!(parse_view_box(None), None);
    }

    #[test]
    fn parse_viewbox_incomplete() {
        assert_eq!(parse_view_box(Some("0 0 100")), None);
    }

    #[test]
    fn parse_viewbox_nan() {
        assert_eq!(parse_view_box(Some("0 0 abc 100")), None);
    }
}
