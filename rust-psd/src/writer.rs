use crate::descriptor::{write_descriptor, DescValue};
use crate::encoder::PsdEncoder;
use crate::rle::compress_channel_rle;
use crate::types::*;

/// A flattened layer record for PSD serialization.
struct FlatLayer<'a> {
    name: String,
    top: i32,
    left: i32,
    bottom: i32,
    right: i32,
    opacity: u8,
    blend_mode: BlendMode,
    visible: bool,
    #[allow(dead_code)]
    hidden: bool,
    image_data: Option<&'a ImageData>,
    text: Option<&'a TextData>,
    /// Section divider type: None for normal layers, Some(1)=open folder, Some(2)=closed folder, Some(3)=bounding divider
    section_type: Option<u32>,
    /// For group open records, the group's blend mode
    section_blend_mode: Option<BlendMode>,
}

/// Flatten the layer tree into PSD's layer list format.
///
/// PSD groups are represented as:
///   [group_open_record, child1, child2, ..., section_divider_close]
/// And the entire flat list is written in this order in the layer records section.
fn flatten_layers<'a>(layers: &'a [Layer], out: &mut Vec<FlatLayer<'a>>) {
    // PSD layers are stored bottom-to-top.
    // For groups: [section_divider_close, ...children (bottom-to-top), group_open_record]
    for layer in layers {
        if let Some(ref children) = layer.children {
            // Section divider close (bottom marker)
            out.push(FlatLayer {
                name: "</Layer group>".to_string(),
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
                opacity: 255,
                blend_mode: BlendMode::Normal,
                visible: false,
                hidden: false,
                image_data: None,
                text: None,
                section_type: Some(3),
                section_blend_mode: None,
            });
            // Children (recurse)
            flatten_layers(children, out);
            // Group open record (top marker)
            out.push(FlatLayer {
                name: layer.name.clone(),
                top: layer.top,
                left: layer.left,
                bottom: layer.bottom,
                right: layer.right,
                opacity: layer.opacity,
                blend_mode: layer.blend_mode,
                visible: layer.visible,
                hidden: layer.hidden,
                image_data: None,
                text: None,
                section_type: Some(if layer.opened { 1 } else { 2 }),
                section_blend_mode: Some(layer.blend_mode),
            });
        } else {
            out.push(FlatLayer {
                name: layer.name.clone(),
                top: layer.top,
                left: layer.left,
                bottom: layer.bottom,
                right: layer.right,
                opacity: layer.opacity,
                blend_mode: layer.blend_mode,
                visible: layer.visible,
                hidden: layer.hidden,
                image_data: layer.image_data.as_ref(),
                text: layer.text.as_ref(),
                section_type: None,
                section_blend_mode: None,
            });
        }
    }
}

/// Compressed channel data for a layer
struct ChannelData {
    /// Channel ID and compressed bytes for each channel
    channels: Vec<(i16, Vec<u8>)>,
}

/// Compress a layer's image data into per-channel RLE.
/// Returns channel entries: (channel_id, full_compressed_data_including_header_and_counts).
fn compress_layer_channels(flat: &FlatLayer) -> ChannelData {
    if let Some(img) = flat.image_data {
        let w = img.width;
        let h = img.height;
        if w == 0 || h == 0 {
            return ChannelData {
                channels: vec![
                    (-1, vec![0, 0]), // alpha, raw, empty
                    (0, vec![0, 0]),  // red
                    (1, vec![0, 0]),  // green
                    (2, vec![0, 0]),  // blue
                ],
            };
        }
        let pixel_count = (w * h) as usize;

        // Deinterleave RGBA into separate channels
        let mut r_data = vec![0u8; pixel_count];
        let mut g_data = vec![0u8; pixel_count];
        let mut b_data = vec![0u8; pixel_count];
        let mut a_data = vec![0u8; pixel_count];

        for i in 0..pixel_count {
            let base = i * 4;
            if base + 3 < img.data.len() {
                r_data[i] = img.data[base];
                g_data[i] = img.data[base + 1];
                b_data[i] = img.data[base + 2];
                a_data[i] = img.data[base + 3];
            }
        }

        let compress = |data: &[u8]| -> Vec<u8> {
            let (counts, compressed) = compress_channel_rle(data, w, h);
            let mut out = Vec::new();
            // Compression type: 1 = RLE
            out.extend_from_slice(&1u16.to_be_bytes());
            // Byte counts per row
            for &c in &counts {
                out.extend_from_slice(&c.to_be_bytes());
            }
            out.extend_from_slice(&compressed);
            out
        };

        ChannelData {
            channels: vec![
                (-1, compress(&a_data)),
                (0, compress(&r_data)),
                (1, compress(&g_data)),
                (2, compress(&b_data)),
            ],
        }
    } else {
        // Empty layer (group record or section divider)
        ChannelData {
            channels: vec![
                (-1, vec![0, 0]), // compression=0 (raw), no data
                (0, vec![0, 0]),
                (1, vec![0, 0]),
                (2, vec![0, 0]),
            ],
        }
    }
}

/// Write additional layer info blocks for a flat layer.
fn write_additional_info(enc: &mut PsdEncoder, flat: &FlatLayer, options: &WriteOptions) {
    // Unicode name (luni)
    enc.write_bytes(b"8BIM");
    enc.write_bytes(b"luni");
    let luni_len_pos = enc.write_placeholder_u32();
    enc.write_unicode_string(&flat.name);
    enc.fill_length_u32(luni_len_pos);
    enc.pad_to_even();

    // Section divider (lsct)
    if let Some(section_type) = flat.section_type {
        enc.write_bytes(b"8BIM");
        enc.write_bytes(b"lsct");
        if section_type == 1 || section_type == 2 {
            // Open/closed folder: include blend mode
            enc.write_u32(12); // length: 4 (type) + 4 (sig) + 4 (blend)
            enc.write_u32(section_type);
            enc.write_bytes(b"8BIM");
            let bm = flat.section_blend_mode.unwrap_or(BlendMode::PassThrough);
            enc.write_bytes(bm.to_psd_key());
        } else {
            // Divider close
            enc.write_u32(4); // length: just the type
            enc.write_u32(section_type);
        }
    }

    // Text data (TySh)
    if let Some(text) = flat.text {
        write_tysh(enc, text, options);
    }
}

/// Write TySh (Type tool) additional layer information for text layers.
fn write_tysh(enc: &mut PsdEncoder, text: &TextData, options: &WriteOptions) {
    enc.write_bytes(b"8BIM");
    enc.write_bytes(b"TySh");
    let tysh_len_pos = enc.write_placeholder_u32();

    // Version
    enc.write_u16(1);

    // Transform (6 doubles)
    for &v in &text.transform {
        enc.write_f64(v);
    }

    // Text descriptor version
    enc.write_u16(50);

    // Build text descriptor (matching ag-psd field order)
    let mut text_items: Vec<(String, DescValue)> = Vec::new();
    text_items.push(("Txt ".to_string(), DescValue::Text(text.text.clone())));

    // textGridding
    text_items.push((
        "textGridding".to_string(),
        DescValue::Enum("textGridding".to_string(), "None".to_string()),
    ));

    // Orientation
    text_items.push((
        "Ornt".to_string(),
        DescValue::Enum("Ornt".to_string(), "Hrzn".to_string()),
    ));

    // Anti-alias
    let anti_alias_value = match text.anti_alias.as_str() {
        "none" => "Anno",
        "sharp" => "AnCr",
        "crisp" => "AnSt",
        "strong" => "AnSt",
        "smooth" => "AnSm",
        "platform" => "AnPl",
        _ => "AnCr",
    };
    text_items.push((
        "AntA".to_string(),
        DescValue::Enum("Annt".to_string(), anti_alias_value.to_string()),
    ));

    // TextIndex
    text_items.push(("TextIndex".to_string(), DescValue::Long(0)));

    // EngineData as raw data (tdta) — must be LAST (ag-psd convention)
    if options.invalidate_text_layers {
        let engine_data = build_engine_data(text);
        text_items.push((
            "EngineData".to_string(),
            DescValue::RawData(engine_data.into_bytes()),
        ));
    }

    write_descriptor(enc, "TxLr", &text_items);

    // Warp version
    enc.write_u16(1);

    // Warp descriptor
    let warp_items: Vec<(String, DescValue)> = vec![
        (
            "warpStyle".to_string(),
            DescValue::Enum("warpStyle".to_string(), "warpNone".to_string()),
        ),
        ("warpValue".to_string(), DescValue::Double(0.0)),
        (
            "warpPerspective".to_string(),
            DescValue::Double(0.0),
        ),
        (
            "warpPerspectiveOther".to_string(),
            DescValue::Double(0.0),
        ),
        (
            "warpRotate".to_string(),
            DescValue::Enum("Ornt".to_string(), "Hrzn".to_string()),
        ),
    ];
    write_descriptor(enc, "warp", &warp_items);

    // Top, left, bottom, right for text bounds
    enc.write_f64(0.0);
    enc.write_f64(0.0);
    enc.write_f64(0.0);
    enc.write_f64(0.0);

    enc.fill_length_u32(tysh_len_pos);
    enc.pad_to_even();
}

/// Build minimal EngineData string for text layers.
fn build_engine_data(text: &TextData) -> String {
    let justification = match text.paragraph_style.justification.as_str() {
        "center" => 2,
        "right" => 1,
        _ => 0,
    };

    let style = &text.style;
    let r = style.fill_color.r as f64 / 255.0;
    let g = style.fill_color.g as f64 / 255.0;
    let b = style.fill_color.b as f64 / 255.0;

    let mut font_size_str = format!("{:.6}", style.font_size);
    // Trim unnecessary trailing zeros but keep at least one decimal
    if font_size_str.contains('.') {
        font_size_str = font_size_str.trim_end_matches('0').to_string();
        if font_size_str.ends_with('.') {
            font_size_str.push('0');
        }
    }

    let tracking = style.tracking.unwrap_or(0);
    let faux_bold = if style.faux_bold { "true" } else { "false" };

    let leading_str = if let Some(leading) = style.leading {
        format!(
            "\n\t\t\t\t/Leading {:.1}\n\t\t\t\t/AutoLeading false",
            leading
        )
    } else if style.auto_leading == Some(false) {
        "\n\t\t\t\t/AutoLeading false".to_string()
    } else {
        "\n\t\t\t\t/AutoLeading true".to_string()
    };

    format!(
        concat!(
            "<<\n",
            "\t/EngineDict\n",
            "\t<<\n",
            "\t\t/Editor\n",
            "\t\t<<\n",
            "\t\t\t/Text ({})\n",
            "\t\t>>\n",
            "\t\t/ParagraphRun\n",
            "\t\t<<\n",
            "\t\t\t/DefaultRunData\n",
            "\t\t\t<<\n",
            "\t\t\t\t/ParagraphSheet\n",
            "\t\t\t\t<<\n",
            "\t\t\t\t\t/DefaultStyleSheet 0\n",
            "\t\t\t\t\t/Properties\n",
            "\t\t\t\t\t<<\n",
            "\t\t\t\t\t\t/Justification {}\n",
            "\t\t\t\t\t>>\n",
            "\t\t\t\t>>\n",
            "\t\t\t>>\n",
            "\t\t\t/RunArray\n",
            "\t\t\t[\n",
            "\t\t\t\t<<\n",
            "\t\t\t\t\t/ParagraphSheet\n",
            "\t\t\t\t\t<<\n",
            "\t\t\t\t\t\t/DefaultStyleSheet 0\n",
            "\t\t\t\t\t\t/Properties\n",
            "\t\t\t\t\t\t<<\n",
            "\t\t\t\t\t\t\t/Justification {}\n",
            "\t\t\t\t\t\t>>\n",
            "\t\t\t\t\t>>\n",
            "\t\t\t\t>>\n",
            "\t\t\t]\n",
            "\t\t\t/RunLength\n",
            "\t\t\t[\n",
            "\t\t\t\t{}\n",
            "\t\t\t]\n",
            "\t\t>>\n",
            "\t\t/StyleRun\n",
            "\t\t<<\n",
            "\t\t\t/DefaultRunData\n",
            "\t\t\t<<\n",
            "\t\t\t\t/StyleSheet\n",
            "\t\t\t\t<<\n",
            "\t\t\t\t\t/StyleSheetData\n",
            "\t\t\t\t\t<<\n",
            "\t\t\t\t\t\t/Font 0\n",
            "\t\t\t\t\t\t/FontSize {}\n",
            "\t\t\t\t\t\t/FauxBold {}\n",
            "\t\t\t\t\t\t/Tracking {}\n",
            "\t\t\t\t\t\t/FillColor\n",
            "\t\t\t\t\t\t<<\n",
            "\t\t\t\t\t\t\t/Type 1\n",
            "\t\t\t\t\t\t\t/Values [{:.6} {:.6} {:.6} {:.6}]\n",
            "\t\t\t\t\t\t>>{}\n",
            "\t\t\t\t\t>>\n",
            "\t\t\t\t>>\n",
            "\t\t\t>>\n",
            "\t\t\t/RunArray\n",
            "\t\t\t[\n",
            "\t\t\t\t<<\n",
            "\t\t\t\t\t/StyleSheet\n",
            "\t\t\t\t\t<<\n",
            "\t\t\t\t\t\t/StyleSheetData\n",
            "\t\t\t\t\t\t<<\n",
            "\t\t\t\t\t\t\t/Font 0\n",
            "\t\t\t\t\t\t\t/FontSize {}\n",
            "\t\t\t\t\t\t\t/FauxBold {}\n",
            "\t\t\t\t\t\t\t/Tracking {}\n",
            "\t\t\t\t\t\t\t/FillColor\n",
            "\t\t\t\t\t\t\t<<\n",
            "\t\t\t\t\t\t\t\t/Type 1\n",
            "\t\t\t\t\t\t\t\t/Values [{:.6} {:.6} {:.6} {:.6}]\n",
            "\t\t\t\t\t\t\t>>{}\n",
            "\t\t\t\t\t\t>>\n",
            "\t\t\t\t\t>>\n",
            "\t\t\t\t>>\n",
            "\t\t\t]\n",
            "\t\t\t/RunLength\n",
            "\t\t\t[\n",
            "\t\t\t\t{}\n",
            "\t\t\t]\n",
            "\t\t>>\n",
            "\t>>\n",
            "\t/ResourceDict\n",
            "\t<<\n",
            "\t\t/FontSet\n",
            "\t\t[\n",
            "\t\t\t<<\n",
            "\t\t\t\t/Name ({})\n",
            "\t\t\t\t/Script 0\n",
            "\t\t\t\t/FontType 0\n",
            "\t\t\t\t/Synthetic 0\n",
            "\t\t\t>>\n",
            "\t\t]\n",
            "\t>>\n",
            ">>\n",
        ),
        text.text,         // Editor/Text
        justification,     // DefaultRunData Justification
        justification,     // RunArray Justification
        text.text.len(),   // ParagraphRun RunLength
        font_size_str,     // DefaultRunData FontSize
        faux_bold,         // DefaultRunData FauxBold
        tracking,          // DefaultRunData Tracking
        1.0, r, g, b,     // DefaultRunData FillColor
        leading_str,       // DefaultRunData leading
        font_size_str,     // RunArray FontSize
        faux_bold,         // RunArray FauxBold
        tracking,          // RunArray Tracking
        1.0, r, g, b,     // RunArray FillColor
        leading_str,       // RunArray leading
        text.text.len(),   // StyleRun RunLength
        style.font_name,   // FontSet Name
    )
}

/// Write the complete PSD file.
pub fn write_psd(psd: &Psd, options: &WriteOptions) -> Vec<u8> {
    let mut enc = PsdEncoder::new();

    // === 1. File Header (26 bytes) ===
    enc.write_bytes(b"8BPS");     // Signature
    enc.write_u16(1);             // Version
    enc.write_bytes(&[0u8; 6]);   // Reserved
    enc.write_u16(3);             // Channels (RGB)
    enc.write_u32(psd.height);    // Height
    enc.write_u32(psd.width);     // Width
    enc.write_u16(8);             // Bits per channel
    enc.write_u16(3);             // Color mode: RGB

    // === 2. Color Mode Data ===
    enc.write_u32(0); // Length = 0 for RGB

    // === 3. Image Resources ===
    let irs_len_pos = enc.write_placeholder_u32();
    if options.generate_thumbnail {
        write_thumbnail_resource(&mut enc, psd);
    }
    // Resolution info (0x03ED) — required for valid PSD
    write_resolution_resource(&mut enc);
    enc.fill_length_u32(irs_len_pos);

    // === 4. Layer and Mask Information ===
    let lm_len_pos = enc.write_placeholder_u32();

    // Flatten layers
    let mut flat_layers: Vec<FlatLayer> = Vec::new();
    flatten_layers(&psd.children, &mut flat_layers);

    if flat_layers.is_empty() {
        // No layers — write empty layer info
        enc.write_u32(0);
    } else {
        // Layer info section
        let li_len_pos = enc.write_placeholder_u32();

        // Layer count (negative = composite has alpha)
        let layer_count = flat_layers.len() as i16;
        enc.write_i16(-layer_count);

        // Pre-compute channel data for all layers
        let all_channel_data: Vec<ChannelData> =
            flat_layers.iter().map(|f| compress_layer_channels(f)).collect();

        // === Layer Records ===
        for (i, flat) in flat_layers.iter().enumerate() {
            // Bounds
            enc.write_i32(flat.top);
            enc.write_i32(flat.left);
            enc.write_i32(flat.bottom);
            enc.write_i32(flat.right);

            // Channel count
            let ch_data = &all_channel_data[i];
            enc.write_u16(ch_data.channels.len() as u16);

            // Per-channel info: id (i16) + data length (u32)
            for (ch_id, ch_bytes) in &ch_data.channels {
                enc.write_i16(*ch_id);
                enc.write_u32(ch_bytes.len() as u32);
            }

            // Blend mode signature
            enc.write_bytes(b"8BIM");
            enc.write_bytes(flat.blend_mode.to_psd_key());

            // Opacity
            enc.write_u8(flat.opacity);

            // Clipping (0 = base)
            enc.write_u8(0);

            // Flags: bit 0 = transparency protected, bit 1 = visible (inverted!), bit 3 = has useful info
            let mut flags: u8 = 0;
            if !flat.visible {
                flags |= 0x02; // bit 1 = hidden
            }
            enc.write_u8(flags);

            // Filler
            enc.write_u8(0);

            // Extra data length
            let extra_len_pos = enc.write_placeholder_u32();

            // Layer mask data (0 = none)
            enc.write_u32(0);

            // Blending ranges (0 = none)
            enc.write_u32(0);

            // Layer name (Pascal string, padded to 4 bytes)
            enc.write_pascal_string(&flat.name, 4);

            // Additional layer info
            write_additional_info(&mut enc, flat, options);

            enc.fill_length_u32(extra_len_pos);
        }

        // === Channel Image Data (after all layer records) ===
        for ch_data in &all_channel_data {
            for (_ch_id, ch_bytes) in &ch_data.channels {
                enc.write_bytes(ch_bytes);
            }
        }

        enc.fill_length_u32(li_len_pos);
        // Pad layer info to even
        if (enc.position() - li_len_pos - 4) % 2 != 0 {
            enc.write_u8(0);
        }
    }

    // Global layer mask info (empty)
    enc.write_u32(0);

    enc.fill_length_u32(lm_len_pos);

    // === 5. Composite Image Data ===
    write_composite_image(&mut enc, psd);

    enc.into_bytes()
}

/// Write resolution info resource (0x03ED).
fn write_resolution_resource(enc: &mut PsdEncoder) {
    enc.write_bytes(b"8BIM");
    enc.write_u16(0x03ED); // Resource ID
    enc.write_pascal_string("", 2); // Name (empty)
    enc.write_u32(16); // Data length
    // Horizontal resolution: 72 DPI as fixed-point 16.16
    enc.write_u16(72); // Integer part
    enc.write_u32(0);  // Fraction
    enc.write_u16(1);  // Display unit: PPI
    // Vertical resolution
    enc.write_u16(72);
    enc.write_u32(0);
    enc.write_u16(1);
}

/// Write thumbnail resource (placeholder — generates a small white thumbnail).
fn write_thumbnail_resource(enc: &mut PsdEncoder, psd: &Psd) {
    // Resource 0x0409 (Photoshop 5+ thumbnail)
    let thumb_w: u32 = psd.width.min(128);
    let thumb_h: u32 = psd.height.min(128);

    enc.write_bytes(b"8BIM");
    enc.write_u16(0x0409);
    enc.write_pascal_string("", 2);

    let data_len_pos = enc.write_placeholder_u32();

    // JFIF thumbnail header (28 bytes)
    enc.write_u32(1); // Format: kJpegRGB = 1
    enc.write_u32(thumb_w);
    enc.write_u32(thumb_h);
    enc.write_u32(thumb_w * 3); // Row bytes (widthbytes)
    enc.write_u32(thumb_w * thumb_h * 3); // Total size
    enc.write_u32(thumb_w * thumb_h * 3); // Compressed size (same, raw)
    enc.write_u16(24); // Bits per pixel
    enc.write_u16(1); // Planes

    // Raw RGB data (white)
    let pixel_count = (thumb_w * thumb_h * 3) as usize;
    enc.write_bytes(&vec![255u8; pixel_count]);

    enc.fill_length_u32(data_len_pos);
    enc.pad_to_even();
}

/// Write the composite (merged) image data section.
fn write_composite_image(enc: &mut PsdEncoder, psd: &Psd) {
    let w = psd.width;
    let h = psd.height;
    let pixel_count = (w * h) as usize;

    // Generate white composite
    let white_channel = vec![255u8; pixel_count];

    // Compression = 1 (RLE)
    enc.write_u16(1);

    // Compress each channel (R, G, B)
    let (r_counts, r_data) = compress_channel_rle(&white_channel, w, h);
    let (g_counts, g_data) = compress_channel_rle(&white_channel, w, h);
    let (b_counts, b_data) = compress_channel_rle(&white_channel, w, h);

    // Byte counts for all channels (height entries per channel)
    for &c in &r_counts {
        enc.write_u16(c);
    }
    for &c in &g_counts {
        enc.write_u16(c);
    }
    for &c in &b_counts {
        enc.write_u16(c);
    }

    // Compressed data
    enc.write_bytes(&r_data);
    enc.write_bytes(&g_data);
    enc.write_bytes(&b_data);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_write_empty_psd() {
        let psd = Psd {
            width: 100,
            height: 100,
            children: vec![],
        };
        let bytes = write_psd(&psd, &WriteOptions::default());

        // Verify header
        assert_eq!(&bytes[0..4], b"8BPS");
        assert_eq!(&bytes[4..6], &[0, 1]); // version 1
        assert_eq!(&bytes[12..14], &[0, 3]); // 3 channels
        // height = 100 = 0x64
        assert_eq!(&bytes[14..18], &[0, 0, 0, 100]);
        // width = 100
        assert_eq!(&bytes[18..22], &[0, 0, 0, 100]);
        // depth = 8
        assert_eq!(&bytes[22..24], &[0, 8]);
        // color mode = 3 (RGB)
        assert_eq!(&bytes[24..26], &[0, 3]);
        // File should be reasonably sized
        assert!(bytes.len() > 26);
    }

    #[test]
    fn test_write_psd_with_layer() {
        let img_w = 2;
        let img_h = 2;
        let mut rgba = vec![0u8; img_w * img_h * 4];
        // Fill with red, fully opaque
        for i in 0..(img_w * img_h) {
            rgba[i * 4] = 255;     // R
            rgba[i * 4 + 1] = 0;   // G
            rgba[i * 4 + 2] = 0;   // B
            rgba[i * 4 + 3] = 255; // A
        }

        let layer = Layer {
            name: "Red".to_string(),
            top: 0,
            left: 0,
            bottom: 2,
            right: 2,
            image_data: Some(ImageData {
                width: img_w as u32,
                height: img_h as u32,
                data: rgba,
            }),
            ..Default::default()
        };

        let psd = Psd {
            width: 10,
            height: 10,
            children: vec![layer],
        };

        let bytes = write_psd(&psd, &WriteOptions::default());
        assert_eq!(&bytes[0..4], b"8BPS");
        assert!(bytes.len() > 100);
    }

    #[test]
    fn test_write_psd_with_group() {
        let child = Layer {
            name: "Child".to_string(),
            top: 0,
            left: 0,
            bottom: 5,
            right: 5,
            ..Default::default()
        };

        let group = Layer {
            name: "Group".to_string(),
            children: Some(vec![child]),
            ..Default::default()
        };

        let psd = Psd {
            width: 10,
            height: 10,
            children: vec![group],
        };

        let bytes = write_psd(&psd, &WriteOptions::default());
        assert_eq!(&bytes[0..4], b"8BPS");
        assert!(bytes.len() > 100);
    }

    #[test]
    fn test_flatten_layers_order() {
        let child_a = Layer {
            name: "A".to_string(),
            ..Default::default()
        };
        let child_b = Layer {
            name: "B".to_string(),
            ..Default::default()
        };
        let group = Layer {
            name: "G".to_string(),
            children: Some(vec![child_a, child_b]),
            ..Default::default()
        };

        let mut flat: Vec<FlatLayer> = Vec::new();
        let layers = [group];
        flatten_layers(&layers, &mut flat);

        assert_eq!(flat.len(), 4);
        assert_eq!(flat[0].name, "</Layer group>");
        assert_eq!(flat[0].section_type, Some(3)); // divider close
        assert_eq!(flat[1].name, "A");
        assert_eq!(flat[2].name, "B");
        assert_eq!(flat[3].name, "G");
        assert_eq!(flat[3].section_type, Some(2)); // closed folder (group open record)
    }

    #[test]
    fn test_write_psd_with_text_layer() {
        let text = TextData {
            text: "Hello".to_string(),
            transform: [1.0, 0.0, 0.0, 1.0, 10.0, 20.0],
            style: TextStyle {
                font_name: "ArialMT".to_string(),
                font_size: 24.0,
                fill_color: Color::black(),
                faux_bold: false,
                tracking: None,
                auto_leading: None,
                leading: None,
            },
            paragraph_style: ParagraphStyle::default(),
            style_runs: None,
            anti_alias: "sharp".to_string(),
        };

        let layer = Layer {
            name: "Text".to_string(),
            top: 10,
            left: 10,
            bottom: 40,
            right: 100,
            text: Some(text),
            ..Default::default()
        };

        let psd = Psd {
            width: 200,
            height: 200,
            children: vec![layer],
        };

        let bytes = write_psd(&psd, &WriteOptions::default());
        assert_eq!(&bytes[0..4], b"8BPS");
        assert!(bytes.len() > 200);
    }

    #[test]
    fn test_write_psd_with_thumbnail() {
        let psd = Psd {
            width: 50,
            height: 50,
            children: vec![],
        };
        let opts = WriteOptions {
            generate_thumbnail: true,
            invalidate_text_layers: true,
        };
        let bytes = write_psd(&psd, &opts);
        assert_eq!(&bytes[0..4], b"8BPS");
        // With thumbnail, file should be larger
        assert!(bytes.len() > 1000);
    }
}
