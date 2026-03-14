# ChatGPT Team Archive

[简体中文](README.zh-CN.md)

A manual archive extension for ChatGPT on the web.

It is built for a simple but painful problem: if your ChatGPT account lives inside someone else's team workspace, you may lose access to important project conversations at any time. This project lets you manually save important chats into your own browser-local storage so you can keep browsing, searching, renaming, deleting, and exporting them later.

## What It Is

The current main version is extension-only.

It does not require:

- a local Node.js server
- a database
- a background command running on your machine

You only need to:

1. Load the extension in Edge or Chrome
2. Open a ChatGPT conversation
3. Click `记录当前聊天`
4. Use the built-in archive viewer to search, rename, delete, and export Markdown

## Features

- Manual-only archiving, no automatic recording of normal chats
- Repeated saves append new messages for the same conversation
- Custom archive titles
- Original titles preserved as secondary metadata
- Local archive viewer with search across projects, titles, and message content
- Export one conversation as Markdown
- Export one archive group as Markdown
- Delete a single archived conversation
- Delete an entire archive group

## Privacy and Storage

- All archive data is stored in the current browser's extension local storage
- Nothing is uploaded to a third-party server
- It does not rely on OpenAI's official export flow
- If you remove the extension, clear extension storage, or switch browser profiles, your local archive may be lost

If the archive is important, export it to Markdown regularly.

## Good Fit For

- People using ChatGPT inside someone else's team workspace
- Users worried about suddenly losing workspace access
- Anyone who wants to keep project chats under their own control
- People who only need save, browse, and export, not sync-back into ChatGPT

## Quick Start

See [SETUP.md](SETUP.md) for detailed setup steps.

Shortest path:

1. Open the extensions page in Edge or Chrome
2. Enable Developer Mode
3. Choose `Load unpacked`
4. Select `apps/extension`
5. Refresh the ChatGPT page once
6. Open the extension popup and manually record the current chat

## Project Structure

```text
apps/
  extension/
    manifest.json
    popup.html
    popup.js
    background.js
    content-script.js
    archive.html
    archive.js
    archive.css
docs/
  README.zh-CN.md
  README.en.md
  SETUP.md
```

The repository still contains some earlier local-service prototype folders, but the main user flow no longer depends on them.

## Development

There is no build step right now. Edit the extension source directly.

Basic checks:

```bash
npm test
```

Or:

```bash
node --check apps/extension/background.js
node --check apps/extension/content-script.js
node --check apps/extension/popup.js
node --check apps/extension/archive.js
```

## Sharing With Friends

The easiest way is to zip the `apps/extension` folder and send it directly.

After unpacking, they can:

1. Open the browser extensions page
2. Enable Developer Mode
3. Choose `Load unpacked`
4. Select the extension folder

## Limitations

- It depends on ChatGPT's current web structure and may need updates after UI changes
- Data lives only in the current local browser profile by default
- Cross-device sync is not implemented
- Full archive import/export is not implemented yet

## Roadmap

- Full archive export/import
- Trash and recovery
- More robust page parsing
- More export formats

## License

MIT
