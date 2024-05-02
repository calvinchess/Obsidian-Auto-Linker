import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';


function GetFileText(file: string){
	let text = "";
	try {
		text = fs.readFileSync(file, "utf-8");
	}
	catch(e) {
		text = e.message;
	}
	

	return text;
}

function UpdateFileText(file: string, text: string){
	fs.writeFileSync(file, text);
}

let allFiles: string[] = [];
function FindAllMarkdownFiles(dir: string) {

	let files = fs.readdirSync(dir, {withFileTypes: true});
	for(let i = 0; i < files.length;i++) {
		if(files[i].isDirectory() && files[i].name !== ".obsidian") {
			FindAllMarkdownFiles(path.join(dir, files[i].name));
		}
		else {
			if(files[i].name.endsWith(".md")){
				allFiles.push(path.join(dir, files[i].name));
			}
			
		}
	}
}

let links: Map<string, Array<string>> = new Map<string, Array<string>>();


function FindAllInstancesOf(text: string, key: string){
	let instances = [];
	for(let i = 0; i < text.length - key.length + 1;i++){
		if(text.substring(i, i + key.length) === key) {
			instances.push(i);
		}
	}

	return instances;
}

function FindAllLinksAndAliases(text: string){
	let all_link_starts = FindAllInstancesOf(text, "[[");
    let all_link_ends = FindAllInstancesOf(text, "]]"); 

    for(let i = 0;i < all_link_starts.length;i++){
		let link = text.substring(all_link_starts[i] + 2, all_link_ends[i]);
		if(link.contains('|')){
			let actual_link = link.split('|')[0]
            let alias = link.split('|')[1]

			if(!links.has(actual_link)) {
				links.set(actual_link,[alias]);
			}
			else if(links.get(actual_link)?.contains(alias)){
				//do nothing
			}
			else {
				links.get(actual_link)?.push(alias);
			}
		}
		else {
			if(!links.has(link)){
				links.set(link, []);
			}
		}
	}
}

function AlreadyLinked(starts: Array<number>, ends: Array<number>, index: number){
	for(let i = 0;i < starts.length;i++) {
		if(index >= starts[i] && index <= ends[i]) {
			return true;
		}
	}
	return false;
}
    
let unregistered_links: Array<Array<any>> = [];
function FindUnregisteredLinks(file: string, text: string){
	let all_link_starts = FindAllInstancesOf(text, "[[");
	let all_link_ends = FindAllInstancesOf(text, "]]");

	for(let key of Array.from(links.keys()) ) {
		let all_keys = FindAllInstancesOf(text, key);

		for(let i = 0;i < all_keys.length;i++) {
			if(!AlreadyLinked(all_link_starts, all_link_ends, all_keys[i])) {
				let start = all_keys[i] - 80;
				let end = all_keys[i] + key.length + 80;

				if(start < 0) start = 0;
				if(end > text.length) end = text.length;

				unregistered_links.push([file, key, key, text.substring(start, all_keys[i]), key, text.substring(all_keys[i] + key.length, end), all_keys[i], false]);
			}
		}

		//@ts-ignore
		for(let x = 0; x < links.get(key).length;x++) {
			//@ts-ignore
			let alias = links.get(key)[x];

			all_keys = FindAllInstancesOf(text, alias);
			for(let i = 0;i < all_keys.length;i++) {
				if(!AlreadyLinked(all_link_starts, all_link_ends, all_keys[i])) {
					let start = all_keys[i] - 80;
					let end = all_keys[i] + alias.length + 80;
	
					if(start < 0) start = 0;
					if(end > text.length) end = text.length;
	
					unregistered_links.push([file, alias, key, text.substring(start, all_keys[i]), alias, text.substring(all_keys[i] + alias.length, end), all_keys[i], false]);
				}
			}
		}
	}
}

function UpdateReference(broken_link: Array<any>) {
	let fileText = GetFileText(broken_link[0]);

	let linkIndex = broken_link[6];

	let offset = 4;

	if(broken_link[1] === broken_link[2]) {
		fileText = fileText.substring(0, linkIndex) + "[[" + broken_link[1] + "]]" + fileText.substring(linkIndex + broken_link[1].length);
	}
	else {
		fileText = fileText.substring(0, linkIndex) + "[[" + broken_link[2] + "|" + broken_link[1] + "]]" + fileText.substring(linkIndex + broken_link[2].length);
		offset += 1 + broken_link[2].length;
	}

	UpdateFileText(broken_link[0], fileText);

	//update the text index for the other unregistered links on this page
	for(let i = 0; i < unregistered_links.length;i++){
		if(broken_link[0] === unregistered_links[i][0] && unregistered_links[i][6] > broken_link[6]) {
			unregistered_links[i][6] += offset;
		}
	}
}















// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Run Auto Linker', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			

			//@ts-ignore
			let basePath = this.app.vault.adapter.basePath + "\\";

			links = new Map<string, string[]>();
			allFiles = [];
			unregistered_links = [];

			FindAllMarkdownFiles(basePath);

			for(let i = 0;i < allFiles.length;i++) {
				let text = GetFileText(allFiles[i]);
				FindAllLinksAndAliases(text);
			}

			for(let i = 0; i < allFiles.length;i++) {
				let text = GetFileText(allFiles[i]);
				FindUnregisteredLinks(allFiles[i], text);
			}
			

			new AddLinkModal(this.app, "").open();
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'run-auto-linker',
			name: 'Run Auto Linker',
			callback: () => {
				new SampleModal(this.app, "Woah!").open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app, "Woah!").open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	text: string;
	constructor(app: App, test: string) {
		super(app);
		this.text = test;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText(this.text);
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class AddLinkModal extends Modal {
	text: string;
	constructor(app: App, test: string) {
		super(app);
		this.text = test;
	}

	onOpen() {
		//@ts-ignore
		let basePath = this.app.vault.adapter.basePath + "\\";

		const {contentEl} = this;
		contentEl.createEl("h1", { text: "Unregistered Links: " + unregistered_links.length });

		for(let i = 0; i < unregistered_links.length; i++) {
			contentEl.createEl("h3", {text:unregistered_links[i][0].substring(basePath.length)});
			contentEl.createEl("span", {text:unregistered_links[i][3]});
			contentEl.createEl("span", {text:unregistered_links[i][4], cls:"highlight"});
			contentEl.createEl("span", {text:unregistered_links[i][5]});

			new Setting(contentEl)
			.setName("Is \'" + unregistered_links[i][1] + "\' supposed to reference the page \'" + unregistered_links[i][2] + "\' ?")
			.addToggle((checkbox) =>
				checkbox.onChange((value) => {
				//this.result = value
				unregistered_links[i][7] = value;
        	}));
		}

		new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Submit")
          .setCta()
          .onClick(() => {
            this.close();
            this.onSubmit();
          }));
	}

	onSubmit() {
		for(let i = 0; i < unregistered_links.length;i++) {
			if(unregistered_links[i][7]) {
				UpdateReference(unregistered_links[i]);
			}
		}
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
