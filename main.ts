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
import emojiDataEnglish from "./emoji_data_english.json";
import emojiDataRussian from "./emoji_data_russian.json";
import wasmDataUrl from "./pkg/emoji_search_bg.wasm";

// --- Type Definitions ---

interface EmojiSearchWasm {
	new(): EmojiSearch;
}

interface InitOutput {
	EmojiSearch: EmojiSearchWasm;
}

interface EmojiSuggesterPluginSettings {
	defaultLanguage: string;
	triggerChar: string;
	showKeywords: boolean;
	emojiPopularity: Record<string, number>;
}

const DEFAULT_SETTINGS: EmojiSuggesterPluginSettings = {
	defaultLanguage: 'english',
	triggerChar: ':',
	showKeywords: true, // default to showing keywords
	emojiPopularity: {}, // empty ranking
};


const RANDOM_EMOJIS = ['😀', '😂', '🥰', '😎', '🤔', '👍', '🎉', '✨', '🔥', '❤️'];

async function loadEmojiData() {
	// The JSON is already inlined as objects
	return { english: emojiDataEnglish, russian: emojiDataRussian };
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
			const emojiData = await loadEmojiData();
			this.emojiSearch.initialize(JSON.stringify(emojiData));
			console.log('WASM initialized successfully with emoji data');
			// Register editor suggestions using our custom suggester
			this.registerEditorSuggest(new EmojiSuggester(this.app, this, this.emojiSearch));

			// Uncomment to have a success notice:
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

			const wasmResponse = await fetch(wasmDataUrl as unknown as string);;
			if (!wasmResponse.ok) {
				throw new Error(`Failed to fetch WASM from ${wasmDataUrl}: ${wasmResponse.statusText}`);
			}
			const wasmBytes = await wasmResponse.arrayBuffer();

			return await wasmModule.default(wasmBytes);
		} catch (error) {
			console.error('Error loading WASM module:', error);
			throw error;
		}
	}

	onunload() {
		// freeing WASM resources
		if (this.emojiSearch) {
			this.emojiSearch.free();
		}
	}

	async loadSettings() {
		this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData() || {}) };
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class EmojiSuggester extends EditorSuggest<string> {
	private emojiSearch: EmojiSearch;
	private settings: EmojiSuggesterPluginSettings;
	private plugin: EmojiSuggesterPlugin;

	constructor(app: App, plugin: EmojiSuggesterPlugin, emojiSearch: EmojiSearch) {
		super(app);
		this.plugin = plugin;
		this.emojiSearch = emojiSearch;
		this.settings = plugin.settings;
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
		const language = /[а-яА-Я]/.test(context.query)
			? 'russian'
			: this.settings.defaultLanguage;

		try {
			const results: [string, string[]][] = JSON.parse(this.emojiSearch.search(context.query, language));
			const emojiMap = new Map<string, string>();
			for (const [keyword, emojis] of results) {
				for (const emoji of emojis) {
					if (!emojiMap.has(emoji)) {
						emojiMap.set(emoji, keyword);
					}
				}
			}

			const emojisWithKeywords = Array.from(emojiMap.entries());

			emojisWithKeywords.sort((a, b) => {
				const popA = this.plugin.settings.emojiPopularity[a[0]] || 0;
				const popB = this.plugin.settings.emojiPopularity[b[0]] || 0;
				return popB - popA; // Sort in descending order
			});

			if (this.settings.showKeywords) {
				return emojisWithKeywords.map(
					([emoji, keyword]) => `${emoji} (${keyword})`
				);
			} else {
				return emojisWithKeywords.map(([emoji, _]) => emoji);
			}
		} catch (error) {
			console.error('Error in emoji search:', error);
			return [];
		}
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.empty();
		if (this.settings.showKeywords) {
			// Render emoji with keyword (vertical list)
			const matches = value.match(/^(.*) \((.*)\)$/);
			if (matches) {
				const [, emoji, keyword] = matches;
				const container = document.createElement('div');
				container.addClass('emoji-suggestion-item');

				const emojiSpan = document.createElement('span');
				emojiSpan.addClass('emoji-suggestion-emoji');
				emojiSpan.textContent = emoji;

				const keywordSpan = document.createElement('span');
				keywordSpan.addClass('emoji-suggestion-keyword');
				keywordSpan.textContent = keyword;

				container.appendChild(emojiSpan);
				container.appendChild(keywordSpan);
				el.appendChild(container);
			} else {
				el.setText(value);
			}
		} else {
			// Render only the emoji
			const emojiSpan = document.createElement('span');
			emojiSpan.addClass('emoji-suggestion-emoji');
			emojiSpan.textContent = value;
			el.appendChild(emojiSpan);
		}
	}

	selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
		// When only emojis are shown, the value is the emoji itself.
		const emoji = this.settings.showKeywords ? value.split(' ')[0] : value;
		const { start, end } = this.context!;
		this.context!.editor.replaceRange(emoji, start, end);

		this.updateEmojiPopularity(emoji);
	}

	private updateEmojiPopularity(emoji: string): void {
		const settings = this.plugin.settings;

		if (!settings.emojiPopularity[emoji]) {
			settings.emojiPopularity[emoji] = 0;
		}
		settings.emojiPopularity[emoji]++;
		this.plugin.saveSettings();
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
		new Setting(containerEl)
			.setName('Show keywords in suggestions')
			.setDesc('Toggle whether to display the keyword alongside the emoji')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showKeywords)
				.onChange(async (value) => {
					this.plugin.settings.showKeywords = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Reset Emoji Popularity')
			.setDesc('Reset your emoji usage statistics')
			.addButton(button => button
				.setButtonText('Reset')
				.onClick(async () => {
					this.plugin.settings.emojiPopularity = {};
					await this.plugin.saveSettings();
					new Notice('Emoji popularity statistics have been reset');

					// Reset the rendered top 10 list
					const topEmojisEl = containerEl.querySelector('.emoji-popularity-stats');
					if (topEmojisEl) {
						topEmojisEl.removeChild(topEmojisEl.querySelector('.emoji-top-list')!);
						topEmojisEl.createEl('p', { text: 'No emojis used yet' });
					}
				}));

		// Display top 10 most used emojis
		const topEmojisEl = containerEl.createDiv();
		topEmojisEl.addClass('emoji-popularity-stats');
		topEmojisEl.createEl('h3', { text: 'Your Most Used Emojis' });

		const popularityEntries = Object.entries(this.plugin.settings.emojiPopularity);
		popularityEntries.sort((a, b) => b[1] - a[1]);

		if (popularityEntries.length === 0) {
			topEmojisEl.createEl('p', { text: 'No emojis used yet' });
		} else {
			const topList = topEmojisEl.createEl('div');
			topList.addClass('emoji-top-list');

			// Take top 10 or less
			const topEmojis = popularityEntries.slice(0, 10);
			for (const [emoji, count] of topEmojis) {
				const item = topList.createEl('div');
				item.addClass('emoji-top-item');

				const emojiSpan = item.createEl('span');
				emojiSpan.addClass('emoji-top-symbol');
				emojiSpan.textContent = emoji;

				const countSpan = item.createEl('span');
				countSpan.addClass('emoji-top-count');
				countSpan.textContent = `Used ${count} time${count !== 1 ? 's' : ''}`;
			}
		}
	}
}