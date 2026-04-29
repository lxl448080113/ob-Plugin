# Xiaohongshu Importer Plus

An Obsidian plugin for importing Xiaohongshu (小红书) notes into your vault with configurable default folders, configurable frontmatter fields, local image downloads, and video links.

## Features

- Import Xiaohongshu share text or note URLs directly into Obsidian
- Configure default note and image folders in plugin settings
- Configure frontmatter fields with editable order, enable state, and default values
- Support frontmatter placeholders: `{{date}}`, `{{title}}`, `{{source}}`, `{{videoUrl}}`
- Download note images into your vault and write Markdown image links back into the note
- Keep videos as remote links instead of downloading large media files

## Installation

### Manual install

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub Release.
2. Create a folder named `xhs-importer` under your vault's `.obsidian/plugins/`.
3. Copy the three files into that folder.
4. Reload Obsidian and enable **Xiaohongshu Importer Plus** in Community Plugins.

### GitHub Release install

1. Open the latest release in this repository.
2. Download the plugin assets or the bundled zip package.
3. Extract the files into `.obsidian/plugins/xhs-importer/`.
4. Reload Obsidian and enable the plugin.

## Configuration

The plugin settings page includes:

- **Default note folder**: where imported Markdown notes are created
- **Default image folder**: where downloaded images are saved
- **Download images**: toggle local image downloads on or off
- **Frontmatter Fields**: add, remove, reorder, enable, or disable frontmatter fields

The default frontmatter preset includes:

```yaml
---
aliases:
created: {{date}}
tags:
  - 类型/摘录
  - 状态/待加工
上级概念:
---
```

## Usage

1. Click the ribbon icon or run the command `Import Xiaohongshu note`.
2. Paste a Xiaohongshu share text snippet or direct note URL.
3. Choose whether to download images locally for this import.
4. The plugin creates a note with frontmatter,正文内容, and media links in your configured folders.

## Known limitations

- Parsing depends on the current Xiaohongshu page structure and embedded page data.
- If Xiaohongshu changes its frontend structure, title, content, image, or video parsing may need updates.
- Video notes currently store only a remote video link and optional cover image.

## Acknowledgements

This plugin is adapted from the original `xiaohongshu-importer` plugin by `bnchiang96`.
