/// Blend modes (4-byte PSD keys)
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BlendMode {
    Normal,
    Dissolve,
    Darken,
    Multiply,
    ColorBurn,
    LinearBurn,
    DarkerColor,
    Lighten,
    Screen,
    ColorDodge,
    LinearDodge,
    LighterColor,
    Overlay,
    SoftLight,
    HardLight,
    VividLight,
    LinearLight,
    PinLight,
    HardMix,
    Difference,
    Exclusion,
    Subtract,
    Divide,
    Hue,
    Saturation,
    Color,
    Luminosity,
    PassThrough,
}

impl BlendMode {
    pub fn to_psd_key(&self) -> &'static [u8; 4] {
        match self {
            BlendMode::Normal => b"norm",
            BlendMode::Dissolve => b"diss",
            BlendMode::Darken => b"dark",
            BlendMode::Multiply => b"mul ",
            BlendMode::ColorBurn => b"idiv",
            BlendMode::LinearBurn => b"lbrn",
            BlendMode::DarkerColor => b"dkCl",
            BlendMode::Lighten => b"lite",
            BlendMode::Screen => b"scrn",
            BlendMode::ColorDodge => b"div ",
            BlendMode::LinearDodge => b"lddg",
            BlendMode::LighterColor => b"lgCl",
            BlendMode::Overlay => b"over",
            BlendMode::SoftLight => b"sLit",
            BlendMode::HardLight => b"hLit",
            BlendMode::VividLight => b"vLit",
            BlendMode::LinearLight => b"lLit",
            BlendMode::PinLight => b"pLit",
            BlendMode::HardMix => b"hMix",
            BlendMode::Difference => b"diff",
            BlendMode::Exclusion => b"smud",
            BlendMode::Subtract => b"fsub",
            BlendMode::Divide => b"fdiv",
            BlendMode::Hue => b"hue ",
            BlendMode::Saturation => b"sat ",
            BlendMode::Color => b"colr",
            BlendMode::Luminosity => b"lum ",
            BlendMode::PassThrough => b"pass",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "normal" => BlendMode::Normal,
            "dissolve" => BlendMode::Dissolve,
            "darken" => BlendMode::Darken,
            "multiply" => BlendMode::Multiply,
            "color-burn" => BlendMode::ColorBurn,
            "linear-burn" => BlendMode::LinearBurn,
            "darker-color" => BlendMode::DarkerColor,
            "lighten" => BlendMode::Lighten,
            "screen" => BlendMode::Screen,
            "color-dodge" => BlendMode::ColorDodge,
            "linear-dodge" => BlendMode::LinearDodge,
            "lighter-color" => BlendMode::LighterColor,
            "overlay" => BlendMode::Overlay,
            "soft-light" => BlendMode::SoftLight,
            "hard-light" => BlendMode::HardLight,
            "vivid-light" => BlendMode::VividLight,
            "linear-light" => BlendMode::LinearLight,
            "pin-light" => BlendMode::PinLight,
            "hard-mix" => BlendMode::HardMix,
            "difference" => BlendMode::Difference,
            "exclusion" => BlendMode::Exclusion,
            "subtract" => BlendMode::Subtract,
            "divide" => BlendMode::Divide,
            "hue" => BlendMode::Hue,
            "saturation" => BlendMode::Saturation,
            "color" => BlendMode::Color,
            "luminosity" => BlendMode::Luminosity,
            "pass-through" => BlendMode::PassThrough,
            _ => BlendMode::Normal,
        }
    }
}

/// Color
#[derive(Debug, Clone, PartialEq)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl Color {
    pub fn new(r: u8, g: u8, b: u8) -> Self {
        Self { r, g, b }
    }

    pub fn black() -> Self {
        Self { r: 0, g: 0, b: 0 }
    }

    pub fn white() -> Self {
        Self {
            r: 255,
            g: 255,
            b: 255,
        }
    }
}

/// Image data for a layer
pub struct ImageData {
    pub width: u32,
    pub height: u32,
    /// RGBA interleaved, length = width * height * 4
    pub data: Vec<u8>,
}

/// Text style
pub struct TextStyle {
    pub font_name: String,
    pub font_size: f64,
    pub fill_color: Color,
    pub faux_bold: bool,
    pub tracking: Option<i32>,
    pub auto_leading: Option<bool>,
    pub leading: Option<f64>,
}

impl Default for TextStyle {
    fn default() -> Self {
        Self {
            font_name: "ArialMT".to_string(),
            font_size: 12.0,
            fill_color: Color::black(),
            faux_bold: false,
            tracking: None,
            auto_leading: None,
            leading: None,
        }
    }
}

/// Style run (text segment with specific styling)
pub struct StyleRun {
    pub length: usize,
    pub style: TextStyle,
}

/// Paragraph style
pub struct ParagraphStyle {
    /// "left", "center", "right"
    pub justification: String,
}

impl Default for ParagraphStyle {
    fn default() -> Self {
        Self {
            justification: "left".to_string(),
        }
    }
}

/// Text layer data
pub struct TextData {
    pub text: String,
    pub transform: [f64; 6],
    pub style: TextStyle,
    pub paragraph_style: ParagraphStyle,
    pub style_runs: Option<Vec<StyleRun>>,
    pub anti_alias: String,
}

impl Default for TextData {
    fn default() -> Self {
        Self {
            text: String::new(),
            transform: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            style: TextStyle::default(),
            paragraph_style: ParagraphStyle::default(),
            style_runs: None,
            anti_alias: "sharp".to_string(),
        }
    }
}

/// A PSD layer
pub struct Layer {
    pub name: String,
    pub top: i32,
    pub left: i32,
    pub bottom: i32,
    pub right: i32,
    pub opacity: u8,
    pub blend_mode: BlendMode,
    pub visible: bool,
    pub hidden: bool,
    pub opened: bool,
    pub image_data: Option<ImageData>,
    pub children: Option<Vec<Layer>>,
    pub text: Option<TextData>,
}

impl Default for Layer {
    fn default() -> Self {
        Self {
            name: String::new(),
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            opacity: 255,
            blend_mode: BlendMode::Normal,
            visible: true,
            hidden: false,
            opened: false,
            image_data: None,
            children: None,
            text: None,
        }
    }
}

/// Write options
pub struct WriteOptions {
    pub generate_thumbnail: bool,
    pub invalidate_text_layers: bool,
}

impl Default for WriteOptions {
    fn default() -> Self {
        Self {
            generate_thumbnail: false,
            invalidate_text_layers: true,
        }
    }
}

/// PSD document
pub struct Psd {
    pub width: u32,
    pub height: u32,
    pub children: Vec<Layer>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blend_mode_roundtrip() {
        assert_eq!(BlendMode::Normal.to_psd_key(), b"norm");
        assert_eq!(BlendMode::Multiply.to_psd_key(), b"mul ");
        assert_eq!(BlendMode::PassThrough.to_psd_key(), b"pass");
        assert_eq!(BlendMode::Screen.to_psd_key(), b"scrn");
    }

    #[test]
    fn test_blend_mode_from_str() {
        assert_eq!(BlendMode::from_str("normal"), BlendMode::Normal);
        assert_eq!(BlendMode::from_str("multiply"), BlendMode::Multiply);
        assert_eq!(BlendMode::from_str("pass-through"), BlendMode::PassThrough);
        assert_eq!(BlendMode::from_str("unknown"), BlendMode::Normal);
    }

    #[test]
    fn test_color() {
        let c = Color::new(10, 20, 30);
        assert_eq!(c.r, 10);
        assert_eq!(c.g, 20);
        assert_eq!(c.b, 30);
        assert_eq!(Color::black(), Color::new(0, 0, 0));
        assert_eq!(Color::white(), Color::new(255, 255, 255));
    }

    #[test]
    fn test_layer_default() {
        let layer = Layer::default();
        assert_eq!(layer.name, "");
        assert_eq!(layer.opacity, 255);
        assert_eq!(layer.blend_mode, BlendMode::Normal);
        assert!(layer.visible);
        assert!(!layer.hidden);
        assert!(layer.image_data.is_none());
        assert!(layer.children.is_none());
        assert!(layer.text.is_none());
    }

    #[test]
    fn test_write_options_default() {
        let opts = WriteOptions::default();
        assert!(!opts.generate_thumbnail);
        assert!(opts.invalidate_text_layers);
    }
}
