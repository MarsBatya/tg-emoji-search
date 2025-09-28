# TG Emoji Search Plugin

![demo](https://github.com/user-attachments/assets/22517d21-6493-430e-bd03-3b2cc6f41f1e)

This plugin provides a fast and intuitive way to insert emojis into your Obsidian notes. By typing a trigger character (":" by default) followed by a keyword, you get an instant suggestion list of matching emojis, complete with optional keyword hints. The plugin also includes a command to insert a random emoji, plus it tracks your most used emojis.

## Features

1. **Telegram-Style Emoji Search**  
   - Type `:` followed by a keyword (e.g., `:love`) to see relevant emoji suggestions.
   - Keywords are based on Telegram translations in multiple languages (currently hardcoded).

2. **Multiple Language Support**  
   - Uses data inspired by Telegram’s emoji translations.
   - English keywords: ~4k, emojis: ~2k
   - Russian keywords: ~5k, emojis: ~2k
   - Spanish keywords: ~5k, emojis: ~2k
   - Total keywords: ~13k, emojis: ~2k

3. **Fast Performance with Rust + WebAssembly**  
   - The core emoji search is implemented in Rust, compiled to WebAssembly for speed.
   - TypeScript provides type safety and works seamlessly with the Obsidian plugin API.

4. **Custom emoji mappings**
   - Feel free to add or delete your own keyword, when you're not satisfied with existing ones
   - You can also reset these mappings easily

5. **Customizable Settings**  
   - **Default Language**: Choose which language’s keywords to use.
   - **Trigger Character**: Change the character that initiates the emoji search (default is `:`).
   - **Show Keywords in Suggestions**: Toggle the display of each emoji’s keyword in the suggestion list.
   - **Reset Emoji Popularity**: Clears out the plugin’s usage statistics if you want to start fresh.
   - **Your Most Used Emojis**: Shows the top 10 of most used emojis with this plugin by you.

## Usage

1. **Insert Emoji by Keyword**  
   - In any note, type `:` followed by a keyword (e.g., `:smile`).
   - A suggestion list of matching emojis appears.  
   - Press **Enter** or click on the desired emoji to insert it.

2. **Insert Random Emoji**  
   - Open the Command Palette (default shortcut: `Ctrl/Cmd + P`).
   - Search for **"Insert random emoji"**.
   - Run the command to insert a random emoji at your cursor position.

3. **Check Most Used Emojis**  
   - Go to the plugin’s settings page to see which emojis you’ve used the most.
   - Reset this data anytime using **Reset Emoji Popularity**.

## How It Works

- The plugin uses TypeScript to interface with Obsidian’s plugin API and manage settings, commands, and UI interactions.
- A Rust + WebAssembly module powers the emoji search for improved performance, especially when searching through a large set of emoji data.

## Acknowledgements

- Built on Obsidian’s sample plugin structure.
- Emoji keywords data is adapted from Telegram’s translations:
  - [Russian](https://translations.telegram.org/ru/emoji)  
  - [English](https://translations.telegram.org/en/emoji)
  - [Spanish](https://translations.telegram.org/es/emoji)

## Contributing

Contributions are welcome! Feel free to open an issue or a pull request if you have suggestions or would like to add more languages.

## License

This project is distributed under the [0BSD License](LICENSE).

---

Enjoy faster and friendlier emoji insertion in your Obsidian notes with the Obsidian "TG Emoji Search" Plugin!
