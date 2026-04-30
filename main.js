/*
 * Xiaohongshu Importer plugin
 * Customized for local vault workflow
 */

const {
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  normalizePath,
  requestUrl,
} = require("obsidian");

const DEFAULT_SETTINGS = {
  noteFolder: "00.收集箱",
  imageFolder: "附件/XHS",
  downloadMedia: true,
  frontmatterFields: [],
};

function createFieldId() {
  return `field-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createDefaultFrontmatterFields() {
  return [
    {
      id: createFieldId(),
      key: "aliases",
      value: "",
      enabled: true,
      order: 0,
    },
    {
      id: createFieldId(),
      key: "created",
      value: "{{date}}",
      enabled: true,
      order: 1,
    },
    {
      id: createFieldId(),
      key: "tags",
      value: "- 类型/摘录\n- 状态/待加工",
      enabled: true,
      order: 2,
    },
    {
      id: createFieldId(),
      key: "上级概念",
      value: "",
      enabled: true,
      order: 3,
    },
  ];
}

function splitVaultPath(vaultPath) {
  if (!vaultPath || vaultPath === ".") {
    return [];
  }

  return vaultPath.split("/").filter(Boolean);
}

function getVaultDirname(vaultPath) {
  const parts = splitVaultPath(vaultPath);
  if (parts.length <= 1) {
    return "";
  }

  return parts.slice(0, -1).join("/");
}

function getVaultBasename(vaultPath) {
  const parts = splitVaultPath(vaultPath);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

function getRelativeVaultPath(fromDirectory, toPath) {
  const fromParts = splitVaultPath(fromDirectory);
  const toParts = splitVaultPath(toPath);

  let sharedIndex = 0;
  while (
    sharedIndex < fromParts.length &&
    sharedIndex < toParts.length &&
    fromParts[sharedIndex] === toParts[sharedIndex]
  ) {
    sharedIndex += 1;
  }

  const upSegments = new Array(fromParts.length - sharedIndex).fill("..");
  const downSegments = toParts.slice(sharedIndex);
  const segments = upSegments.concat(downSegments);

  return segments.length > 0 ? segments.join("/") : getVaultBasename(toPath);
}

class XiaohongshuImporterPlugin extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addRibbonIcon("book", "Import Xiaohongshu note", async () => {
      const result = await this.promptForShareText();
      if (!result || !result.text) {
        return;
      }

      const url = this.extractURL(result.text);
      if (!url) {
        new Notice("No valid Xiaohongshu URL found in the text.");
        return;
      }

      await this.importXHSNote(url, result.downloadMedia);
    });

    this.addCommand({
      id: "import",
      name: "Import Xiaohongshu note",
      callback: async () => {
        const result = await this.promptForShareText();
        if (!result || !result.text) {
          return;
        }

        const url = this.extractURL(result.text);
        if (!url) {
          new Notice("No valid Xiaohongshu URL found in the text.");
          return;
        }

        await this.importXHSNote(url, result.downloadMedia);
      },
    });

    this.addSettingTab(new XiaohongshuSettingTab(this.app, this));
  }

  normalizeFrontmatterFields(fields) {
    const safeFields = Array.isArray(fields) && fields.length > 0 ? fields : createDefaultFrontmatterFields();

    return safeFields
      .map((field, index) => ({
        id: field?.id || createFieldId(),
        key: typeof field?.key === "string" ? field.key : "",
        value: typeof field?.value === "string" ? field.value : "",
        enabled: field?.enabled !== false,
        order: Number.isInteger(field?.order) ? field.order : index,
      }))
      .sort((left, right) => left.order - right.order)
      .map((field, index) => ({
        ...field,
        order: index,
      }));
  }

  async loadSettings() {
    const loadedSettings = (await this.loadData()) || {};
    let shouldSave = false;

    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);

    if (!Array.isArray(loadedSettings.frontmatterFields) || loadedSettings.frontmatterFields.length === 0) {
      this.settings.frontmatterFields = createDefaultFrontmatterFields();
      shouldSave = true;
    } else {
      const normalizedFields = this.normalizeFrontmatterFields(loadedSettings.frontmatterFields);
      this.settings.frontmatterFields = normalizedFields;

      const needsNormalization = normalizedFields.some((field, index) => {
        const originalField = loadedSettings.frontmatterFields[index] || {};
        return (
          field.id !== originalField.id ||
          field.order !== originalField.order ||
          field.key !== originalField.key ||
          field.value !== originalField.value ||
          field.enabled !== originalField.enabled
        );
      });

      shouldSave = shouldSave || needsNormalization;
    }

    if (typeof this.settings.noteFolder !== "string") {
      this.settings.noteFolder = DEFAULT_SETTINGS.noteFolder;
      shouldSave = true;
    }

    if (typeof this.settings.imageFolder !== "string") {
      this.settings.imageFolder = DEFAULT_SETTINGS.imageFolder;
      shouldSave = true;
    }

    if (typeof this.settings.downloadMedia !== "boolean") {
      this.settings.downloadMedia = DEFAULT_SETTINGS.downloadMedia;
      shouldSave = true;
    }

    if (shouldSave) {
      await this.saveSettings();
    }
  }

  async saveSettings() {
    this.settings.frontmatterFields = this.normalizeFrontmatterFields(this.settings.frontmatterFields);
    await this.saveData(this.settings);
  }

  async promptForShareText() {
    return new Promise((resolve) => {
      new XiaohongshuImportModal(this.app, this.settings, resolve).open();
    });
  }

  extractURL(text) {
    const shortLinkMatch = text.match(/http:\/\/xhslink\.com\/a?o?\/[^\s,，]+/);
    if (shortLinkMatch) {
      return shortLinkMatch[0];
    }

    const standardLinkMatch = text.match(
      /https:\/\/www\.xiaohongshu\.com\/(?:discovery\/item|explore)\/[a-zA-Z0-9]+(?:\?[^\s,，]*)?/,
    );
    if (!standardLinkMatch) {
      return null;
    }

    return standardLinkMatch[0].replace("/explore/", "/discovery/item/");
  }

  sanitizeFilename(text) {
    let sanitized = text.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s-_]/g, "").trim();
    sanitized = sanitized.replace(/\s+/g, "-");
    sanitized = sanitized.length > 0 ? sanitized : "Untitled";
    return sanitized.substring(0, 50);
  }

  sanitizeNoteFilename(text) {
    let sanitized = text.replace(/[/\\?%*:|"<>]/g, "-").trim();
    sanitized = sanitized.length > 0 ? sanitized : "Untitled";
    return sanitized.substring(0, 50);
  }

  async ensureFolder(folderPath) {
    const normalized = normalizePath(folderPath || "");
    if (!normalized) {
      return;
    }

    if (await this.app.vault.adapter.exists(normalized)) {
      return;
    }

    const parts = normalized.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await this.app.vault.adapter.exists(current))) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  buildVaultFilePath(folderPath, fileNameWithExtension) {
    if (!folderPath || folderPath.trim() === "") {
      return normalizePath(fileNameWithExtension);
    }

    return normalizePath(`${folderPath}/${fileNameWithExtension}`);
  }

  async getUniqueFilePath(folderPath, baseName, extension) {
    let candidate = this.buildVaultFilePath(folderPath, `${baseName}.${extension}`);
    let counter = 1;

    while (await this.app.vault.adapter.exists(candidate)) {
      candidate = this.buildVaultFilePath(folderPath, `${baseName}-${counter}.${extension}`);
      counter += 1;
    }

    return candidate;
  }

  async getUniqueMediaPath(folderPath, baseName, extension) {
    let candidate = this.buildVaultFilePath(folderPath, `${baseName}.${extension}`);
    let counter = 1;

    while (await this.app.vault.adapter.exists(candidate)) {
      candidate = this.buildVaultFilePath(folderPath, `${baseName}-${counter}.${extension}`);
      counter += 1;
    }

    return candidate;
  }

  getExtensionFromUrl(url, fallbackExtension) {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname || "";
      const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
      return match ? match[1].toLowerCase() : fallbackExtension;
    } catch (_error) {
      return fallbackExtension;
    }
  }

  async downloadMediaFile(url, folderPath, filenameBase, fallbackExtension) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const extension = this.getExtensionFromUrl(url, fallbackExtension);
      const targetPath = await this.getUniqueMediaPath(folderPath, filenameBase, extension);
      const bytes = await (await response.blob()).arrayBuffer();

      await this.app.vault.adapter.writeBinary(targetPath, bytes);
      return targetPath;
    } catch (error) {
      console.log(`Failed to download media from ${url}: ${error.message}`);
      new Notice(`Failed to download media: ${error.message}`);
      return url;
    }
  }

  toMarkdownAssetPath(vaultPath) {
    if (vaultPath.startsWith("http")) {
      return vaultPath;
    }

    return normalizePath(vaultPath);
  }

  buildPlaceholderContext({ title, source, date, videoUrl }) {
    return {
      date: date || "",
      title: title || "",
      source: source || "",
      videoUrl: videoUrl || "",
    };
  }

  replacePlaceholders(value, context) {
    return value.replace(/\{\{(date|title|source|videoUrl)\}\}/g, (_match, key) => context[key] || "");
  }

  buildFrontmatter(context) {
    const lines = ["---"];
    const fields = this.normalizeFrontmatterFields(this.settings.frontmatterFields).filter((field) => field.enabled);

    for (const field of fields) {
      const key = (field.key || "").trim();
      if (!key) {
        continue;
      }

      const resolvedValue = this.replacePlaceholders(field.value || "", context);
      if (resolvedValue.trim() === "") {
        lines.push(`${key}:`);
        continue;
      }

      if (resolvedValue.includes("\n")) {
        lines.push(`${key}:`);
        for (const line of resolvedValue.split("\n")) {
          lines.push(`  ${line}`);
        }
        continue;
      }

      lines.push(`${key}: ${resolvedValue}`);
    }

    lines.push("---");
    return `${lines.join("\n")}\n`;
  }

  async importXHSNote(url, downloadMedia) {
    try {
      const html = (await requestUrl({ url })).text;
      const title = this.extractTitle(html);
      const videoUrl = this.extractVideoUrl(html);
      const images = this.extractImages(html);
      const content = this.extractContent(html);
      const isVideo = this.isVideoNote(html);
      const today = new Date().toISOString().split("T")[0];

      const noteFolder = (this.settings.noteFolder || "").trim();
      const imageFolder = (this.settings.imageFolder || "").trim();
      await this.ensureFolder(noteFolder);
      if (downloadMedia) {
        await this.ensureFolder(imageFolder);
      }

      const sanitizedTitle = this.sanitizeFilename(title);
      const noteBaseName = this.sanitizeNoteFilename(isVideo ? `[V]${title}` : title);
      const notePath = await this.getUniqueFilePath(noteFolder, noteBaseName, "md");
      const frontmatterContext = this.buildPlaceholderContext({
        title,
        source: url,
        date: today,
        videoUrl,
      });

      let markdown = `${this.buildFrontmatter(frontmatterContext)}# ${title}\n\n`;

      if (isVideo) {
        if (images.length > 0) {
          let coverImage = images[0];
          if (downloadMedia) {
            const downloadedCover = await this.downloadMediaFile(
              images[0],
              imageFolder,
              `${sanitizedTitle}-cover`,
              "jpg",
            );
            coverImage = this.toMarkdownAssetPath(downloadedCover);
          }
          markdown += `[![Cover Image](${coverImage})](${url})\n\n`;
        }

        if (videoUrl) {
          markdown += `[Video Link](${videoUrl})\n\n`;
        } else {
          new Notice("Video URL not found; imported note with cover image only.");
        }

        const cleanedContent = content.replace(/#\S+/g, "").trim();
        markdown += `${cleanedContent.split("\n").join("\n")}\n\n`;

        const tags = this.extractTags(content);
        if (tags.length > 0) {
          markdown += "```\n";
          markdown += tags.map((tag) => `#${tag}`).join(" ");
          markdown += "\n```\n";
        }
      } else {
        let localImagePaths = [];
        if (images.length > 0) {
          if (downloadMedia) {
            for (let index = 0; index < images.length; index += 1) {
              const downloadedImage = await this.downloadMediaFile(
                images[index],
                imageFolder,
                `${sanitizedTitle}-${index}`,
                "jpg",
              );
              localImagePaths.push(this.toMarkdownAssetPath(downloadedImage));
            }
          } else {
            localImagePaths = images;
          }

          markdown += `![Cover Image](${localImagePaths[0]})\n\n`;
        }

        const cleanedContent = content.replace(/#[^#\s]*(?:\s+#[^#\s]*)*\s*/g, "").trim();
        markdown += `${cleanedContent.split("\n").join("\n")}\n\n`;

        const tags = this.extractTags(content);
        if (tags.length > 0) {
          markdown += "```\n";
          markdown += tags.map((tag) => `#${tag}`).join(" ");
          markdown += "\n```\n\n";
        }

        if (localImagePaths.length > 0) {
          markdown += `${localImagePaths.map((assetPath) => `![Image](${assetPath})`).join("\n")}\n`;
        }
      }

      const createdFile = await this.app.vault.create(notePath, markdown);
      await this.app.workspace.getLeaf(true).openFile(createdFile);
      await this.saveSettings();
      new Notice(`Imported Xiaohongshu note as ${notePath}`);
    } catch (error) {
      console.log(`Failed to import note from ${url}: ${error.message}`);
      new Notice(`Failed to import note: ${error.message}`);
    }
  }

  extractTitle(html) {
    const match = html.match(/<title>(.*?)<\/title>/);
    return match ? match[1].replace(" - 小红书", "") : "Untitled Xiaohongshu Note";
  }

  parseInitialState(html) {
    const match = html.match(/window\.__INITIAL_STATE__=(.*?)<\/script>/s);
    if (!match) {
      return null;
    }

    try {
      const json = match[1].trim().replace(/undefined/g, "null");
      return JSON.parse(json);
    } catch (error) {
      console.log(`Failed to parse initial state: ${error.message}`);
      return null;
    }
  }

  getNoteDetail(html) {
    const state = this.parseInitialState(html);
    if (!state?.note?.noteDetailMap) {
      return null;
    }

    const noteId = Object.keys(state.note.noteDetailMap)[0];
    return state.note.noteDetailMap[noteId]?.note || null;
  }

  extractImages(html) {
    const note = this.getNoteDetail(html);
    if (!note?.imageList) {
      return [];
    }

    return note.imageList
      .map((image) => image.urlDefault || "")
      .filter((imageUrl) => imageUrl && imageUrl.startsWith("http"));
  }

  extractVideoUrl(html) {
    const note = this.getNoteDetail(html);
    const video = note?.video;

    if (!video?.media?.stream) {
      return null;
    }

    if (video.media.stream.h264 && video.media.stream.h264.length > 0) {
      return video.media.stream.h264[0].masterUrl || null;
    }

    if (video.media.stream.h265 && video.media.stream.h265.length > 0) {
      return video.media.stream.h265[0].masterUrl || null;
    }

    return null;
  }

  extractContent(html) {
    const htmlMatch = html.match(/<div id="detail-desc" class="desc">([\s\S]*?)<\/div>/);
    if (htmlMatch) {
      return (
        htmlMatch[1]
          .replace(/<[^>]+>/g, "")
          .replace(/\[话题\]/g, "")
          .replace(/\[[^\]]+\]/g, "")
          .trim() || "Content not found"
      );
    }

    const note = this.getNoteDetail(html);
    if (!note?.desc) {
      return "Content not found";
    }

    return (
      note.desc
        .replace(/\[话题\]/g, "")
        .replace(/\[[^\]]+\]/g, "")
        .trim() || "Content not found"
    );
  }

  isVideoNote(html) {
    const note = this.getNoteDetail(html);
    return note?.type === "video";
  }

  extractTags(text) {
    return (text.match(/#\S+/g) || []).map((tag) => tag.replace("#", "").trim());
  }
}

class XiaohongshuSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async moveField(index, direction) {
    const fields = this.plugin.normalizeFrontmatterFields(this.plugin.settings.frontmatterFields);
    const targetIndex = index + direction;

    if (targetIndex < 0 || targetIndex >= fields.length) {
      return;
    }

    [fields[index], fields[targetIndex]] = [fields[targetIndex], fields[index]];
    this.plugin.settings.frontmatterFields = fields.map((field, order) => ({
      ...field,
      order,
    }));

    await this.plugin.saveSettings();
    this.display();
  }

  async deleteField(index) {
    const fields = this.plugin.normalizeFrontmatterFields(this.plugin.settings.frontmatterFields);
    fields.splice(index, 1);
    this.plugin.settings.frontmatterFields = fields.map((field, order) => ({
      ...field,
      order,
    }));
    await this.plugin.saveSettings();
    this.display();
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default note folder")
      .setDesc("Imported notes will use this folder by default.")
      .addText((text) =>
        text.setPlaceholder("00.收集箱").setValue(this.plugin.settings.noteFolder).onChange(async (value) => {
          this.plugin.settings.noteFolder = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Default image folder")
      .setDesc("Downloaded images will use this folder by default.")
      .addText((text) =>
        text.setPlaceholder("附件/XHS").setValue(this.plugin.settings.imageFolder).onChange(async (value) => {
          this.plugin.settings.imageFolder = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Download images")
      .setDesc("If enabled, note images are downloaded to the local vault. Videos remain remote links.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.downloadMedia).onChange(async (value) => {
          this.plugin.settings.downloadMedia = value;
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("h3", { text: "Frontmatter Fields" });
    containerEl.createEl("p", {
      text: "Supported placeholders: {{date}}, {{title}}, {{source}}, {{videoUrl}}.",
      cls: "xhs-frontmatter-hint",
    });

    const fields = this.plugin.normalizeFrontmatterFields(this.plugin.settings.frontmatterFields);
    fields.forEach((field, index) => {
      const fieldContainer = containerEl.createDiv({ cls: "xhs-field-setting" });

      new Setting(fieldContainer)
        .setName(`Field ${index + 1}`)
        .setDesc("Edit the field key, enable state, and order.")
        .addText((text) =>
          text.setPlaceholder("Field key").setValue(field.key).onChange(async (value) => {
            this.plugin.settings.frontmatterFields[index].key = value.trim();
            await this.plugin.saveSettings();
          }),
        )
        .addToggle((toggle) =>
          toggle.setTooltip("Enable field").setValue(field.enabled).onChange(async (value) => {
            this.plugin.settings.frontmatterFields[index].enabled = value;
            await this.plugin.saveSettings();
          }),
        )
        .addButton((button) =>
          button.setIcon("arrow-up").setTooltip("Move up").setDisabled(index === 0).onClick(async () => {
            await this.moveField(index, -1);
          }),
        )
        .addButton((button) =>
          button
            .setIcon("arrow-down")
            .setTooltip("Move down")
            .setDisabled(index === fields.length - 1)
            .onClick(async () => {
              await this.moveField(index, 1);
            }),
        )
        .addButton((button) =>
          button.setButtonText("Remove").setWarning().onClick(async () => {
            await this.deleteField(index);
          }),
        );

      const valueWrapper = fieldContainer.createDiv({ cls: "xhs-field-value-wrapper" });
      valueWrapper.createEl("label", {
        text: "Default value (raw YAML value, multiline supported)",
        cls: "xhs-field-value-label",
      });

      const textarea = valueWrapper.createEl("textarea", { cls: "xhs-field-value" });
      textarea.value = field.value;
      textarea.rows = Math.max(3, field.value.split("\n").length + 1);
      textarea.addEventListener("change", async () => {
        this.plugin.settings.frontmatterFields[index].value = textarea.value;
        await this.plugin.saveSettings();
      });
    });

    new Setting(containerEl).addButton((button) =>
      button.setButtonText("Add field").onClick(async () => {
        this.plugin.settings.frontmatterFields.push({
          id: createFieldId(),
          key: "newField",
          value: "",
          enabled: true,
          order: this.plugin.settings.frontmatterFields.length,
        });
        await this.plugin.saveSettings();
        this.display();
      }),
    );
  }
}

class XiaohongshuImportModal extends Modal {
  constructor(app, settings, onSubmit) {
    super(app);
    this.settings = settings;
    this.onSubmit = onSubmit;
    this.result = null;
    this.downloadMedia = settings.downloadMedia;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.addClass("xhs-modal-content");
    contentEl.createEl("h2", { text: "Import Xiaohongshu note" });

    const textRow = contentEl.createEl("div", { cls: "xhs-modal-row" });
    textRow.createEl("p", { text: "Paste the share text below:" });
    const textarea = textRow.createEl("textarea", {
      cls: "xhs-modal-textarea",
      attr: {
        placeholder: "e.g., 64 不叫小黄了发布了一篇小红书笔记...",
      },
    });

    const toggleWrapper = contentEl
      .createEl("div", { cls: ["xhs-modal-row", "xhs-download-row"] })
      .createEl("div", { cls: "xhs-download-wrapper" });

    const checkboxId = "download-media-checkbox";
    const checkbox = toggleWrapper.createEl("input", {
      attr: { type: "checkbox", id: checkboxId },
    });
    checkbox.checked = this.downloadMedia;
    checkbox.addEventListener("change", () => {
      this.downloadMedia = checkbox.checked;
    });

    toggleWrapper.createEl("label", {
      text: "Download images locally for this import",
      cls: "xhs-download-label",
      attr: { for: checkboxId },
    });

    contentEl
      .createEl("div", { cls: ["xhs-modal-row", "xhs-button-row"] })
      .createEl("button", { text: "Import", cls: "xhs-submit-button" })
      .addEventListener("click", () => {
        this.result = {
          text: textarea.value.trim(),
          downloadMedia: this.downloadMedia,
        };
        this.close();
      });

    textarea.addEventListener("keypress", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.result = {
          text: textarea.value.trim(),
          downloadMedia: this.downloadMedia,
        };
        this.close();
      }
    });
  }

  onClose() {
    this.onSubmit(this.result);
  }
}

module.exports = {
  default: XiaohongshuImporterPlugin,
};
