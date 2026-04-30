# Release Notes

## Xiaohongshu Importer Plus 1.0.1

Patch release for image link stability after moving notes.

### Fixes

- Changed imported image links to use vault-absolute paths instead of relative paths
- Prevented imported image references from breaking after moving notes to a different folder

### Release assets

- `main.js`
- `manifest.json`
- `styles.css`

## Xiaohongshu Importer Plus 1.0.0

First public release of the customized Xiaohongshu importer for Obsidian.

### Highlights

- Added configurable default note and image folders
- Added configurable frontmatter field list with ordering and enable/disable controls
- Added frontmatter placeholders: `{{date}}`, `{{title}}`, `{{source}}`, `{{videoUrl}}`
- Keep video imports as remote links instead of downloading video files
- Improved image link handling for notes and attachments stored in different folders
- Prepared release metadata and repository structure for GitHub distribution

### Release assets

- `main.js`
- `manifest.json`
- `styles.css`
