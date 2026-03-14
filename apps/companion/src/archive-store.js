import { mkdir, readFile, writeFile, appendFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeConversationPayload,
  slugify,
  stableHash
} from "../../../packages/shared/src/archive-schema.js";
import {
  renderMarkdownTranscript,
  renderHtmlTranscript
} from "../../../packages/shared/src/transcript.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ARCHIVE_ROOT = path.resolve(__dirname, "../../../data/archive");

export class ArchiveStore {
  constructor(rootDir = process.env.CHATGPT_ARCHIVE_DIR || DEFAULT_ARCHIVE_ROOT) {
    this.rootDir = rootDir;
    this.indexDir = path.join(rootDir, "index");
    this.workspaceDir = path.join(rootDir, "workspaces");
    this.searchIndexPath = path.join(this.indexDir, "search-index.json");
  }

  async init() {
    await mkdir(this.indexDir, { recursive: true });
    await mkdir(this.workspaceDir, { recursive: true });

    if (!existsSync(this.searchIndexPath)) {
      await this.writeJson(this.searchIndexPath, {
        generatedAt: new Date().toISOString(),
        conversations: [],
        messages: []
      });
    }
  }

  async ingestConversation(payload) {
    const archive = normalizeConversationPayload(payload);
    const index = await this.readIndex();
    const existingRecord = index.conversations.find(
      (entry) => entry.conversation.id === archive.conversation.id
    );
    const conversationDir = existingRecord?.conversationDir || this.getConversationDir(archive);
    const assetDir = path.join(conversationDir, "assets");
    const snapshotDir = path.join(conversationDir, "snapshots");
    const manifestPath = path.join(conversationDir, "manifest.json");
    const messagesPath = path.join(conversationDir, "messages.jsonl");
    const transcriptMdPath = path.join(conversationDir, "transcript.md");
    const transcriptHtmlPath = path.join(conversationDir, "transcript.html");
    const existingManifest = await this.readJson(manifestPath, null);

    await mkdir(assetDir, { recursive: true });
    await mkdir(snapshotDir, { recursive: true });

    if (existingManifest?.conversation?.customTitle && !archive.conversation.customTitle) {
      archive.conversation.customTitle = existingManifest.conversation.customTitle;
      archive.conversation.title = existingManifest.conversation.title;
    }

    const existingMessages = await this.readJsonLines(messagesPath);
    const existingById = new Map(existingMessages.map((message) => [message.id, message]));
    const freshMessages = [];

    for (const message of archive.messages) {
      if (!existingById.has(message.id)) {
        freshMessages.push(message);
        await appendFile(messagesPath, JSON.stringify(message) + "\n", "utf8");
      }
    }

    const allMessages = [...existingMessages, ...freshMessages];
    archive.messages = allMessages;

    for (const asset of archive.assets) {
      await this.persistAsset(assetDir, asset);
    }

    const snapshotName = `${Date.now()}-${slugify(archive.conversation.sourceTitle, archive.conversation.id.slice(0, 12))}.json`;
    await this.writeJson(path.join(snapshotDir, snapshotName), archive);

    const manifest = {
      archiveVersion: archive.archiveVersion,
      workspace: archive.workspace,
      project: archive.project,
      conversation: archive.conversation,
      counts: {
        messages: allMessages.length,
        assets: archive.assets.length,
        snapshots: await this.countFiles(snapshotDir)
      },
      firstCapturedAt: existingManifest?.firstCapturedAt || archive.capturedAt,
      lastCapturedAt: archive.capturedAt,
      conversationDir
    };

    await this.writeJson(manifestPath, manifest);
    await writeFile(transcriptMdPath, renderMarkdownTranscript(archive), "utf8");
    await writeFile(transcriptHtmlPath, renderHtmlTranscript(archive), "utf8");

    await this.updateSearchIndex(archive, conversationDir);

    return {
      archive,
      manifest,
      newMessages: freshMessages.length,
      savedAssets: archive.assets.length
    };
  }

  async renameConversation(conversationId, customTitle) {
    const index = await this.readIndex();
    const record = index.conversations.find((entry) => entry.conversation.id === conversationId);
    if (!record) {
      return null;
    }

    const manifestPath = path.join(record.conversationDir, "manifest.json");
    const messagesPath = path.join(record.conversationDir, "messages.jsonl");
    const transcriptMdPath = path.join(record.conversationDir, "transcript.md");
    const transcriptHtmlPath = path.join(record.conversationDir, "transcript.html");

    const manifest = await this.readJson(manifestPath, null);
    const messages = await this.readJsonLines(messagesPath);
    if (!manifest) {
      return null;
    }

    const normalizedTitle = String(customTitle || "").trim();
    manifest.conversation.customTitle = normalizedTitle;
    manifest.conversation.title = normalizedTitle || manifest.conversation.sourceTitle || manifest.conversation.title;
    manifest.lastCapturedAt = new Date().toISOString();

    const archive = this.buildArchiveFromManifest(manifest, messages);

    await this.writeJson(manifestPath, manifest);
    await writeFile(transcriptMdPath, renderMarkdownTranscript(archive), "utf8");
    await writeFile(transcriptHtmlPath, renderHtmlTranscript(archive), "utf8");
    await this.updateSearchIndex(archive, record.conversationDir);

    return {
      manifest,
      messages
    };
  }

  async search(filters = {}) {
    const index = await this.readIndex();
    const query = String(filters.q || "").trim().toLowerCase();

    let conversations = index.conversations;
    let messages = index.messages;

    if (filters.workspace) {
      conversations = conversations.filter(
        (conversation) => conversation.workspace.slug === slugify(filters.workspace)
      );
      messages = messages.filter((message) => message.workspaceSlug === slugify(filters.workspace));
    }

    if (filters.project) {
      conversations = conversations.filter(
        (conversation) => conversation.project.slug === slugify(filters.project)
      );
      messages = messages.filter((message) => message.projectSlug === slugify(filters.project));
    }

    if (query) {
      conversations = conversations.filter((conversation) => conversation.searchText.includes(query));
      messages = messages.filter((message) => message.searchText.includes(query));
    }

    return {
      query,
      conversations,
      messages: messages.slice(0, 250)
    };
  }

  async getConversation(conversationId) {
    const index = await this.readIndex();
    const record = index.conversations.find(
      (conversation) => conversation.conversation.id === conversationId
    );

    if (!record) {
      return null;
    }

    const manifest = await this.readJson(path.join(record.conversationDir, "manifest.json"), null);
    const messages = await this.readJsonLines(path.join(record.conversationDir, "messages.jsonl"));

    return {
      manifest,
      messages
    };
  }

  async listProjects() {
    const index = await this.readIndex();
    const projects = new Map();

    for (const item of index.conversations) {
      const key = `${item.workspace.slug}:${item.project.slug}`;

      if (!projects.has(key)) {
        projects.set(key, {
          workspace: item.workspace,
          project: item.project,
          conversations: 0,
          lastCapturedAt: item.lastCapturedAt
        });
      }

      const entry = projects.get(key);
      entry.conversations += 1;

      if (!entry.lastCapturedAt || entry.lastCapturedAt < item.lastCapturedAt) {
        entry.lastCapturedAt = item.lastCapturedAt;
      }
    }

    return [...projects.values()].sort((a, b) =>
      `${a.workspace.name}/${a.project.name}`.localeCompare(`${b.workspace.name}/${b.project.name}`)
    );
  }

  async exportProject(workspaceSlug, projectSlug, format = "bundle") {
    const index = await this.readIndex();

    const conversations = index.conversations.filter(
      (entry) => entry.workspace.slug === workspaceSlug && entry.project.slug === projectSlug
    );

    const bundles = [];

    for (const conversation of conversations) {
      const manifest = await this.readJson(path.join(conversation.conversationDir, "manifest.json"), null);
      const messages = await this.readJsonLines(path.join(conversation.conversationDir, "messages.jsonl"));
      const transcriptMarkdown = await readFile(
        path.join(conversation.conversationDir, "transcript.md"),
        "utf8"
      );

      if (format === "normalized") {
        bundles.push({
          workspace: manifest.workspace,
          project: manifest.project,
          conversation: manifest.conversation,
          messages,
          transcriptMarkdown
        });
      } else {
        bundles.push({ manifest, messages, transcriptMarkdown });
      }
    }

    return {
      format,
      exportedAt: new Date().toISOString(),
      workspaceSlug,
      projectSlug,
      conversations: bundles
    };
  }

  getConversationDir(archive) {
    return path.join(
      this.workspaceDir,
      archive.workspace.slug,
      archive.project.slug,
      `${slugify(archive.conversation.sourceTitle, archive.conversation.id.slice(0, 12))}-${archive.conversation.id.slice(0, 12)}`
    );
  }

  buildArchiveFromManifest(manifest, messages) {
    return {
      archiveVersion: manifest.archiveVersion,
      capturedAt: manifest.lastCapturedAt,
      source: "chatgpt-extension",
      workspace: manifest.workspace,
      project: manifest.project,
      conversation: manifest.conversation,
      messages,
      assets: messages.flatMap((message) => message.attachments || []),
      raw: null
    };
  }

  async persistAsset(assetDir, asset) {
    const extension = guessExtension(asset);
    const safeName = slugify(asset.name.replace(/\.[^.]+$/, ""), `asset-${asset.id.slice(0, 8)}`);
    const targetPath = path.join(assetDir, `${safeName}-${asset.id.slice(0, 8)}${extension}`);
    const sidecarPath = `${targetPath}.json`;

    if (asset.dataUrl && !existsSync(targetPath)) {
      const buffer = decodeDataUrl(asset.dataUrl);
      await writeFile(targetPath, buffer);
    }

    await this.writeJson(sidecarPath, {
      id: asset.id,
      messageId: asset.messageId,
      name: asset.name,
      mimeType: asset.mimeType,
      sourceUrl: asset.sourceUrl,
      kind: asset.kind,
      size: asset.size
    });
  }

  async updateSearchIndex(archive, conversationDir) {
    const index = await this.readIndex();
    const recordId = stableHash(archive.conversation.id);
    const assetNames = archive.assets.map((asset) => asset.name).join(" ").toLowerCase();

    const conversationRecord = {
      id: recordId,
      workspace: archive.workspace,
      project: archive.project,
      conversation: archive.conversation,
      assetCount: archive.assets.length,
      lastCapturedAt: archive.capturedAt,
      searchText: `${archive.workspace.name} ${archive.project.name} ${archive.conversation.title} ${archive.conversation.sourceTitle} ${assetNames}`.toLowerCase(),
      conversationDir
    };

    index.conversations = index.conversations.filter((entry) => entry.conversation.id !== archive.conversation.id);
    index.conversations.unshift(conversationRecord);

    const freshMessageRecords = archive.messages.map((message) => ({
      id: message.id,
      conversationId: archive.conversation.id,
      workspaceSlug: archive.workspace.slug,
      projectSlug: archive.project.slug,
      role: message.role,
      createdAt: message.createdAt,
      assetNames: (message.attachments || []).map((asset) => asset.name),
      searchText: `${archive.workspace.name} ${archive.project.name} ${archive.conversation.title} ${archive.conversation.sourceTitle} ${message.text} ${(message.attachments || []).map((asset) => asset.name).join(" ")}`.toLowerCase(),
      text: message.text
    }));

    const retainedMessages = index.messages.filter(
      (message) => message.conversationId !== archive.conversation.id
    );
    index.messages = [...freshMessageRecords, ...retainedMessages];
    index.generatedAt = new Date().toISOString();

    await this.writeJson(this.searchIndexPath, index);
  }

  async readIndex() {
    return await this.readJson(this.searchIndexPath, {
      generatedAt: new Date().toISOString(),
      conversations: [],
      messages: []
    });
  }

  async readJson(filePath, fallback) {
    try {
      const content = await readFile(filePath, "utf8");
      return JSON.parse(content);
    } catch {
      return fallback;
    }
  }

  async writeJson(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  }

  async readJsonLines(filePath) {
    if (!existsSync(filePath)) {
      return [];
    }

    const content = await readFile(filePath, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  async countFiles(dirPath) {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).length;
  }
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/u.exec(dataUrl);

  if (!match) {
    return Buffer.from(dataUrl, "utf8");
  }

  return Buffer.from(match[2], "base64");
}

function guessExtension(asset) {
  const mime = asset.mimeType || "";
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  if (mime === "application/pdf") return ".pdf";

  const name = asset.name || "";
  const match = /\.[a-z0-9]+$/i.exec(name);
  return match ? match[0] : "";
}