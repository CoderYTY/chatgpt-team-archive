import { createHash } from "node:crypto";

export const ARCHIVE_VERSION = 1;

export function slugify(value, fallback = "unknown") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

export function stableHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

export function normalizeConversationPayload(payload) {
  const workspaceName = normalizeText(payload.workspace?.name) || "Personal";
  const projectName = normalizeText(payload.project?.name) || "Inbox";
  const sourceTitle = normalizeText(payload.conversation?.sourceTitle || payload.conversation?.title) || "Untitled conversation";
  const customTitle = normalizeText(payload.conversation?.customTitle);
  const displayTitle = customTitle || normalizeText(payload.conversation?.title) || sourceTitle;
  const conversationId =
    normalizeText(payload.conversation?.id) ||
    stableHash(`${workspaceName}:${projectName}:${sourceTitle}`);

  const messages = Array.isArray(payload.messages)
    ? payload.messages
        .map((message, index) => normalizeMessage(message, index, conversationId))
        .filter(Boolean)
    : [];

  const assets = Array.isArray(payload.assets)
    ? payload.assets.map((asset, index) => normalizeAsset(asset, index, conversationId))
    : collectAssetsFromMessages(messages, conversationId);

  return {
    archiveVersion: ARCHIVE_VERSION,
    capturedAt: payload.capturedAt || new Date().toISOString(),
    source: payload.source || "chatgpt-web",
    workspace: {
      id: normalizeText(payload.workspace?.id) || slugify(workspaceName, "workspace"),
      name: workspaceName,
      slug: slugify(workspaceName, "workspace")
    },
    project: {
      id: normalizeText(payload.project?.id) || slugify(projectName, "project"),
      name: projectName,
      slug: slugify(projectName, "project")
    },
    conversation: {
      id: conversationId,
      title: displayTitle,
      sourceTitle,
      customTitle,
      slug: slugify(sourceTitle, conversationId.slice(0, 12)),
      url: normalizeText(payload.conversation?.url),
      model: normalizeText(payload.conversation?.model),
      updatedAt: payload.conversation?.updatedAt || payload.capturedAt || new Date().toISOString()
    },
    messages,
    assets,
    raw: payload.raw || null
  };
}

export function normalizeMessage(message, index, conversationId) {
  const text = normalizeText(message.text || message.content || message.markdown || "");
  const html = String(message.html || "");
  const role = normalizeText(message.role) || "unknown";

  if (!text && !html) {
    return null;
  }

  const id =
    normalizeText(message.id) ||
    stableHash(`${conversationId}:${role}:${index}:${text}:${html.slice(0, 200)}`);

  return {
    id,
    role,
    authorName: normalizeText(message.authorName),
    createdAt: message.createdAt || null,
    updatedAt: message.updatedAt || null,
    text,
    html,
    markdown: normalizeText(message.markdown || text),
    codeBlocks: normalizeCodeBlocks(message.codeBlocks),
    attachments: Array.isArray(message.attachments)
      ? message.attachments.map((asset, assetIndex) =>
          normalizeAsset(asset, assetIndex, conversationId, id)
        )
      : [],
    meta: message.meta || {}
  };
}

export function normalizeAsset(asset, index, conversationId, messageId = "") {
  const sourceUrl = normalizeText(asset.sourceUrl || asset.url || asset.src);
  const name = normalizeText(asset.name) || deriveFileName(sourceUrl, index);
  const id =
    normalizeText(asset.id) ||
    stableHash(`${conversationId}:${messageId}:${name}:${sourceUrl}:${index}`);

  return {
    id,
    messageId: normalizeText(asset.messageId) || messageId,
    name,
    mimeType: normalizeText(asset.mimeType || asset.type),
    sourceUrl,
    dataUrl: typeof asset.dataUrl === "string" ? asset.dataUrl : "",
    size: Number.isFinite(asset.size) ? asset.size : null,
    kind: normalizeText(asset.kind) || guessAssetKind(asset, sourceUrl)
  };
}

export function normalizeCodeBlocks(codeBlocks) {
  if (!Array.isArray(codeBlocks)) {
    return [];
  }

  return codeBlocks
    .map((block) => ({
      language: normalizeText(block.language),
      code: String(block.code || "")
    }))
    .filter((block) => block.code);
}

function collectAssetsFromMessages(messages, conversationId) {
  const assets = [];

  for (const message of messages) {
    for (const asset of message.attachments || []) {
      assets.push(normalizeAsset(asset, assets.length, conversationId, message.id));
    }
  }

  return dedupeById(assets);
}

function dedupeById(items) {
  const seen = new Map();

  for (const item of items) {
    seen.set(item.id, item);
  }

  return [...seen.values()];
}

function deriveFileName(url, index) {
  if (!url) {
    return `asset-${index + 1}`;
  }

  try {
    const parsed = new URL(url);
    const name = parsed.pathname.split("/").filter(Boolean).pop();
    return name || `asset-${index + 1}`;
  } catch {
    return `asset-${index + 1}`;
  }
}

function guessAssetKind(asset, sourceUrl) {
  if (String(asset.mimeType || "").startsWith("image/")) {
    return "image";
  }

  if (sourceUrl && /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(sourceUrl)) {
    return "image";
  }

  return "file";
}