const STORAGE_KEYS = {
  archiveDb: "archiveDb",
  lastStatus: "lastStatus"
};

const DEFAULT_ARCHIVE_DB = {
  conversations: {}
};

const TEXT = {
  noActiveTab: "\u6ca1\u6709\u627e\u5230\u5f53\u524d ChatGPT \u6807\u7b7e\u9875\u3002",
  unsupportedPage: "\u5f53\u524d\u6807\u7b7e\u9875\u4e0d\u662f\u652f\u6301\u7684 ChatGPT \u9875\u9762\u3002",
  noResponse: "\u9875\u9762\u91c7\u96c6\u6ca1\u6709\u8fd4\u56de\u7ed3\u679c\uff0c\u8bf7\u5237\u65b0 ChatGPT \u9875\u9762\u540e\u91cd\u8bd5\u3002",
  manualFailed: "\u624b\u52a8\u8bb0\u5f55\u5931\u8d25\u3002",
  nothingCaptured: "\u5f53\u524d\u9875\u9762\u6ca1\u6709\u8bc6\u522b\u5230\u53ef\u5f52\u6863\u7684\u804a\u5929\u5185\u5bb9\u3002",
  untitledConversation: "\u672a\u547d\u540d\u4f1a\u8bdd",
  unknownWorkspace: "\u672a\u77e5\u7a7a\u95f4",
  unknownProject: "\u672a\u5206\u7ec4\u9879\u76ee",
  manual: "\u624b\u52a8"
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get([STORAGE_KEYS.archiveDb, STORAGE_KEYS.lastStatus]);
  const next = {};

  if (!existing[STORAGE_KEYS.archiveDb]) {
    next[STORAGE_KEYS.archiveDb] = DEFAULT_ARCHIVE_DB;
  }

  if (typeof existing[STORAGE_KEYS.lastStatus] === "undefined") {
    next[STORAGE_KEYS.lastStatus] = null;
  }

  if (Object.keys(next).length > 0) {
    await chrome.storage.local.set(next);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "get-settings":
      chrome.storage.local.get({ [STORAGE_KEYS.lastStatus]: null }).then((result) => {
        sendResponse({ lastStatus: result[STORAGE_KEYS.lastStatus] || null });
      });
      return true;

    case "get-active-context":
      handleGetActiveContext().then(sendResponse);
      return true;

    case "manual-backup":
      handleManualBackup(message.payload || {}).then(sendResponse);
      return true;

    case "open-viewer":
      chrome.tabs.create({ url: chrome.runtime.getURL("archive.html") }).then(() => sendResponse({ ok: true }));
      return true;

    case "get-archive-overview":
      getArchiveOverview().then(sendResponse);
      return true;

    case "rename-conversation":
      renameConversation(message.payload || {}).then(sendResponse);
      return true;

    case "delete-conversation":
      deleteConversation(message.payload || {}).then(sendResponse);
      return true;

    case "delete-project":
      deleteProject(message.payload || {}).then(sendResponse);
      return true;

    case "export-conversation-markdown":
      exportConversationMarkdown(message.payload || {}).then(sendResponse);
      return true;

    case "export-project-markdown":
      exportProjectMarkdown(message.payload || {}).then(sendResponse);
      return true;

    default:
      return false;
  }
});

async function handleGetActiveContext() {
  const tab = await getActiveChatTab();
  if (!tab.ok) {
    return tab;
  }

  try {
    await ensureContentScript(tab.tabId);
    return await sendTabMessage(tab.tabId, { type: "get-context" });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : TEXT.manualFailed
    };
  }
}

async function handleManualBackup(payload) {
  const tab = await getActiveChatTab();
  if (!tab.ok) {
    await saveLastStatus(tab);
    return tab;
  }

  try {
    await ensureContentScript(tab.tabId);
    const collected = await sendTabMessage(tab.tabId, {
      type: "collect-now",
      payload: {
        customTitle: cleanText(payload.customTitle || "")
      }
    });

    if (!collected) {
      const status = { ok: false, error: TEXT.noResponse };
      await saveLastStatus(status);
      return status;
    }

    if (!collected.ok) {
      const status = {
        ok: false,
        trigger: "manual",
        capturedAt: new Date().toISOString(),
        error: collected.error || TEXT.manualFailed
      };
      await saveLastStatus(status);
      return status;
    }

    if (collected.skipped || !collected.payload || !Array.isArray(collected.payload.messages) || collected.payload.messages.length === 0) {
      const status = {
        ok: true,
        skipped: true,
        trigger: "manual",
        capturedAt: new Date().toISOString(),
        reason: collected.reason || TEXT.nothingCaptured
      };
      await saveLastStatus(status);
      return status;
    }

    const summary = await upsertConversation(collected.payload);
    const status = {
      ok: true,
      trigger: "manual",
      capturedAt: summary.updatedAt,
      title: summary.title,
      sourceTitle: summary.sourceTitle,
      customTitle: summary.customTitle,
      conversationId: summary.id,
      newMessages: summary.newMessages
    };

    await saveLastStatus(status);
    return status;
  } catch (error) {
    const status = {
      ok: false,
      trigger: "manual",
      capturedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : TEXT.manualFailed
    };
    await saveLastStatus(status);
    return status;
  }
}

async function getArchiveOverview() {
  const db = await loadArchiveDb();
  const conversations = Object.values(db.conversations || {})
    .map(normalizeStoredConversation)
    .sort((left, right) => compareIsoDates(right.updatedAt, left.updatedAt));

  const projectsByKey = new Map();
  for (const conversation of conversations) {
    const key = buildProjectKey(conversation.workspaceName, conversation.projectName);
    if (!projectsByKey.has(key)) {
      projectsByKey.set(key, {
        key,
        workspaceName: conversation.workspaceName,
        projectName: conversation.projectName,
        conversationCount: 0,
        messageCount: 0,
        lastUpdatedAt: conversation.updatedAt
      });
    }

    const project = projectsByKey.get(key);
    project.conversationCount += 1;
    project.messageCount += conversation.messages.length;
    if (compareIsoDates(conversation.updatedAt, project.lastUpdatedAt) > 0) {
      project.lastUpdatedAt = conversation.updatedAt;
    }
  }

  return {
    ok: true,
    projects: [...projectsByKey.values()].sort((left, right) => compareIsoDates(right.lastUpdatedAt, left.lastUpdatedAt)),
    conversations,
    stats: {
      conversationCount: conversations.length,
      messageCount: conversations.reduce((sum, item) => sum + item.messages.length, 0),
      projectCount: projectsByKey.size
    }
  };
}

async function renameConversation(payload) {
  const conversationId = cleanText(payload.conversationId || "");
  if (!conversationId) {
    return { ok: false, error: "\u7f3a\u5c11\u4f1a\u8bdd ID\u3002" };
  }

  const db = await loadArchiveDb();
  const current = db.conversations?.[conversationId];
  if (!current) {
    return { ok: false, error: "\u6ca1\u6709\u627e\u5230\u8fd9\u6761\u5f52\u6863\u3002" };
  }

  const customTitle = cleanText(payload.customTitle || "");
  const next = normalizeStoredConversation({
    ...current,
    customTitle,
    title: customTitle || current.sourceTitle || current.title || TEXT.untitledConversation,
    updatedAt: new Date().toISOString()
  });

  db.conversations[conversationId] = next;
  await saveArchiveDb(db);

  return {
    ok: true,
    conversation: next
  };
}

async function deleteConversation(payload) {
  const conversationId = cleanText(payload.conversationId || "");
  if (!conversationId) {
    return { ok: false, error: "\u7f3a\u5c11\u4f1a\u8bdd ID\u3002" };
  }

  const db = await loadArchiveDb();
  if (!db.conversations?.[conversationId]) {
    return { ok: false, error: "\u6ca1\u6709\u627e\u5230\u8fd9\u6761\u5f52\u6863\u3002" };
  }

  delete db.conversations[conversationId];
  await saveArchiveDb(db);

  return {
    ok: true,
    deletedConversationId: conversationId
  };
}

async function deleteProject(payload) {
  const projectKey = cleanText(payload.projectKey || "");
  if (!projectKey) {
    return { ok: false, error: "\u7f3a\u5c11\u9879\u76ee\u6807\u8bc6\u3002" };
  }

  const db = await loadArchiveDb();
  const entries = Object.entries(db.conversations || {});
  const matchedIds = entries
    .filter(([, conversation]) => {
      const normalized = normalizeStoredConversation(conversation);
      return buildProjectKey(normalized.workspaceName, normalized.projectName) === projectKey;
    })
    .map(([conversationId]) => conversationId);

  if (matchedIds.length === 0) {
    return { ok: false, error: "\u6ca1\u6709\u627e\u5230\u8fd9\u4e2a\u5f52\u6863\u7ec4\u3002" };
  }

  for (const conversationId of matchedIds) {
    delete db.conversations[conversationId];
  }

  await saveArchiveDb(db);

  return {
    ok: true,
    deletedProjectKey: projectKey,
    deletedCount: matchedIds.length
  };
}

async function exportConversationMarkdown(payload) {
  const conversationId = cleanText(payload.conversationId || "");
  const db = await loadArchiveDb();
  const conversation = db.conversations?.[conversationId];

  if (!conversation) {
    return { ok: false, error: "\u6ca1\u6709\u627e\u5230\u8981\u5bfc\u51fa\u7684\u4f1a\u8bdd\u3002" };
  }

  const markdown = buildConversationMarkdown(normalizeStoredConversation(conversation));
  const filename = `${safeFileName(normalizeStoredConversation(conversation).title || TEXT.untitledConversation)}.md`;
  await downloadMarkdown(markdown, filename);

  return { ok: true };
}

async function exportProjectMarkdown(payload) {
  const projectKey = cleanText(payload.projectKey || "");
  const db = await loadArchiveDb();
  const conversations = Object.values(db.conversations || {})
    .map(normalizeStoredConversation)
    .filter((conversation) => buildProjectKey(conversation.workspaceName, conversation.projectName) === projectKey)
    .sort((left, right) => compareIsoDates(right.updatedAt, left.updatedAt));

  if (conversations.length === 0) {
    return { ok: false, error: "\u8fd9\u4e2a\u9879\u76ee\u8fd8\u6ca1\u6709\u53ef\u5bfc\u51fa\u7684\u5f52\u6863\u3002" };
  }

  const { workspaceName, projectName } = conversations[0];
  const header = [
    `# ${projectName}`,
    "",
    `- \u7a7a\u95f4\uff1a${workspaceName}`,
    `- \u4f1a\u8bdd\u6570\uff1a${conversations.length}`,
    `- \u5bfc\u51fa\u65f6\u95f4\uff1a${new Date().toISOString()}`,
    ""
  ].join("\n");

  const markdown = [header]
    .concat(conversations.map((conversation) => buildConversationMarkdown(conversation)))
    .join("\n\n---\n\n");

  const filename = `${safeFileName(projectName)}-\u9879\u76ee\u5f52\u6863.md`;
  await downloadMarkdown(markdown, filename);

  return { ok: true };
}

async function upsertConversation(payload) {
  const db = await loadArchiveDb();
  const incoming = normalizeIncomingPayload(payload);
  const existing = db.conversations[incoming.id] ? normalizeStoredConversation(db.conversations[incoming.id]) : null;
  const customTitle = incoming.customTitle || existing?.customTitle || "";
  const sourceTitle = incoming.sourceTitle || existing?.sourceTitle || incoming.title || TEXT.untitledConversation;
  const title = customTitle || sourceTitle || TEXT.untitledConversation;

  const mergedMessages = existing ? existing.messages.map((message) => normalizeStoredMessage(message)) : [];
  const seenKeys = new Set(mergedMessages.map(getMessageKey));
  let newMessages = 0;

  for (const message of incoming.messages.map((item) => normalizeStoredMessage(item))) {
    const key = getMessageKey(message);
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    mergedMessages.push(message);
    newMessages += 1;
  }

  const stored = normalizeStoredConversation({
    id: incoming.id,
    workspaceName: incoming.workspaceName,
    projectName: incoming.projectName,
    sourceTitle,
    customTitle,
    title,
    url: incoming.url,
    model: incoming.model,
    createdAt: existing?.createdAt || incoming.capturedAt || new Date().toISOString(),
    updatedAt: incoming.capturedAt || new Date().toISOString(),
    messages: mergedMessages
  });

  db.conversations[stored.id] = stored;
  await saveArchiveDb(db);

  return {
    id: stored.id,
    title: stored.title,
    sourceTitle: stored.sourceTitle,
    customTitle: stored.customTitle,
    updatedAt: stored.updatedAt,
    newMessages
  };
}

function normalizeIncomingPayload(payload) {
  const conversation = payload.conversation || {};
  const workspace = payload.workspace || {};
  const project = payload.project || {};

  return {
    id: cleanText(conversation.id || payload.id || "") || buildFallbackConversationId(conversation.url || payload.url || ""),
    workspaceName: cleanText(workspace.name || payload.workspaceName || "") || TEXT.unknownWorkspace,
    projectName: cleanText(project.name || payload.projectName || "") || TEXT.unknownProject,
    sourceTitle: cleanText(conversation.sourceTitle || payload.sourceTitle || conversation.title || payload.title || ""),
    customTitle: cleanText(conversation.customTitle || payload.customTitle || ""),
    title: cleanText(conversation.title || payload.title || ""),
    url: cleanText(conversation.url || payload.url || ""),
    model: cleanText(conversation.model || payload.model || ""),
    capturedAt: payload.capturedAt || new Date().toISOString(),
    messages: Array.isArray(payload.messages) ? payload.messages : []
  };
}

function normalizeStoredConversation(conversation) {
  return {
    id: cleanText(conversation.id || ""),
    workspaceName: cleanText(conversation.workspaceName || "") || TEXT.unknownWorkspace,
    projectName: cleanText(conversation.projectName || "") || TEXT.unknownProject,
    sourceTitle: cleanText(conversation.sourceTitle || "") || TEXT.untitledConversation,
    customTitle: cleanText(conversation.customTitle || ""),
    title: cleanText(conversation.customTitle || conversation.title || conversation.sourceTitle || "") || TEXT.untitledConversation,
    url: cleanText(conversation.url || ""),
    model: cleanText(conversation.model || ""),
    createdAt: conversation.createdAt || new Date().toISOString(),
    updatedAt: conversation.updatedAt || conversation.createdAt || new Date().toISOString(),
    messages: Array.isArray(conversation.messages) ? conversation.messages.map((message) => normalizeStoredMessage(message)) : []
  };
}

function normalizeStoredMessage(message) {
  const role = normalizeRole(message.role);
  const markdown = normalizeLineEndings(message.markdown || message.text || "").trim();
  const codeBlocks = Array.isArray(message.codeBlocks)
    ? message.codeBlocks
        .map((block) => ({
          language: cleanText(block.language || ""),
          code: normalizeLineEndings(block.code || "").trim()
        }))
        .filter((block) => block.code)
    : [];
  const attachments = Array.isArray(message.attachments)
    ? message.attachments
        .map((attachment, index) => ({
          id: cleanText(attachment.id || "") || `asset-${index}`,
          name: cleanText(attachment.name || "") || `asset-${index}`,
          sourceUrl: cleanText(attachment.sourceUrl || attachment.url || ""),
          kind: cleanText(attachment.kind || "") || "file"
        }))
        .filter((attachment) => attachment.sourceUrl || attachment.name)
    : [];

  return {
    id: cleanText(message.id || "") || buildFallbackMessageId(role, markdown, message.createdAt),
    role,
    createdAt: message.createdAt || null,
    markdown,
    text: normalizeLineEndings(message.text || message.markdown || "").trim(),
    codeBlocks,
    attachments
  };
}

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value.includes("assistant") || value.includes("chatgpt") || value === "ai") {
    return "assistant";
  }
  if (value.includes("system")) {
    return "system";
  }
  return "user";
}

function getMessageKey(message) {
  return cleanText(message.id || "") || buildFallbackMessageId(message.role, message.markdown || message.text || "", message.createdAt);
}

function buildConversationMarkdown(conversation) {
  const lines = [
    `# ${conversation.title}`,
    "",
    `- \u539f\u59cb\u6807\u9898\uff1a${conversation.sourceTitle}`,
    `- \u9879\u76ee\uff1a${conversation.projectName}`,
    `- \u7a7a\u95f4\uff1a${conversation.workspaceName}`,
    `- \u4f1a\u8bdd ID\uff1a${conversation.id}`,
    `- \u6700\u8fd1\u5f52\u6863\uff1a${conversation.updatedAt}`
  ];

  if (conversation.url) {
    lines.push(`- \u6765\u6e90\u9875\u9762\uff1a${conversation.url}`);
  }

  lines.push("");

  for (const message of conversation.messages) {
    lines.push(`## ${roleLabel(message.role)}`);
    lines.push("");

    const bodyParts = [];
    if (message.markdown) {
      bodyParts.push(message.markdown);
    } else if (message.text) {
      bodyParts.push(message.text);
    }

    if (message.codeBlocks.length > 0) {
      for (const block of message.codeBlocks) {
        bodyParts.push([`\`\`\`${block.language || "text"}`, block.code, "\`\`\`"].join("\n"));
      }
    }

    if (message.attachments.length > 0) {
      bodyParts.push("\u9644\u4ef6\uff1a");
      for (const attachment of message.attachments) {
        bodyParts.push(`- [${attachment.name}](${attachment.sourceUrl || ""})`);
      }
    }

    lines.push(bodyParts.filter(Boolean).join("\n\n") || "\u5185\u5bb9\u4e3a\u7a7a");
    lines.push("");
  }

  return lines.join("\n").trim();
}

async function downloadMarkdown(content, filename) {
  const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(content)}`;
  await chrome.downloads.download({
    url,
    filename: `chatgpt-archive/${filename}`,
    saveAs: true
  });
}

async function getActiveChatTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { ok: false, error: TEXT.noActiveTab };
  }

  if (!isSupportedChatPage(tab.url || "")) {
    return { ok: false, error: TEXT.unsupportedPage };
  }

  return { ok: true, tabId: tab.id };
}

function isSupportedChatPage(url) {
  return /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(url);
}

async function ensureContentScript(tabId) {
  try {
    const response = await sendTabMessage(tabId, { type: "ping" });
    if (response?.ok) {
      return;
    }
  } catch {
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content-script.js"]
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

async function loadArchiveDb() {
  const result = await chrome.storage.local.get({ [STORAGE_KEYS.archiveDb]: DEFAULT_ARCHIVE_DB });
  return result[STORAGE_KEYS.archiveDb] || DEFAULT_ARCHIVE_DB;
}

async function saveArchiveDb(db) {
  await chrome.storage.local.set({ [STORAGE_KEYS.archiveDb]: db });
}

async function saveLastStatus(status) {
  await chrome.storage.local.set({ [STORAGE_KEYS.lastStatus]: status });
}

function buildProjectKey(workspaceName, projectName) {
  return `${workspaceName}::${projectName}`;
}

function compareIsoDates(left, right) {
  const leftTime = left ? Date.parse(left) : 0;
  const rightTime = right ? Date.parse(right) : 0;
  if (leftTime === rightTime) {
    return 0;
  }
  return leftTime > rightTime ? 1 : -1;
}

function roleLabel(role) {
  if (role === "assistant") {
    return "AI";
  }
  if (role === "system") {
    return "\u7cfb\u7edf";
  }
  return "\u7528\u6237";
}

function buildFallbackConversationId(url) {
  return `conversation-${safeFileName(url || Date.now().toString())}`;
}

function buildFallbackMessageId(role, text, createdAt) {
  const seed = `${role}|${createdAt || ""}|${text || ""}`;
  return `message-${hashSeed(seed)}`;
}

function hashSeed(value) {
  let hash = 0;
  const input = String(value || "");
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function safeFileName(value) {
  return String(value || "archive")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "archive";
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeLineEndings(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

