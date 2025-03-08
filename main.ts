import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting
} from 'obsidian';
import init, { EmojiSearch } from './pkg/emoji_search_fixed.js';

// --- Type Definitions ---
type EmojiSearchResult = [string, string[]][];

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
};

const RANDOM_EMOJIS = ['😀', '😂', '🥰', '😎', '🤔', '👍', '🎉', '✨', '🔥', '❤️'];

// --- Helper Functions ---
function getResourceUrl(app: App, relativePath: string): string {
	return app.vault.adapter.getResourcePath(relativePath);
}

// --- Main Plugin Class ---
export default class EmojiSuggesterPlugin extends Plugin {
	settings: EmojiSuggesterPluginSettings;
	private emojiSearch: EmojiSearch | null = null;

	async onload() {
		await this.loadSettings();

		try {
			// Initialize WASM module using a binary fetch approach
			await this.loadWasmModule();

			// Create instance of EmojiSearch and initialize with emoji data
			this.emojiSearch = new EmojiSearch();
			const emojiData = await this.loadEmojiData();
			this.emojiSearch.initialize(JSON.stringify(emojiData));
			console.log('WASM initialized successfully with emoji data');
			// Register editor suggestions using our custom suggester
			this.registerEditorSuggest(new EmojiSuggester(this.app, this.emojiSearch, this.settings));

			// Uncomment if you want a success notice:
			// new Notice('Emoji Suggester plugin loaded successfully');
		} catch (error) {
			console.error('Failed to initialize WASM:', error);
			new Notice('Failed to initialize Emoji Suggester plugin');
		}

		// Add a settings tab for the plugin
		this.addSettingTab(new EmojiSuggesterSettingTab(this.app, this));

		// Create a ribbon icon with a tooltip
		const ribbonIconEl = this.addRibbonIcon('smile', 'Emoji Suggester', () => {
			new Notice(`Type "${this.settings.triggerChar}" followed by a keyword to suggest emojis`);
		});
		ribbonIconEl.addClass('emoji-suggester-ribbon-class');

		// Add command to insert a random emoji
		this.addCommand({
			id: 'insert-random-emoji',
			name: 'Insert random emoji',
			editorCallback: (editor: Editor) => {
				const randomEmoji = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)];
				editor.replaceSelection(randomEmoji);
			}
		});
	}

	async loadWasmModule(): Promise<InitOutput> {
		try {
			const wasmModule = await import('./pkg/emoji_search_fixed.js');
			const wasmUrl = getResourceUrl(this.app, `${this.manifest.dir}/pkg/emoji_search_bg.wasm`);

			// Fetch the WASM binary
			const wasmResponse = await fetch(wasmUrl);
			if (!wasmResponse.ok) {
				throw new Error(`Failed to fetch WASM from ${wasmUrl}: ${wasmResponse.statusText}`);
			}
			const wasmBytes = await wasmResponse.arrayBuffer();

			// Initialize the module (using the binary data)
			return await wasmModule.default(wasmBytes);
		} catch (error) {
			console.error('Error loading WASM module:', error);
			throw error;
		}
	}

	async loadEmojiData(): Promise<{ english: Record<string, string>; russian: Record<string, string> }> {
		try {
			const englishUrl = getResourceUrl(this.app, `${this.manifest.dir}/emoji_data_english.json`);
			const russianUrl = getResourceUrl(this.app, `${this.manifest.dir}/emoji_data_russian.json`);

			const [englishResponse, russianResponse] = await Promise.all([
				fetch(englishUrl),
				fetch(russianUrl)
			]);

			if (!englishResponse.ok || !russianResponse.ok) {
				throw new Error('Failed to load one or more emoji data files');
			}

			const [englishData, russianData] = await Promise.all([
				englishResponse.json(),
				russianResponse.json()
			]);

			return { english: englishData, russian: russianData };
		} catch (error) {
			console.error('Error loading emoji data:', error);
			throw error;
		}
	}

	onunload() {
		// Cleanup logic if necessary (e.g., freeing WASM resources)
	}

	async loadSettings() {
		// Using spread operator for clarity
		this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData() || {}) };
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// --- Editor Suggestion Class ---
class EmojiSuggester extends EditorSuggest<string> {
	private emojiSearch: EmojiSearch;
	private settings: EmojiSuggesterPluginSettings;

	constructor(app: App, emojiSearch: EmojiSearch, settings: EmojiSuggesterPluginSettings) {
		super(app);
		this.emojiSearch = emojiSearch;
		this.settings = settings;
	}

	onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
		const line = editor.getLine(cursor.line);
		const subString = line.substring(0, cursor.ch);
		const escapedTrigger = this.settings.triggerChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const triggerRegex = new RegExp(`${escapedTrigger}([a-zA-Zа-яА-Я ]*)$`);
		const match = subString.match(triggerRegex);
		if (!match) return null;

		return {
			start: { line: cursor.line, ch: subString.lastIndexOf(this.settings.triggerChar) },
			end: cursor,
			query: match[1]?.trim() || ''
		};
	}

	getSuggestions(context: EditorSuggestContext): string[] {
		if (!context.query || !this.emojiSearch) return [];

		// Determine language based on query content
		const language = /[а-яА-Я]/.test(context.query)
			? 'russian'
			: this.settings.defaultLanguage;

		try {
			const results: EmojiSearchResult = JSON.parse(this.emojiSearch.search(context.query, language));
			const emojiMap = new Map<string, string>();

			// Build a map with the first keyword for each unique emoji
			for (const [keyword, emojis] of results) {
				for (const emoji of emojis) {
					if (!emojiMap.has(emoji)) {
						emojiMap.set(emoji, keyword);
					}
				}
			}

			return Array.from(emojiMap.entries()).map(
				([emoji, keyword]) => `${emoji} (${keyword})`
			);
		} catch (error) {
			console.error('Error in emoji search:', error);
			return [];
		}
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		const matches = value.match(/^(.*) \((.*)\)$/);
		if (matches) {
			const [, emoji, keyword] = matches;
			const container = document.createElement('div');
			container.addClass('emoji-suggestion-item');

			const emojiSpan = document.createElement('span');
			emojiSpan.addClass('emoji-suggestion-emoji');
			emojiSpan.style.fontSize = '1.5em';
			emojiSpan.style.marginRight = '10px';
			emojiSpan.textContent = emoji;

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

	selectSuggestion(value: string): void {
		const { start, end } = this.context!;
		const emoji = value.split(' ')[0];
		this.context!.editor.replaceRange(emoji, start, end);
	}
}

// --- Plugin Setting Tab ---
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
