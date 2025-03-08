
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

// Main structure to hold emoji data
#[wasm_bindgen]
pub struct EmojiSearch {
    english_keywords: HashMap<String, Vec<String>>,
    russian_keywords: HashMap<String, Vec<String>>,
}

#[wasm_bindgen]
impl EmojiSearch {
    // Constructor
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            english_keywords: HashMap::new(),
            russian_keywords: HashMap::new(),
        }
    }

    // Initialize with emoji data
    #[wasm_bindgen]
    pub fn initialize(&mut self, emoji_data_json: &str) -> Result<(), JsValue> {
        let emoji_data: serde_json::Value = serde_json::from_str(emoji_data_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse JSON: {}", e)))?;
        
        // Process the data
        if let Some(obj) = emoji_data.as_object() {
            for (key, value) in obj {
                if key == "english" {
                    if let Some(english_map) = value.as_object() {
                        for (keyword, emojis) in english_map {
                            if let Some(emoji_str) = emojis.as_str() {
                                let emoji_vec: Vec<String> = emoji_str
                                    .split_whitespace()
                                    .map(|s| s.to_string())
                                    .collect();
                                self.english_keywords.insert(keyword.to_lowercase(), emoji_vec);
                            }
                        }
                    }
                } else if key == "russian" {
                    if let Some(russian_map) = value.as_object() {
                        for (keyword, emojis) in russian_map {
                            if let Some(emoji_str) = emojis.as_str() {
                                let emoji_vec: Vec<String> = emoji_str
                                    .split_whitespace()
                                    .map(|s| s.to_string())
                                    .collect();
                                self.russian_keywords.insert(keyword.to_lowercase(), emoji_vec);
                            }
                        }
                    }
                }
            }
        }
        
        Ok(())
    }

    // Search for emojis
    #[wasm_bindgen]
    pub fn search(&self, query: &str, language: &str) -> String {
        let query = query.to_lowercase();
        let map = if language == "russian" {
            &self.russian_keywords
        } else {
            &self.english_keywords
        };
        
        let mut results: Vec<(String, Vec<String>)> = Vec::new();
        
        // First look for exact matches
        if let Some(emojis) = map.get(&query) {
            results.push((query.clone(), emojis.clone()));
        }
        
        // Then look for prefix matches
        for (keyword, emojis) in map {
            if keyword.starts_with(&query) && keyword != &query {
                results.push((keyword.clone(), emojis.clone()));
            }
        }
        
        // Convert results to JSON
        if let Ok(json) = serde_json::to_string(&results) {
            json
        } else {
            "[]".to_string()
        }
    }
}
