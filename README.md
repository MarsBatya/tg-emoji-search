# Obsidian Emoji Search Plugin

Based on a sample plugin for Obsidian (https://obsidian.md).

This project uses TypeScript to provide type checking and documentation, also Rust with WebAssembly to provide faster emoji search.
The repo depends on the latest plugin API (obsidian.d.ts) in TypeScript Definition format, which contains TSDoc comments describing what it does.

This plugin provides some basic functionality.
- Adds a command "Insert random emoji" which inserts a random emoji (another way to check that the plugin works)
- Allows to enter emojis using ":" and typing a keyword to paste emoji almost like it's done in Telegram

Keywords are indeed borrowed from translations on telegram (but for now it's hardcoded, so, changing things out there won't affect your plugin immediately)
1. Russian: https://translations.telegram.org/ru/emoji
2. English: https://translations.telegram.org/en/emoji
