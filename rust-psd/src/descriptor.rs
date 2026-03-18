use crate::encoder::PsdEncoder;

/// Descriptor value types used in PSD additional layer info (e.g., TySh for text).
pub enum DescValue {
    Long(i32),
    Double(f64),
    Boolean(bool),
    Text(String),
    /// Raw data (tdta)
    RawData(Vec<u8>),
    /// Enum(type_id, value_id)
    Enum(String, String),
    /// Descriptor(class_id, items)
    Descriptor(String, Vec<(String, DescValue)>),
    /// UnitFloat(unit_id, value)
    UnitFloat(String, f64),
    /// List of values
    List(Vec<DescValue>),
    /// ObjectArray(class_id, keys, rows of values)
    ObjectArray(String, Vec<String>, Vec<Vec<DescValue>>),
}

/// Write a 4-byte descriptor key. If the key is exactly 4 chars, write it directly.
/// Otherwise write length u32 + key bytes.
fn write_desc_key(enc: &mut PsdEncoder, key: &str) {
    let bytes = key.as_bytes();
    if bytes.len() == 4 {
        enc.write_u32(0); // 0 means use the 4-char default
        enc.write_bytes(bytes);
    } else {
        enc.write_u32(bytes.len() as u32);
        enc.write_bytes(bytes);
    }
}

/// Write a class ID (used before descriptor contents).
/// PSD convention: unicode name is always at least 1 char (a null char for "empty").
fn write_class_id(enc: &mut PsdEncoder, class: &str) {
    // Unicode name: 1 null char (PSD convention for "empty" class name)
    enc.write_u32(1); // length = 1
    enc.write_u16(0); // one null UTF-16 char
    write_desc_key(enc, class);
}

/// Write a single descriptor value.
fn write_desc_value(enc: &mut PsdEncoder, value: &DescValue) {
    match value {
        DescValue::Long(v) => {
            enc.write_bytes(b"long");
            enc.write_i32(*v);
        }
        DescValue::Double(v) => {
            enc.write_bytes(b"doub");
            enc.write_f64(*v);
        }
        DescValue::Boolean(v) => {
            enc.write_bytes(b"bool");
            enc.write_u8(if *v { 1 } else { 0 });
        }
        DescValue::Text(v) => {
            enc.write_bytes(b"TEXT");
            enc.write_unicode_string(v);
        }
        DescValue::RawData(data) => {
            enc.write_bytes(b"tdta");
            enc.write_u32(data.len() as u32);
            enc.write_bytes(data);
        }
        DescValue::Enum(type_id, value_id) => {
            enc.write_bytes(b"enum");
            write_desc_key(enc, type_id);
            write_desc_key(enc, value_id);
        }
        DescValue::Descriptor(class_id, items) => {
            enc.write_bytes(b"Objc");
            write_class_id(enc, class_id);
            enc.write_u32(items.len() as u32);
            for (key, val) in items {
                write_desc_key(enc, key);
                write_desc_value(enc, val);
            }
        }
        DescValue::UnitFloat(unit_id, v) => {
            enc.write_bytes(b"UntF");
            enc.write_ascii(unit_id, 4);
            enc.write_f64(*v);
        }
        DescValue::List(items) => {
            enc.write_bytes(b"VlLs");
            enc.write_u32(items.len() as u32);
            for item in items {
                write_desc_value(enc, item);
            }
        }
        DescValue::ObjectArray(class_id, keys, rows) => {
            enc.write_bytes(b"ObAr");
            enc.write_u32(16); // version
            enc.write_unicode_string("");
            write_desc_key(enc, class_id);
            enc.write_u32(keys.len() as u32);
            // Write keys
            for key in keys {
                write_desc_key(enc, key);
                // Write type tag for this column — we infer from first row
                if let Some(first_row) = rows.first() {
                    let idx = keys.iter().position(|k| k == key).unwrap_or(0);
                    if idx < first_row.len() {
                        let type_tag = match &first_row[idx] {
                            DescValue::Long(_) => b"long",
                            DescValue::Double(_) => b"doub",
                            DescValue::Boolean(_) => b"bool",
                            DescValue::Text(_) => b"TEXT",
                            DescValue::Enum(_, _) => b"enum",
                            DescValue::UnitFloat(_, _) => b"UntF",
                            _ => b"long",
                        };
                        enc.write_bytes(type_tag);
                    }
                }
            }
            // Write row count and row data
            enc.write_u32(rows.len() as u32);
            for row in rows {
                for val in row {
                    write_desc_value_raw(enc, val);
                }
            }
        }
    }
}

/// Write a descriptor value without the type tag (used in ObjectArray rows)
fn write_desc_value_raw(enc: &mut PsdEncoder, value: &DescValue) {
    match value {
        DescValue::Long(v) => enc.write_i32(*v),
        DescValue::Double(v) => enc.write_f64(*v),
        DescValue::Boolean(v) => enc.write_u8(if *v { 1 } else { 0 }),
        DescValue::Text(v) => enc.write_unicode_string(v),
        DescValue::UnitFloat(unit_id, v) => {
            enc.write_ascii(unit_id, 4);
            enc.write_f64(*v);
        }
        DescValue::Enum(type_id, value_id) => {
            write_desc_key(enc, type_id);
            write_desc_key(enc, value_id);
        }
        _ => {} // Other types not expected in ObjectArray
    }
}

/// Write a full descriptor to the encoder.
/// `class_id` is the descriptor class, `items` are key-value pairs.
pub fn write_descriptor(enc: &mut PsdEncoder, class_id: &str, items: &[(String, DescValue)]) {
    // Descriptor version
    enc.write_u32(16);
    // Class ID
    write_class_id(enc, class_id);
    // Item count
    enc.write_u32(items.len() as u32);
    for (key, val) in items {
        write_desc_key(enc, key);
        write_desc_value(enc, val);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_write_descriptor_long() {
        let mut enc = PsdEncoder::new();
        let items = vec![("size".to_string(), DescValue::Long(42))];
        write_descriptor(&mut enc, "null", &items);
        let bytes = enc.into_bytes();
        // Should start with version 16
        assert_eq!(&bytes[0..4], &[0, 0, 0, 16]);
        assert!(bytes.len() > 4);
    }

    #[test]
    fn test_write_descriptor_text() {
        let mut enc = PsdEncoder::new();
        let items = vec![("Txt ".to_string(), DescValue::Text("Hello".to_string()))];
        write_descriptor(&mut enc, "null", &items);
        let bytes = enc.into_bytes();
        assert!(bytes.len() > 10);
    }

    #[test]
    fn test_write_descriptor_boolean() {
        let mut enc = PsdEncoder::new();
        let items = vec![("flag".to_string(), DescValue::Boolean(true))];
        write_descriptor(&mut enc, "null", &items);
        let bytes = enc.into_bytes();
        assert!(bytes.len() > 4);
    }

    #[test]
    fn test_write_descriptor_nested() {
        let mut enc = PsdEncoder::new();
        let inner = vec![("val ".to_string(), DescValue::Long(10))];
        let items = vec![(
            "wrap".to_string(),
            DescValue::Descriptor("null".to_string(), inner),
        )];
        write_descriptor(&mut enc, "null", &items);
        let bytes = enc.into_bytes();
        assert!(bytes.len() > 20);
    }

    #[test]
    fn test_write_descriptor_unit_float() {
        let mut enc = PsdEncoder::new();
        let items = vec![("Sz  ".to_string(), DescValue::UnitFloat("#Pxl".to_string(), 24.0))];
        write_descriptor(&mut enc, "null", &items);
        let bytes = enc.into_bytes();
        assert!(bytes.len() > 10);
    }

    #[test]
    fn test_write_descriptor_enum() {
        let mut enc = PsdEncoder::new();
        let items = vec![(
            "annt".to_string(),
            DescValue::Enum("Annt".to_string(), "AnCr".to_string()),
        )];
        write_descriptor(&mut enc, "null", &items);
        let bytes = enc.into_bytes();
        assert!(bytes.len() > 10);
    }

    #[test]
    fn test_write_descriptor_list() {
        let mut enc = PsdEncoder::new();
        let items = vec![(
            "list".to_string(),
            DescValue::List(vec![DescValue::Long(1), DescValue::Long(2)]),
        )];
        write_descriptor(&mut enc, "null", &items);
        let bytes = enc.into_bytes();
        assert!(bytes.len() > 10);
    }
}
