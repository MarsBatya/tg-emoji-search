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
import emojiDataSpanish from "./emoji_data_spanish.json";
import wasmDataUrl from "./pkg/emoji_search_bg.wasm";

// --- Type Definitions ---

interface EmojiSearchWasm {
	new(): EmojiSearch;
}

interface InitOutput {
	EmojiSearch: EmojiSearchWasm;
}

interface EmojiSuggesterPluginSettings {
	chosenLanguages: string[];
	triggerChar: string;
	showKeywords: boolean;
	emojiPopularity: Record<string, number>;
	customEmojiMappings: Record<string, string>;
}

const DEFAULT_SETTINGS: EmojiSuggesterPluginSettings = {
	chosenLanguages: ['english'],
	triggerChar: ':',
	showKeywords: true,
	emojiPopularity: {},
	customEmojiMappings: {},
};

const AVAILABLE_LANGUAGES = {
	english: 'English',
	russian: 'Russian',
	spanish: 'Spanish'
};

const RANDOM_EMOJIS = ['😀', '😂', '🥰', '😎', '🤔', '👍', '🎉', '✨', '🔥', '❤️'];

async function loadEmojiData() {
	// The JSON is already inlined as objects
	return { english: emojiDataEnglish, russian: emojiDataRussian, spanish: emojiDataSpanish };
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
			await this.reinitializeEmojiSearch();
			console.log('WASM initialized successfully with emoji data');
			// Register editor suggestions using our custom suggester
			this.registerEditorSuggest(new EmojiSuggester(this.app, this, this.emojiSearch));

			// Uncomment to have a success notice:
			// new Notice('Emoji Suggester plugin loaded successfully');
		} catch (error) {
			console.error('Failed to initialize WASM:', error);
			new Notice('Failed to initialize Emoji suggester plugin');
		}

		// Add a settings tab for the plugin
		this.addSettingTab(new EmojiSuggesterSettingTab(this.app, this));

		// Create a ribbon icon with a tooltip
		const ribbonIconEl = this.addRibbonIcon('smile', 'Emoji suggester', () => {
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

	async reinitializeEmojiSearch(): Promise<void> {
		if (!this.emojiSearch) return;

		const allEmojiData = await loadEmojiData();
		const filteredData: Record<string, any> = {};

		// Only include data for chosen languages
		for (const lang of this.settings.chosenLanguages) {
			if (allEmojiData[lang as keyof typeof allEmojiData]) {
				filteredData[lang] = allEmojiData[lang as keyof typeof allEmojiData];
			}
		}

		this.emojiSearch.initialize(JSON.stringify(filteredData));
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
		const loadedSettings = await this.loadData() || {};

		// Migration: convert old defaultLanguage to chosenLanguages
		if (loadedSettings.defaultLanguage && !loadedSettings.chosenLanguages) {
			loadedSettings.chosenLanguages = [loadedSettings.defaultLanguage];
			delete loadedSettings.defaultLanguage;
		}

		this.settings = { ...DEFAULT_SETTINGS, ...loadedSettings };
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Reinitialize emoji search when settings change
		if (this.emojiSearch) {
			await this.reinitializeEmojiSearch();
		}
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
		const triggerRegex = new RegExp(`${escapedTrigger}([a-zA-Zа-яА-Яñáéíóúü][a-zA-Zа-яА-Яñáéíóúü ]*)$`);
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

		try {
			// Search across all chosen languages
			// Detect language based on query characters and filter chosen languages
			const detectedLanguages = this.settings.chosenLanguages.filter(lang => {
				if (/[а-яА-Я]/.test(context.query)) {
					return lang === 'russian';
				} else if (/[ñáéíóúü¿¡]/.test(context.query)) {
					return lang === 'spanish';
				} else {
					// Default to non-Cyrillic languages for Latin script
					return lang !== 'russian';
				}
			});

			// If no languages match the detected script, fall back to all chosen languages
			const languagesToSearch = detectedLanguages.length > 0 ? detectedLanguages : this.settings.chosenLanguages;

			// Search only the filtered languages
			const results: [string, string[]][] = JSON.parse(
				this.emojiSearch.search_multiple(context.query, JSON.stringify(languagesToSearch))
			);
			const emojiMap = new Map<string, string>();

			// Add emojis from WASM search results
			for (const [keyword, emojis] of results) {
				for (const emoji of emojis) {
					if (!emojiMap.has(emoji)) {
						emojiMap.set(emoji, keyword);
					}
				}
			}

			// Add custom emoji mappings that match the query
			const query = context.query.toLowerCase();
			for (const [keyword, emoji] of Object.entries(this.plugin.settings.customEmojiMappings)) {
				if (keyword.toLowerCase().includes(query)) {
					emojiMap.set(emoji, keyword);
				}
			}

			const emojisWithKeywords = Array.from(emojiMap.entries());

			// Sort by popularity
			emojisWithKeywords.sort((a, b) => {
				const popA = this.plugin.settings.emojiPopularity[a[0]] || 0;
				const popB = this.plugin.settings.emojiPopularity[b[0]] || 0;
				return popB - popA;
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
		new Setting(containerEl).setName('General').setHeading();

		new Setting(containerEl)
			.setName('Chosen languages')
			.setDesc('Select which languages to enable for emoji search')
			.setClass('emoji-language-setting');

		// Create checkboxes for each available language
		const languageContainer = containerEl.createDiv('language-checkbox-container');

		for (const [langCode, langName] of Object.entries(AVAILABLE_LANGUAGES)) {
			const checkboxContainer = languageContainer.createDiv('language-checkbox-item');

			const checkbox = checkboxContainer.createEl('input');
			checkbox.type = 'checkbox';
			checkbox.id = `lang-${langCode}`;
			checkbox.checked = this.plugin.settings.chosenLanguages.includes(langCode);

			const label = checkboxContainer.createEl('label');
			label.setAttribute('for', `lang-${langCode}`);
			label.textContent = langName;

			checkbox.addEventListener('change', async (e) => {
				const target = e.target as HTMLInputElement;
				if (target.checked) {
					if (!this.plugin.settings.chosenLanguages.includes(langCode)) {
						this.plugin.settings.chosenLanguages.push(langCode);
					}
				} else {
					const index = this.plugin.settings.chosenLanguages.indexOf(langCode);
					if (index > -1) {
						this.plugin.settings.chosenLanguages.splice(index, 1);
					}
				}

				// Ensure at least one language is selected
				if (this.plugin.settings.chosenLanguages.length === 0) {
					this.plugin.settings.chosenLanguages.push('english');
					// Update the english checkbox
					const englishCheckbox = containerEl.querySelector('#lang-english') as HTMLInputElement;
					if (englishCheckbox) englishCheckbox.checked = true;
					new Notice('At least one language must be selected. English has been re-enabled.');
				}

				await this.plugin.saveSettings();
			});
		}

		new Setting(containerEl)
			.setName('Trigger character')
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

		// Add section for custom emoji mappings
		new Setting(containerEl).setName('Custom emoji mappings').setHeading();

		// Display existing custom mappings
		const customMappingsContainer = containerEl.createDiv('custom-emoji-mappings-container');
		this.renderCustomMappings(customMappingsContainer);

		// Add new mapping controls
		const newMappingContainer = containerEl.createDiv('new-emoji-mapping-container');

		const keywordInput = newMappingContainer.createEl('input');
		keywordInput.type = 'text';
		keywordInput.placeholder = 'Keyword';
		keywordInput.classList.add('custom-emoji-keyword-input');

		const emojiInput = newMappingContainer.createEl('input');
		emojiInput.type = 'text';
		emojiInput.placeholder = 'Emoji';
		emojiInput.classList.add('custom-emoji-input');

		const addButton = newMappingContainer.createEl('button');
		addButton.setText('Add');
		addButton.classList.add('custom-emoji-add-button');
		addButton.addEventListener('click', async () => {
			const keyword = keywordInput.value.trim();
			const emoji = emojiInput.value.trim();

			if (keyword && emoji) {
				this.plugin.settings.customEmojiMappings[keyword] = emoji;
				await this.plugin.saveSettings();

				// Clear inputs
				keywordInput.value = '';
				emojiInput.value = '';

				// Refresh the mappings display
				this.renderCustomMappings(customMappingsContainer);
				new Notice(`Added custom mapping: ${keyword} → ${emoji}`);
			} else {
				new Notice('Both keyword and emoji are required');
			}
		});

		// Reset Custom Mappings button
		new Setting(containerEl)
			.setName('Reset custom emoji mappings')
			.setDesc('Remove all your custom emoji mappings')
			.addButton(button => button
				.setButtonText('Reset')
				.onClick(async () => {
					this.plugin.settings.customEmojiMappings = {};
					await this.plugin.saveSettings();
					this.renderCustomMappings(customMappingsContainer);
					new Notice('Custom emoji mappings have been reset');
				}));


		new Setting(containerEl)
			.setName('Reset emoji popularity')
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
		topEmojisEl.createEl('h2', { text: 'Your most used emojis' });

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
	private renderCustomMappings(containerEl: HTMLElement): void {
		containerEl.empty();

		const mappings = this.plugin.settings.customEmojiMappings;
		const entries = Object.entries(mappings);

		if (entries.length === 0) {
			containerEl.createEl('p', { text: 'No custom emoji mappings yet' });
			return;
		}

		const table = containerEl.createEl('table');
		table.classList.add('custom-emoji-table');

		// Create header row
		const headerRow = table.createEl('tr');
		headerRow.createEl('th', { text: 'Keyword' });
		headerRow.createEl('th', { text: 'Emoji' });
		headerRow.createEl('th', { text: 'Action' });

		// Create rows for each mapping
		for (const [keyword, emoji] of entries) {
			const row = table.createEl('tr');
			row.createEl('td', { text: keyword });
			row.createEl('td', { text: emoji });

			const actionCell = row.createEl('td');
			const deleteButton = actionCell.createEl('button');
			deleteButton.setText('Delete');
			deleteButton.classList.add('custom-emoji-delete-button');
			deleteButton.addEventListener('click', async () => {
				delete this.plugin.settings.customEmojiMappings[keyword];
				await this.plugin.saveSettings();
				this.renderCustomMappings(containerEl);
				new Notice(`Removed custom mapping: ${keyword}`);
			});
		}
	}
}