import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, ButtonComponent, Platform } from 'obsidian';
import { getApi } from "@aidenlx/obsidian-icon-shortcodes"
// Note: node-emoji may not work on mobile devices as Node.js APIs aren't available on mobile
// We'll dynamically import it only on desktop platforms when needed


interface EmojiReplacerSettings {
	customEmojiMappings: { [emoji: string]: string }; // Maps emoji to icon shortcode
	enableDefaultIconSearch: boolean; // Toggle for the default emoji-to-icon conversion
}

const DEFAULT_SETTINGS: EmojiReplacerSettings = {
	customEmojiMappings: {},
	enableDefaultIconSearch: true
}

export default class EmojiReplacer extends Plugin {
	settings: EmojiReplacerSettings;
	isMobileDevice: boolean;
	emojiModule: any = null; // Cache for the dynamically imported node-emoji module

	async onload() {
		await this.loadSettings();
		this.isMobileDevice = Platform.isMobile;

		// Wait for layout to be ready before checking for dependencies
		this.app.workspace.onLayoutReady(() => {
			const iconSC = getApi();
			if (!iconSC) { 
				// Show modal explaining the dependency requirement
				new MissingDependencyModal(this.app).open();
				return; 
			}
			
			// Helper function to safely replace text with SVG icon
			const replaceTextWithIcon = async (textNode: Text, emoji: string, svg: HTMLElement) => {
				const text = textNode.textContent || "";
				const index = text.indexOf(emoji);
				if (index === -1) return false;

				// Create text nodes for content before and after the emoji
				const before = document.createTextNode(text.substring(0, index));
				const after = document.createTextNode(text.substring(index + emoji.length));

				// Insert the nodes in the correct order
				const parent = textNode.parentNode;
				if (parent) {
					parent.insertBefore(before, textNode);
					parent.insertBefore(svg.cloneNode(true), textNode);
					parent.insertBefore(after, textNode);
					parent.removeChild(textNode);
					return true;
				}
				return false;
			};

			// Helper function to process text nodes recursively
			const processTextNodes = async (node: Node) => {
				if (node.nodeType === Node.TEXT_NODE) {
					const text = node.textContent || "";
					for (const char of text) {
						// First check if we have a custom mapping for this emoji
						if (this.settings.customEmojiMappings[char]) {
							const customIconId = this.settings.customEmojiMappings[char];
							
							if (iconSC.hasIcon(customIconId)) {
								const svg = await iconSC.getSVGIcon(customIconId);
								if (svg && await replaceTextWithIcon(node as Text, char, svg as HTMLElement)) {
									break; // Exit loop after successful replacement
								}
							}
						}
						
						// Skip node-emoji functionality on mobile devices
						if (this.isMobileDevice) {
							continue;
						}
						
						// Fall back to default logic if enabled and no custom mapping or if custom mapping failed
						if (this.settings.enableDefaultIconSearch && iconSC.isEmoji(char)) {
							try {
								// Dynamically import node-emoji only when needed (on desktop)
								if (!this.emojiModule) {
									try {
										this.emojiModule = await import("node-emoji");
									} catch (importError) {
										console.error("Failed to import node-emoji:", importError);
										continue;
									}
								}
								
								const emojiData = this.emojiModule.find(char);
								if (emojiData) {
									const lucideId = `luc_${emojiData.key}`;
									if (iconSC.hasIcon(lucideId)) {
										const svg = await iconSC.getSVGIcon(lucideId);
										if (svg && await replaceTextWithIcon(node as Text, char, svg as HTMLElement)) {
											break; // Exit loop after successful replacement
										}
									}
								}
							} catch (error) {
								console.error("Error using node-emoji:", error);
							}
						}
					}
				} else {
					// Process child nodes recursively
					for (const child of Array.from(node.childNodes)) {
						await processTextNodes(child);
					}
				}
			};

			this.registerMarkdownPostProcessor((element) => {
				element.querySelectorAll("p, li, div").forEach(async (el) => {
					await processTextNodes(el);
				});
			});
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new EmojiReplacerSettingTab(this.app, this));
	}

	onunload() {
		// No resources to clean up
		// The plugin doesn't register any event handlers or create any DOM elements that need to be removed
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// Modal to show when the obsidian-icon-shortcodes plugin is not available
class MissingDependencyModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		
		// Add title
		contentEl.createEl('h2', {text: 'Missing Dependency'});
		
		// Add explanation
		contentEl.createEl('p', {
			text: 'The Emoji Replacer plugin requires the "Icon Shortcodes" plugin to function properly.'
		});
		
		contentEl.createEl('p', {
			text: 'Please install and enable the "Icon Shortcodes" plugin to use Emoji Replacer.'
		});
		
		// Add installation instructions
		const instructionsDiv = contentEl.createDiv({cls: 'missing-dependency-instructions'});
		instructionsDiv.createEl('h3', {text: 'Installation Instructions:'});
		
		const instructionsList = instructionsDiv.createEl('ol');
		instructionsList.createEl('li', {text: 'Open Obsidian Settings'});
		instructionsList.createEl('li', {text: 'Go to "Community plugins" tab'});
		instructionsList.createEl('li', {text: 'Turn off "Restricted mode" if enabled'});
		instructionsList.createEl('li', {text: 'Click "Browse" to open the community plugins browser'});
		instructionsList.createEl('li', {text: 'Search for "Icon Shortcodes"'});
		instructionsList.createEl('li', {text: 'Click "Install" and then "Enable"'});
		
		// Add button to close the modal
		const footerDiv = contentEl.createDiv({cls: 'missing-dependency-footer'});
		
		new ButtonComponent(footerDiv)
			.setButtonText('Close')
			.onClick(() => {
				this.close();
			});
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class EmojiReplacerSettingTab extends PluginSettingTab {
	plugin: EmojiReplacer;

	constructor(app: App, plugin: EmojiReplacer) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
		
		// CSS styles are now in styles.css

		// General settings are at the top without a heading

		new Setting(containerEl)
			.setName('Enable default icon search')
			.setDesc('When enabled, the plugin will automatically try to find matching icons for emojis based on their shortcodes. Disable this if you only want to use your custom mappings.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDefaultIconSearch)
				.onChange(async (value) => {
					this.plugin.settings.enableDefaultIconSearch = value;
					await this.plugin.saveSettings();
				}));
		
		// Add mobile compatibility notice
		if (Platform.isMobile) {
			const mobileNotice = containerEl.createEl('div', {
				cls: 'emoji-mobile-notice',
				attr: { 
					style: 'background-color: var(--background-modifier-border); padding: 10px; border-radius: 5px; margin-top: 10px; margin-bottom: 10px;' 
				}
			});
			
			mobileNotice.createEl('p', {
				text: 'Note: Default icon search is disabled on mobile devices because node-emoji requires Node.js APIs that are not available on mobile platforms. Only custom emoji mappings will work on mobile devices.',
				attr: { style: 'margin: 0; color: var(--text-normal);' }
			});
		}


		// Custom mappings section
		new Setting(containerEl).setName('Custom mappings').setHeading();
		containerEl.createEl('p', {text: 'Define custom mappings between emojis and icon shortcodes. This allows you to replace specific emojis with icons of your choice.'});

		// Display existing mappings
		const mappingsContainer = containerEl.createDiv('emoji-mappings-container');
		
		// Function to refresh the mappings display
		const refreshMappings = () => {
			// Clear the container
			mappingsContainer.empty();
			
			// Add each mapping
			const mappings = this.plugin.settings.customEmojiMappings;
			const keys = Object.keys(mappings);
			
			if (keys.length === 0) {
				mappingsContainer.createEl('p', {
					text: 'No custom mappings defined yet. Add one below.',
					cls: 'emoji-no-mappings',
					attr: { style: 'font-style: italic;' }
				});
			} else {
				// Create a table for the mappings
				const table = mappingsContainer.createEl('table', {
					cls: 'emoji-mappings-table'
				});
				
				// Add header row
				const headerRow = table.createEl('tr');
				headerRow.createEl('th', {text: 'Emoji', cls: 'emoji-emoji-cell'});
				headerRow.createEl('th', {text: 'Icon shortcode', cls: 'emoji-shortcode-cell'});
				headerRow.createEl('th', {text: 'Icon preview', cls: 'emoji-icon-cell'});
				headerRow.createEl('th', {text: 'Actions', cls: 'emoji-actions-cell'});
				
				// Add each mapping as a row
				keys.forEach(async emoji => {
					const row = table.createEl('tr');
					row.createEl('td', {text: emoji, cls: 'emoji-emoji-cell'});
					row.createEl('td', {text: mappings[emoji], cls: 'emoji-shortcode-cell'});
					
					// Icon preview cell
					const iconCell = row.createEl('td', {cls: 'emoji-icon-cell'});
					
					// Try to get the icon and display it
					const iconSC = getApi();
					if (iconSC && iconSC.hasIcon(mappings[emoji])) {
						const svg = await iconSC.getSVGIcon(mappings[emoji]);
						if (svg) {
							iconCell.appendChild(svg);
						} else {
							iconCell.setText('(Icon not found)');
						}
					} else {
						iconCell.setText('(Icon not found)');
					}
					
					const actionsCell = row.createEl('td', {cls: 'emoji-actions-cell'});
					const deleteButton = actionsCell.createEl('button', {
						text: 'Delete',
						cls: 'emoji-delete-button'
					});
					
					deleteButton.addEventListener('click', async () => {
						delete this.plugin.settings.customEmojiMappings[emoji];
						await this.plugin.saveSettings();
						refreshMappings();
					});
				});
			}
		};
		
		// Initial display of mappings
		refreshMappings();
		
		// Add new mapping controls
		new Setting(containerEl).setName('Add new mapping').setHeading();
		
		// Create container for the new mapping inputs
		const newMappingContainer = containerEl.createDiv('emoji-new-mapping');
		
		// Variables to store the input components
		let emojiInput: HTMLInputElement;
		let iconInput: HTMLInputElement;
		
		// Emoji input
		new Setting(newMappingContainer)
			.setName('Emoji')
			.setDesc('Enter the emoji character you want to replace')
			.addText(text => {
				text.setPlaceholder('Emoji (e.g., 📅)');
				text.inputEl.onchange = (e: Event) => {
					emojiInput = text.inputEl;
				};
				emojiInput = text.inputEl;
			});
		
		// Icon shortcode input with picker
		const iconSetting = new Setting(newMappingContainer)
			.setName('Icon shortcode')
			.setDesc('Enter the icon shortcode to use as replacement');
			
		// Add icon picker button first
		iconSetting.addButton(button => button
			.setButtonText('Pick icon')
			.onClick(async () => {
				const iconSC = getApi();
				if (!iconSC) {
					new Notice('Icon Shortcodes API not available');
					return;
				}
				
				// Use the API to get an icon from the user
				const iconInfo = await iconSC.getIconFromUser();
				if (iconInfo) {
					// Set the selected icon ID in the input field
					iconInput.value = iconInfo.id;
				}
			})
		);
		
		// Then add the text field
		iconSetting.addText(text => {
			text.setPlaceholder('e.g., luc_calendar');
			text.inputEl.onchange = (e: Event) => {
				iconInput = text.inputEl;
			};
			iconInput = text.inputEl;
		});
		
		// Add button
		new Setting(newMappingContainer)
			.addButton(button => button
				.setButtonText('Add mapping')
				.onClick(async () => {
					const emoji = emojiInput.value;
					const iconId = iconInput.value;
					
					if (!emoji || !iconId) {
						// Show error if either field is empty
						new Notice('Both emoji and icon shortcode are required');
						return;
					}

					// Check if the input is a valid emoji using Icon Shortcodes API
					const iconSC = getApi();
					if (!iconSC || !iconSC.isEmoji(emoji)) {
						new Notice('Please enter a valid emoji character');
						return;
					}

					// Check if it's a single emoji by trying to find another emoji after the first one
					let remainingText = emoji;
					let foundEmoji = false;
					for (const char of emoji) {
						if (iconSC.isEmoji(char)) {
							if (foundEmoji) {
								new Notice('Please enter only one emoji');
								return;
							}
							foundEmoji = true;
							remainingText = remainingText.slice(char.length);
						}
					}
					
					// Add the mapping
					this.plugin.settings.customEmojiMappings[emoji] = iconId;
					await this.plugin.saveSettings();
					
					// Clear the inputs
					emojiInput.value = '';
					iconInput.value = '';
					
					// Refresh the mappings display
					refreshMappings();
				})
			);
	}
}
