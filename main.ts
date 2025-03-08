import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { EmojiSearch } from './pkg/emoji_search_fixed.js'

// Define interfaces for WebAssembly module
interface EmojiSearchWasm {
	new(): EmojiSearch;
}

interface InitOutput {
	EmojiSearch: EmojiSearchWasm;
}

interface EmojiSuggesterPluginSettings {
	defaultLanguage: string;
	triggerChar: string;
}

const DEFAULT_SETTINGS: EmojiSuggesterPluginSettings = {
	defaultLanguage: 'english',
	triggerChar: ':'
}

export default class EmojiSuggesterPlugin extends Plugin { 
	settings: EmojiSuggesterPluginSettings;
	private emojiSearch: EmojiSearch | null = null;

	async onload() {
		await this.loadSettings();

		try {
			// Load WebAssembly module directly using fetch
			await this.loadWasmModule();
			// Create instance of EmojiSearch

			this.emojiSearch = new EmojiSearch();

			// Load emoji data from JSON files
			const emojiData = await this.loadEmojiData();

			// Initialize the search with the loaded data
			this.emojiSearch.initialize(JSON.stringify(emojiData));
			console.log('WASM initialized successfully with emoji data');

			// Register editor suggestion
			this.registerEditorSuggest(new EmojiSuggester(this.app, this.emojiSearch, this.settings));

			// new Notice('Emoji Suggester plugin loaded successfully');
		} catch (error) {
			console.error('Failed to initialize WASM:', error);
			new Notice('Failed to initialize Emoji Suggester plugin');
		}

		// Add settings tab
		this.addSettingTab(new EmojiSuggesterSettingTab(this.app, this));

		// This creates an icon in the left ribbon
		const ribbonIconEl = this.addRibbonIcon('smile', 'Emoji Suggester', (evt: MouseEvent) => {
			new Notice('Type ":" followed by a keyword to suggest emojis');
		});
		ribbonIconEl.addClass('emoji-suggester-ribbon-class');

		// This adds a simple command to insert a random emoji
		this.addCommand({
			id: 'insert-random-emoji',
			name: 'Insert random emoji',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const randomEmojis = ['😀', '😂', '🥰', '😎', '🤔', '👍', '🎉', '✨', '🔥', '❤️'];
				const randomEmoji = randomEmojis[Math.floor(Math.random() * randomEmojis.length)];
				editor.replaceSelection(randomEmoji);
			}
		});
	}

	// Custom method to load WebAssembly module
	async loadWasmModule(): Promise<InitOutput> {
		try {
			// Import the modified JS file without import.meta
			const wasmModule = await import('./pkg/emoji_search_fixed.js');

			// Path to the .wasm file relative to plugin directory
			const wasmPath = this.app.vault.adapter.getResourcePath(
				`${this.manifest.dir}/pkg/emoji_search_bg.wasm`
			);
			
			// Fetch the .wasm file
			const wasmResponse = await fetch(wasmPath);
			if (!wasmResponse.ok) {
				throw new Error(`Failed to fetch WASM: ${wasmResponse.statusText}`);
			}
			const wasmBytes = await wasmResponse.arrayBuffer();

			// Initialize with the binary .
			return await wasmModule.default(wasmBytes);
		} catch (error) {
			console.error('Error loading WASM module:', error);
			throw error;
		}
	}

	async loadEmojiData(): Promise<{ english: Record<string, string>; russian: Record<string, string> }> {
		try {
			// Use fetch to load the JSON files from the plugin directory
			const englishResponse = await fetch(
				this.app.vault.adapter.getResourcePath(`${this.manifest.dir}/emoji_data_english.json`)
			);
			const russianResponse = await fetch(
				this.app.vault.adapter.getResourcePath(`${this.manifest.dir}/emoji_data_russian.json`)
			);

			if (!englishResponse.ok || !russianResponse.ok) {
				throw new Error('Failed to load emoji data files');
			}

			const englishData = await englishResponse.json();
			const russianData = await russianResponse.json();

			return {
				english: englishData,
				russian: russianData
			};
		} catch (error) {
			console.error('Error loading emoji data:', error);
			throw error;
		}
	}

	onunload() {
		console.log('Unloading emoji suggester plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class EmojiSuggester extends EditorSuggest<string> {
	private emojiSearch: EmojiSearch;
	private settings: EmojiSuggesterPluginSettings;

	constructor(app: App, emojiSearch: EmojiSearch, settings: EmojiSuggesterPluginSettings) {
		super(app);
		this.emojiSearch = emojiSearch;
		this.settings = settings;
	}

	onTrigger(cursor: EditorPosition, editor: Editor, file: any): EditorSuggestTriggerInfo | null {
		const line = editor.getLine(cursor.line);
		const subString = line.substring(0, cursor.ch);

		// Use the trigger character from settings
		const escapedTrigger = this.settings.triggerChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const triggerRegex = new RegExp(`${escapedTrigger}([a-zA-Zа-яА-Я ]*)$`);

		const match = subString.match(triggerRegex);
		if (!match) return null;

		return {
			start: {
				line: cursor.line,
				ch: subString.lastIndexOf(this.settings.triggerChar)
			},
			end: cursor,
			query: match[1] || ''
		};
	}

	getSuggestions(context: EditorSuggestContext): string[] {
		// Skip searching if the query is empty
		if (!context.query) return [];

		// Detect if the query contains Russian characters
		const isRussian = /[а-яА-Я]/.test(context.query);
		const language = isRussian ? "russian" : this.settings.defaultLanguage;

		try {
			// Call Rust WebAssembly search function
			const results = JSON.parse(this.emojiSearch.search(context.query, language));

			// Use a Map to track unique emojis and their first keyword
			const emojiMap = new Map<string, string>();

			for (const [keyword, emojis] of results) {
				for (const emoji of emojis) {
					if (!emojiMap.has(emoji)) {
						emojiMap.set(emoji, keyword);
					}
				}
			}

			// Return an array of formatted emoji strings
			return Array.from(emojiMap.entries()).map(
				([emoji, keyword]) => `${emoji} (${keyword})`
			);
		} catch (error) {
			console.error('Error in emoji search:', error);
			return [];
		}
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		// Extract emoji and keyword
		const matches = value.match(/^(.*) \((.*)\)$/);
		if (matches) {
			const emoji = matches[1];
			const keyword = matches[2];

			// Create a container for better styling
			const container = document.createElement('div');
			container.addClass('emoji-suggestion-item');

			// Add emoji with larger font
			const emojiSpan = document.createElement('span');
			emojiSpan.addClass('emoji-suggestion-emoji');
			emojiSpan.style.fontSize = '1.5em';
			emojiSpan.style.marginRight = '10px';
			emojiSpan.textContent = emoji;

			// Add keyword
			const keywordSpan = document.createElement('span');
			keywordSpan.addClass('emoji-suggestion-keyword');
			keywordSpan.style.opacity = '0.7';
			keywordSpan.textContent = keyword;

			container.appendChild(emojiSpan);
			container.appendChild(keywordSpan);

			el.appendChild(container);
		} else {
			el.setText(value);
		}
	}

	selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
		const { start, end } = this.context!;

		// Extract just the emoji from the value (remove the keyword part)
		const emoji = value.split(' ')[0];

		this.context!.editor.replaceRange(emoji, start, end);
	}
}

class EmojiSuggesterSettingTab extends PluginSettingTab {
	plugin: EmojiSuggesterPlugin;

	constructor(app: App, plugin: EmojiSuggesterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Emoji Suggester Settings' });

		new Setting(containerEl)
			.setName('Default Language')
			.setDesc('Choose the default language for emoji search')
			.addDropdown(dropdown => dropdown
				.addOption('english', 'English')
				.addOption('russian', 'Russian')
				.setValue(this.plugin.settings.defaultLanguage)
				.onChange(async (value) => {
					this.plugin.settings.defaultLanguage = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Trigger Character')
			.setDesc('Character that triggers the emoji suggestions')
			.addText(text => text
				.setPlaceholder(':')
				.setValue(this.plugin.settings.triggerChar)
				.onChange(async (value) => {
					if (value) {
						this.plugin.settings.triggerChar = value;
						await this.plugin.saveSettings();
					}
				}));
	}
}