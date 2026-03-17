use serde::{Deserialize, Serialize};

/// 6 元素仿射变换矩阵 [a, b, c, d, e, f]
pub type Matrix = [f64; 6];

/// SVG viewBox
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ViewBox {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// RGB 颜色 (0-255)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

/// 文字样式段
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextRun {
    pub text: String,
    pub font_family: String,
    pub ps_name: String,
    pub font_size: f64,
    pub font_weight: String,
    pub faux_bold: bool,
    pub fill_color: Color,
    pub letter_spacing: Option<f64>,
    pub line_height: Option<f64>,
}

/// 文字信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextInfo {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub runs: Vec<TextRun>,
    pub text_anchor: String,
    pub is_box: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub box_bounds: Option<BoxBounds>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoxBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// 图层描述符
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerDescriptor {
    #[serde(rename = "type")]
    pub layer_type: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transform: Option<Matrix>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blend_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hidden: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<LayerDescriptor>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_info: Option<TextInfo>,
    /// Internal: index into the node list for element reference
    #[serde(skip_serializing_if = "Option::is_none")]
    pub element_idx: Option<u32>,
}

/// 渲染结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderResult {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub top: u32,
    pub left: u32,
    pub right: u32,
    pub bottom: u32,
}

/// BBox
#[derive(Debug, Clone, PartialEq)]
pub struct BBox {
    pub top: u32,
    pub left: u32,
    pub bottom: u32,
    pub right: u32,
}

/// 字体映射条目
pub struct FontMapEntry {
    pub normal: &'static str,
    pub bold: &'static str,
}

/// PSD 图层（序列化用）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PsdLayer {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bottom: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blend_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hidden: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub opened: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<PsdLayer>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<PsdTextData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_data: Option<ImageData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PsdTextData {
    pub text: String,
    pub anti_alias: String,
    pub transform: [f64; 6],
    pub style: PsdTextStyle,
    pub paragraph_style: PsdParagraphStyle,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style_runs: Option<Vec<PsdStyleRun>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PsdTextStyle {
    pub font: PsdFont,
    pub font_size: f64,
    pub fill_color: Color,
    pub faux_bold: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tracking: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_leading: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leading: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PsdFont {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PsdParagraphStyle {
    pub justification: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PsdStyleRun {
    pub length: usize,
    pub style: PsdTextStyle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageData {
    pub width: u32,
    pub height: u32,
    // data is handled separately for WASM
}

/// PSD 文档
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PsdDocument {
    pub width: u32,
    pub height: u32,
    pub children: Vec<PsdLayer>,
}
