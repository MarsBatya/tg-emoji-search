use std::collections::HashMap;
use wasm_bindgen::prelude::*;

// Main structure to hold emoji data for multiple languages
#[wasm_bindgen]
pub struct EmojiSearch {
    // Maps language code to keyword->emojis mapping
    language_keywords: HashMap<String, HashMap<String, Vec<String>>>,
}

#[wasm_bindgen]
impl EmojiSearch {
    // Constructor
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            language_keywords: HashMap::new(),
        }
    }

    // Initialize with emoji data - can be called multiple times to reinitialize
    #[wasm_bindgen]
    pub fn initialize(&mut self, emoji_data_json: &str) -> Result<(), JsValue> {
        // Clear existing data for reinitialization
        self.language_keywords.clear();
        
        let emoji_data: serde_json::Value = serde_json::from_str(emoji_data_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse JSON: {}", e)))?;
        
        // Process the data - each top-level key is a language code
        if let Some(obj) = emoji_data.as_object() {
            for (language_code, language_data) in obj {
                if let Some(language_map) = language_data.as_object() {
                    let mut keyword_map = HashMap::new();
                    
                    for (keyword, emojis) in language_map {
                        if let Some(emoji_str) = emojis.as_str() {
                            let emoji_vec: Vec<String> = emoji_str
                                .split_whitespace()
                                .map(|s| s.to_string())
                                .collect();
                            keyword_map.insert(keyword.to_lowercase(), emoji_vec);
                        }
                    }
                    
                    self.language_keywords.insert(language_code.to_lowercase(), keyword_map);
                }
            }
        }
        
        Ok(())
    }

    // Add or update a specific language's keywords (useful for runtime updates)
    #[wasm_bindgen]
    pub fn update_language(&mut self, language_code: &str, language_data_json: &str) -> Result<(), JsValue> {
        let language_data: serde_json::Value = serde_json::from_str(language_data_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse JSON: {}", e)))?;
        
        if let Some(language_map) = language_data.as_object() {
            let mut keyword_map = HashMap::new();
            
            for (keyword, emojis) in language_map {
                if let Some(emoji_str) = emojis.as_str() {
                    let emoji_vec: Vec<String> = emoji_str
                        .split_whitespace()
                        .map(|s| s.to_string())
                        .collect();
                    keyword_map.insert(keyword.to_lowercase(), emoji_vec);
                }
            }
            
            self.language_keywords.insert(language_code.to_lowercase(), keyword_map);
        }
        
        Ok(())
    }

    // Remove a language entirely
    #[wasm_bindgen]
    pub fn remove_language(&mut self, language_code: &str) {
        self.language_keywords.remove(&language_code.to_lowercase());
    }

    // Search for emojis in a specific language
    #[wasm_bindgen]
    pub fn search(&self, query: &str, language: &str) -> String {
        let query = query.to_lowercase();
        let language = language.to_lowercase();
        
        let map = match self.language_keywords.get(&language) {
            Some(map) => map,
            None => return "[]".to_string(), // Language not found
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

    // Search across multiple languages (useful for multilingual users)
    #[wasm_bindgen]
    pub fn search_multiple(&self, query: &str, languages_json: &str) -> String {
        let query = query.to_lowercase();
        
        // Parse the languages array
        let languages: Result<Vec<String>, _> = serde_json::from_str(languages_json);
        let languages = match languages {
            Ok(langs) => langs,
            Err(_) => return "[]".to_string(),
        };
        
        let mut all_results: Vec<(String, Vec<String>)> = Vec::new();
        let mut seen_keywords = std::collections::HashSet::new();
        
        for language in languages {
            let language = language.to_lowercase();
            if let Some(map) = self.language_keywords.get(&language) {
                // First look for exact matches
                if let Some(emojis) = map.get(&query) {
                    if !seen_keywords.contains(&query) {
                        all_results.push((query.clone(), emojis.clone()));
                        seen_keywords.insert(query.clone());
                    }
                }
                
                // Then look for prefix matches
                for (keyword, emojis) in map {
                    if keyword.starts_with(&query) && keyword != &query && !seen_keywords.contains(keyword) {
                        all_results.push((keyword.clone(), emojis.clone()));
                        seen_keywords.insert(keyword.clone());
                    }
                }
            }
        }
        
        // Convert results to JSON
        if let Ok(json) = serde_json::to_string(&all_results) {
            json
        } else {
            "[]".to_string()
        }
    }

    // Get list of available languages
    #[wasm_bindgen]
    pub fn get_languages(&self) -> String {
        let languages: Vec<&String> = self.language_keywords.keys().collect();
        if let Ok(json) = serde_json::to_string(&languages) {
            json
        } else {
            "[]".to_string()
        }
    }

    // Get statistics about loaded data
    #[wasm_bindgen]
    pub fn get_stats(&self) -> String {
        let mut stats = HashMap::new();
        for (lang, keywords) in &self.language_keywords {
            stats.insert(lang, keywords.len());
        }
        
        if let Ok(json) = serde_json::to_string(&stats) {
            json
        } else {
            "{}".to_string()
        }
    }
}