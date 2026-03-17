use crate::types::Color;
use std::collections::HashMap;
use std::sync::LazyLock;

static NAMED_COLORS: LazyLock<HashMap<&'static str, [u8; 3]>> = LazyLock::new(|| {
    let mut m = HashMap::new();
    m.insert("aliceblue", [240,248,255]); m.insert("antiquewhite", [250,235,215]);
    m.insert("aqua", [0,255,255]); m.insert("aquamarine", [127,255,212]);
    m.insert("azure", [240,255,255]); m.insert("beige", [245,245,220]);
    m.insert("bisque", [255,228,196]); m.insert("black", [0,0,0]);
    m.insert("blanchedalmond", [255,235,205]); m.insert("blue", [0,0,255]);
    m.insert("blueviolet", [138,43,226]); m.insert("brown", [165,42,42]);
    m.insert("burlywood", [222,184,135]); m.insert("cadetblue", [95,158,160]);
    m.insert("chartreuse", [127,255,0]); m.insert("chocolate", [210,105,30]);
    m.insert("coral", [255,127,80]); m.insert("cornflowerblue", [100,149,237]);
    m.insert("cornsilk", [255,248,220]); m.insert("crimson", [220,20,60]);
    m.insert("cyan", [0,255,255]); m.insert("darkblue", [0,0,139]);
    m.insert("darkcyan", [0,139,139]); m.insert("darkgoldenrod", [184,134,11]);
    m.insert("darkgray", [169,169,169]); m.insert("darkgreen", [0,100,0]);
    m.insert("darkgrey", [169,169,169]); m.insert("darkkhaki", [189,183,107]);
    m.insert("darkmagenta", [139,0,139]); m.insert("darkolivegreen", [85,107,47]);
    m.insert("darkorange", [255,140,0]); m.insert("darkorchid", [153,50,204]);
    m.insert("darkred", [139,0,0]); m.insert("darksalmon", [233,150,122]);
    m.insert("darkseagreen", [143,188,143]); m.insert("darkslateblue", [72,61,139]);
    m.insert("darkslategray", [47,79,79]); m.insert("darkslategrey", [47,79,79]);
    m.insert("darkturquoise", [0,206,209]); m.insert("darkviolet", [148,0,211]);
    m.insert("deeppink", [255,20,147]); m.insert("deepskyblue", [0,191,255]);
    m.insert("dimgray", [105,105,105]); m.insert("dimgrey", [105,105,105]);
    m.insert("dodgerblue", [30,144,255]); m.insert("firebrick", [178,34,34]);
    m.insert("floralwhite", [255,250,240]); m.insert("forestgreen", [34,139,34]);
    m.insert("fuchsia", [255,0,255]); m.insert("gainsboro", [220,220,220]);
    m.insert("ghostwhite", [248,248,255]); m.insert("gold", [255,215,0]);
    m.insert("goldenrod", [218,165,32]); m.insert("gray", [128,128,128]);
    m.insert("green", [0,128,0]); m.insert("greenyellow", [173,255,47]);
    m.insert("grey", [128,128,128]); m.insert("honeydew", [240,255,240]);
    m.insert("hotpink", [255,105,180]); m.insert("indianred", [205,92,92]);
    m.insert("indigo", [75,0,130]); m.insert("ivory", [255,255,240]);
    m.insert("khaki", [240,230,140]); m.insert("lavender", [230,230,250]);
    m.insert("lavenderblush", [255,240,245]); m.insert("lawngreen", [124,252,0]);
    m.insert("lemonchiffon", [255,250,205]); m.insert("lightblue", [173,216,230]);
    m.insert("lightcoral", [240,128,128]); m.insert("lightcyan", [224,255,255]);
    m.insert("lightgoldenrodyellow", [250,250,210]); m.insert("lightgray", [211,211,211]);
    m.insert("lightgreen", [144,238,144]); m.insert("lightgrey", [211,211,211]);
    m.insert("lightpink", [255,182,193]); m.insert("lightsalmon", [255,160,122]);
    m.insert("lightseagreen", [32,178,170]); m.insert("lightskyblue", [135,206,250]);
    m.insert("lightslategray", [119,136,153]); m.insert("lightslategrey", [119,136,153]);
    m.insert("lightsteelblue", [176,196,222]); m.insert("lightyellow", [255,255,224]);
    m.insert("lime", [0,255,0]); m.insert("limegreen", [50,205,50]);
    m.insert("linen", [250,240,230]); m.insert("magenta", [255,0,255]);
    m.insert("maroon", [128,0,0]); m.insert("mediumaquamarine", [102,205,170]);
    m.insert("mediumblue", [0,0,205]); m.insert("mediumorchid", [186,85,211]);
    m.insert("mediumpurple", [147,111,219]); m.insert("mediumseagreen", [60,179,113]);
    m.insert("mediumslateblue", [123,104,238]); m.insert("mediumspringgreen", [0,250,154]);
    m.insert("mediumturquoise", [72,209,204]); m.insert("mediumvioletred", [199,21,133]);
    m.insert("midnightblue", [25,25,112]); m.insert("mintcream", [245,255,250]);
    m.insert("mistyrose", [255,228,225]); m.insert("moccasin", [255,228,181]);
    m.insert("navajowhite", [255,222,173]); m.insert("navy", [0,0,128]);
    m.insert("oldlace", [253,245,230]); m.insert("olive", [128,128,0]);
    m.insert("olivedrab", [107,142,35]); m.insert("orange", [255,165,0]);
    m.insert("orangered", [255,69,0]); m.insert("orchid", [218,112,214]);
    m.insert("palegoldenrod", [238,232,170]); m.insert("palegreen", [152,251,152]);
    m.insert("paleturquoise", [175,238,238]); m.insert("palevioletred", [219,112,147]);
    m.insert("papayawhip", [255,239,213]); m.insert("peachpuff", [255,218,185]);
    m.insert("peru", [205,133,63]); m.insert("pink", [255,192,203]);
    m.insert("plum", [221,160,221]); m.insert("powderblue", [176,224,230]);
    m.insert("purple", [128,0,128]); m.insert("rebeccapurple", [102,51,153]);
    m.insert("red", [255,0,0]); m.insert("rosybrown", [188,143,143]);
    m.insert("royalblue", [65,105,225]); m.insert("saddlebrown", [139,69,19]);
    m.insert("salmon", [250,128,114]); m.insert("sandybrown", [244,164,96]);
    m.insert("seagreen", [46,139,87]); m.insert("seashell", [255,245,238]);
    m.insert("sienna", [160,82,45]); m.insert("silver", [192,192,192]);
    m.insert("skyblue", [135,206,235]); m.insert("slateblue", [106,90,205]);
    m.insert("slategray", [112,128,144]); m.insert("slategrey", [112,128,144]);
    m.insert("snow", [255,250,250]); m.insert("springgreen", [0,255,127]);
    m.insert("steelblue", [70,130,180]); m.insert("tan", [210,180,140]);
    m.insert("teal", [0,128,128]); m.insert("thistle", [216,191,216]);
    m.insert("tomato", [255,99,71]); m.insert("turquoise", [64,224,208]);
    m.insert("violet", [238,130,238]); m.insert("wheat", [245,222,179]);
    m.insert("white", [255,255,255]); m.insert("whitesmoke", [245,245,245]);
    m.insert("yellow", [255,255,0]); m.insert("yellowgreen", [154,205,50]);
    m
});

pub fn parse_color(color: Option<&str>) -> Color {
    let color = match color {
        None => return Color { r: 0, g: 0, b: 0 },
        Some(c) => c,
    };

    if color.is_empty() || color == "none" || color == "transparent" {
        return Color { r: 0, g: 0, b: 0 };
    }

    let color = color.trim().to_lowercase();

    if color.starts_with('#') {
        return parse_hex(&color);
    }

    // rgb/rgba
    if color.starts_with("rgb") {
        return parse_rgb(&color);
    }

    // hsl/hsla
    if color.starts_with("hsl") {
        return parse_hsl(&color);
    }

    // named colors
    if let Some(named) = NAMED_COLORS.get(color.as_str()) {
        return Color { r: named[0], g: named[1], b: named[2] };
    }

    Color { r: 0, g: 0, b: 0 }
}

fn parse_hex(hex: &str) -> Color {
    let hex = &hex[1..]; // skip '#'
    let expanded = if hex.len() == 3 || hex.len() == 4 {
        let bytes: Vec<u8> = hex.as_bytes().iter().take(3).collect::<Vec<_>>()
            .iter().flat_map(|&&b| vec![b, b]).collect();
        String::from_utf8(bytes).unwrap_or_default()
    } else {
        hex[..std::cmp::min(hex.len(), 6)].to_string()
    };

    let r = u8::from_str_radix(&expanded[0..2], 16).unwrap_or(0);
    let g = u8::from_str_radix(&expanded[2..4], 16).unwrap_or(0);
    let b = if expanded.len() >= 6 {
        u8::from_str_radix(&expanded[4..6], 16).unwrap_or(0)
    } else {
        0
    };

    Color { r, g, b }
}

fn parse_rgb(color: &str) -> Color {
    // Match: rgba?(num%?, num%?, num%? ...)
    let re = regex::Regex::new(r"rgba?\(\s*([\d.]+)(%?)\s*[,\s]\s*([\d.]+)(%?)\s*[,\s]\s*([\d.]+)(%?)").unwrap();
    if let Some(caps) = re.captures(color) {
        let mut r: f64 = caps[1].parse().unwrap_or(0.0);
        let mut g: f64 = caps[3].parse().unwrap_or(0.0);
        let mut b: f64 = caps[5].parse().unwrap_or(0.0);

        if &caps[2] == "%" { r = (r * 2.55).round(); }
        if &caps[4] == "%" { g = (g * 2.55).round(); }
        if &caps[6] == "%" { b = (b * 2.55).round(); }

        return Color {
            r: clamp(r),
            g: clamp(g),
            b: clamp(b),
        };
    }
    Color { r: 0, g: 0, b: 0 }
}

fn parse_hsl(color: &str) -> Color {
    let re = regex::Regex::new(r"hsla?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%").unwrap();
    if let Some(caps) = re.captures(color) {
        let h: f64 = caps[1].parse::<f64>().unwrap_or(0.0) / 360.0;
        let s: f64 = caps[2].parse::<f64>().unwrap_or(0.0) / 100.0;
        let l: f64 = caps[3].parse::<f64>().unwrap_or(0.0) / 100.0;
        return hsl_to_rgb(h, s, l);
    }
    Color { r: 0, g: 0, b: 0 }
}

fn hsl_to_rgb(h: f64, s: f64, l: f64) -> Color {
    let (r, g, b);
    if s == 0.0 {
        r = l;
        g = l;
        b = l;
    } else {
        let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
        let p = 2.0 * l - q;
        r = hue_to_rgb(p, q, h + 1.0 / 3.0);
        g = hue_to_rgb(p, q, h);
        b = hue_to_rgb(p, q, h - 1.0 / 3.0);
    }
    Color {
        r: (r * 255.0).round() as u8,
        g: (g * 255.0).round() as u8,
        b: (b * 255.0).round() as u8,
    }
}

fn hue_to_rgb(p: f64, q: f64, mut t: f64) -> f64 {
    if t < 0.0 { t += 1.0; }
    if t > 1.0 { t -= 1.0; }
    if t < 1.0 / 6.0 { return p + (q - p) * 6.0 * t; }
    if t < 1.0 / 2.0 { return q; }
    if t < 2.0 / 3.0 { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
    p
}

fn clamp(v: f64) -> u8 {
    v.round().clamp(0.0, 255.0) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_3_digit() {
        assert_eq!(parse_color(Some("#F00")), Color { r: 255, g: 0, b: 0 });
    }

    #[test]
    fn hex_6_digit() {
        assert_eq!(parse_color(Some("#1A1A2E")), Color { r: 26, g: 26, b: 46 });
    }

    #[test]
    fn hex_8_digit() {
        let c = parse_color(Some("#FF000080"));
        assert_eq!(c.r, 255);
        assert_eq!(c.g, 0);
        assert_eq!(c.b, 0);
    }

    #[test]
    fn rgb_values() {
        assert_eq!(parse_color(Some("rgb(255, 0, 0)")), Color { r: 255, g: 0, b: 0 });
    }

    #[test]
    fn rgb_percent() {
        let c = parse_color(Some("rgb(100%, 0%, 0%)"));
        assert_eq!(c.r, 255);
        assert_eq!(c.g, 0);
        assert_eq!(c.b, 0);
    }

    #[test]
    fn rgba_values() {
        let c = parse_color(Some("rgba(255, 0, 0, 0.5)"));
        assert_eq!(c.r, 255);
        assert_eq!(c.g, 0);
        assert_eq!(c.b, 0);
    }

    #[test]
    fn hsl_red() {
        assert_eq!(parse_color(Some("hsl(0, 100%, 50%)")), Color { r: 255, g: 0, b: 0 });
    }

    #[test]
    fn hsl_green() {
        let c = parse_color(Some("hsl(120, 100%, 50%)"));
        assert_eq!(c.r, 0);
        assert_eq!(c.g, 255);
        assert_eq!(c.b, 0);
    }

    #[test]
    fn named_red() {
        assert_eq!(parse_color(Some("red")), Color { r: 255, g: 0, b: 0 });
    }

    #[test]
    fn named_blue() {
        assert_eq!(parse_color(Some("blue")), Color { r: 0, g: 0, b: 255 });
    }

    #[test]
    fn named_cornflowerblue() {
        assert_eq!(parse_color(Some("cornflowerblue")), Color { r: 100, g: 149, b: 237 });
    }

    #[test]
    fn named_rebeccapurple() {
        assert_eq!(parse_color(Some("rebeccapurple")), Color { r: 102, g: 51, b: 153 });
    }

    #[test]
    fn none_color() {
        assert_eq!(parse_color(Some("none")), Color { r: 0, g: 0, b: 0 });
    }

    #[test]
    fn transparent_color() {
        assert_eq!(parse_color(Some("transparent")), Color { r: 0, g: 0, b: 0 });
    }

    #[test]
    fn empty_string() {
        assert_eq!(parse_color(Some("")), Color { r: 0, g: 0, b: 0 });
    }

    #[test]
    fn null_color() {
        assert_eq!(parse_color(None), Color { r: 0, g: 0, b: 0 });
    }

    #[test]
    fn unknown_color() {
        assert_eq!(parse_color(Some("notacolor")), Color { r: 0, g: 0, b: 0 });
    }
}
