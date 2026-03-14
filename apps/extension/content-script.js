const LABELS = {
  noConversationDetected: "\u5f53\u524d\u9875\u9762\u6ca1\u6709\u8bc6\u522b\u5230\u53ef\u5f52\u6863\u7684\u804a\u5929\u5185\u5bb9\u3002",
  unknownWorkspace: "\u5f53\u524d\u7a7a\u95f4",
  currentWorkspace: "\u5f53\u524d\u7a7a\u95f4",
  inbox: "\u6536\u4ef6\u7bb1",
  untitledConversation: "\u672a\u547d\u540d\u4f1a\u8bdd",
  newChat: "\u65b0\u804a\u5929",
  searchChats: "\u641c\u7d22\u804a\u5929",
  images: "\u56fe\u7247",
  apps: "\u5e94\u7528",
  deepResearch: "\u6df1\u5ea6\u7814\u7a76",
  projects: "\u9879\u76ee",
  recent: "\u6700\u8fd1",
  newProject: "\u65b0\u9879\u76ee"
};

const GENERIC_LABELS = new Set([
  LABELS.newChat,
  LABELS.searchChats,
  LABELS.images,
  LABELS.apps,
  LABELS.deepResearch,
  "Codex",
  "GPT",
  "ChatGPT",
  LABELS.projects,
  LABELS.recent,
  LABELS.newProject,
  LABELS.inbox
]);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ping") {
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "get-context") {
    sendResponse(buildContext());
    return false;
  }

  if (message.type === "collect-now") {
    collectConversation(message.payload || {}).then(sendResponse);
    return true;
  }

  return false;
});

function buildContext() {
  const projectName = inferProjectName();
  const workspaceName = inferWorkspaceName(projectName);
  const chatTitle = inferTitle();

  return {
    ok: true,
    workspaceName,
    projectName,
    chatTitle,
    conversationId: extractConversationId()
  };
}

async function collectConversation(options) {
  const payload = await buildArchivePayload(options);
  if (!payload || payload.messages.length === 0) {
    return {
      ok: true,
      skipped: true,
      reason: LABELS.noConversationDetected
    };
  }

  return {
    ok: true,
    payload
  };
}

async function buildArchivePayload(options) {
  const domPayload = await parseConversationFromDom();
  const structuredPayload = parseConversationFromStructuredData();
  const messages = domPayload.messages.length > 0 ? domPayload.messages : structuredPayload.messages;
  const sourceTitle =
    domPayload.conversation?.sourceTitle ||
    structuredPayload.conversation?.sourceTitle ||
    inferTitle();
  const customTitle = cleanText(options.customTitle || "");
  const projectName = domPayload.project?.name || structuredPayload.project?.name || LABELS.inbox;
  const workspaceName = domPayload.workspace?.name || structuredPayload.workspace?.name || inferWorkspaceName(projectName);

  return {
    capturedAt: new Date().toISOString(),
    source: "chatgpt-extension",
    workspace: { name: workspaceName },
    project: { name: projectName },
    conversation: {
      id: extractConversationId(),
      title: customTitle || sourceTitle || LABELS.untitledConversation,
      sourceTitle,
      customTitle,
      model: inferModelLabel(),
      updatedAt: new Date().toISOString(),
      url: location.href
    },
    messages,
    raw: {
      pathname: location.pathname,
      title: document.title
    }
  };
}

function parseConversationFromStructuredData() {
  const scripts = [...document.querySelectorAll('script[type="application/ld+json"], script#__NEXT_DATA__')];

  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || "null");
      const messages = findMessagesInObject(data);
      if (messages.length > 0) {
        return {
          workspace: { name: inferWorkspaceName(LABELS.inbox) },
          project: { name: inferProjectName() },
          conversation: {
            id: extractConversationId(),
            sourceTitle: inferTitle(),
            model: inferModelLabel()
          },
          messages
        };
      }
    } catch {
      continue;
    }
  }

  return {
    workspace: null,
    project: null,
    conversation: {},
    messages: []
  };
}

function findMessagesInObject(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return [];
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const candidateMessages = value
      .map((item, index) => normalizeMessageCandidate(item, index))
      .filter(Boolean);

    if (candidateMessages.length > 1) {
      return candidateMessages;
    }

    for (const item of value) {
      const nested = findMessagesInObject(item, seen);
      if (nested.length > 0) {
        return nested;
      }
    }

    return [];
  }

  for (const entry of Object.values(value)) {
    const nested = findMessagesInObject(entry, seen);
    if (nested.length > 0) {
      return nested;
    }
  }

  return [];
}

function normalizeMessageCandidate(item, index) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const role = firstString(item.role, item.author, item.author_role);
  const text = firstString(item.text, item.content, item.message);

  if (!role || !text) {
    return null;
  }

  return {
    id: firstString(item.id) || `structured-${index}-${text.slice(0, 12)}`,
    role,
    markdown: text,
    text,
    codeBlocks: [],
    attachments: [],
    createdAt: firstString(item.create_time, item.createdAt)
  };
}

async function parseConversationFromDom() {
  const container = document.querySelector("main") || document.body;
  const messageRoots = selectMessageRoots(container);
  const messages = [];

  for (let index = 0; index < messageRoots.length; index += 1) {
    const root = messageRoots[index];
    const role = inferRole(root, index);
    const contentRoot =
      root.querySelector("[data-message-content]") ||
      root.querySelector(".markdown") ||
      root.querySelector("[class*='markdown']") ||
      root;
    const codeBlocks = [...contentRoot.querySelectorAll("pre code")].map((block) => ({
      language: block.className.replace(/language-/g, "").trim(),
      code: block.textContent || ""
    }));
    const attachments = collectAttachments(root, index);
    const text = cleanText(contentRoot.innerText || root.innerText || "");

    if (!text && attachments.length === 0) {
      continue;
    }

    messages.push({
      id: root.getAttribute("data-message-id") || `${extractConversationId()}-${role}-${index}`,
      role,
      createdAt: root.querySelector("time")?.dateTime || null,
      markdown: text,
      text,
      codeBlocks,
      attachments
    });
  }

  const projectName = inferProjectName();

  return {
    workspace: { name: inferWorkspaceName(projectName) },
    project: { name: projectName },
    conversation: {
      id: extractConversationId(),
      sourceTitle: inferTitle(),
      model: inferModelLabel(),
      updatedAt: new Date().toISOString()
    },
    messages
  };
}

function selectMessageRoots(container) {
  const selectors = [
    "[data-message-author-role]",
    "article",
    "[data-testid*='conversation-turn']",
    "[class*='conversation-turn']"
  ];

  for (const selector of selectors) {
    const nodes = [...container.querySelectorAll(selector)].filter((node) => cleanText(node.innerText).length > 0);
    if (nodes.length > 1) {
      return nodes;
    }
  }

  return [...container.children].filter((node) => cleanText(node.innerText).length > 0);
}

function inferRole(element, index) {
  const explicit = element.getAttribute("data-message-author-role");
  if (explicit) {
    return explicit;
  }

  const labelText = cleanText(
    element.querySelector("[data-testid='message-author-name'], h5, h6, strong")?.textContent || ""
  ).toLowerCase();
  if (labelText.includes("assistant") || labelText.includes("chatgpt")) {
    return "assistant";
  }
  if (labelText.includes("user") || labelText.includes("you")) {
    return "user";
  }

  return index % 2 === 0 ? "user" : "assistant";
}

function collectAttachments(root, messageIndex) {
  const assets = [];
  const images = [...root.querySelectorAll("img[src]")];
  const links = [...root.querySelectorAll("a[href]")].filter((link) => link.href && !link.href.startsWith("javascript:"));

  for (const [assetIndex, image] of images.entries()) {
    const sourceUrl = image.currentSrc || image.src;
    if (!sourceUrl) {
      continue;
    }

    assets.push({
      id: `${extractConversationId()}-image-${messageIndex}-${assetIndex}`,
      name: deriveFileName(sourceUrl, `image-${assetIndex}.png`),
      sourceUrl,
      kind: "image"
    });
  }

  for (const [assetIndex, link] of links.entries()) {
    const href = link.href;
    if (!href || images.some((image) => (image.currentSrc || image.src) === href)) {
      continue;
    }

    assets.push({
      id: `${extractConversationId()}-file-${messageIndex}-${assetIndex}`,
      name: cleanText(link.textContent) || deriveFileName(href, `file-${assetIndex}`),
      sourceUrl: href,
      kind: href.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i) ? "image" : "file"
    });
  }

  return assets;
}

function inferTitle() {
  const candidates = [
    getCurrentConversationSidebarTitle(),
    cleanText(document.querySelector("main h1")?.textContent || ""),
    cleanTitleFromDocument(document.title)
  ];

  return firstMeaningfulLabel(candidates, LABELS.untitledConversation);
}

function inferProjectName() {
  const candidates = [
    getSidebarProjectGroupTitle(),
    getTopBreadcrumbTitle(),
    getSidebarFolderTitle()
  ];

  return firstMeaningfulLabel(candidates, LABELS.inbox);
}

function inferWorkspaceName(projectName) {
  const candidates = [
    getTopBreadcrumbTitle(),
    getWorkspaceSwitcherTitle()
  ].filter((value) => normalizeLabel(value) !== normalizeLabel(projectName));

  return firstMeaningfulLabel(candidates, LABELS.currentWorkspace);
}

function getCurrentConversationSidebarTitle() {
  const selectors = [
    'aside a[aria-current="page"]',
    'aside button[aria-current="page"]',
    'nav a[aria-current="page"]',
    'nav button[aria-current="page"]',
    '[data-testid*="conversation"] [aria-current="page"]'
  ];

  for (const selector of selectors) {
    const text = normalizeLabel(document.querySelector(selector)?.textContent || "");
    if (isMeaningfulLabel(text)) {
      return text;
    }
  }

  return "";
}

function getSidebarProjectGroupTitle() {
  const sidebar = document.querySelector("aside");
  if (!sidebar) {
    return "";
  }

  const labels = [...sidebar.querySelectorAll("a, button, div, span")]
    .map((node) => normalizeLabel(node.textContent || ""))
    .filter(Boolean);

  const uniqueLabels = [...new Set(labels)];
  const projectIndex = uniqueLabels.findIndex((label) => label === LABELS.projects);
  if (projectIndex >= 0) {
    for (let index = projectIndex + 1; index < uniqueLabels.length; index += 1) {
      const label = uniqueLabels[index];
      if (label === LABELS.recent) {
        break;
      }
      if (isMeaningfulLabel(label) && !looksLikeConversationLabel(label)) {
        return label;
      }
    }
  }

  return "";
}

function getSidebarFolderTitle() {
  const sidebar = document.querySelector("aside");
  if (!sidebar) {
    return "";
  }

  const labels = [...sidebar.querySelectorAll("a, button, div, span")]
    .map((node) => normalizeLabel(node.textContent || ""))
    .filter((label) => isMeaningfulLabel(label) && !looksLikeConversationLabel(label));

  return labels[0] || "";
}

function getTopBreadcrumbTitle() {
  const selectors = [
    "header nav button",
    "header nav a",
    "main header button",
    "main header a",
    'button[aria-haspopup="menu"]'
  ];

  for (const selector of selectors) {
    const nodes = [...document.querySelectorAll(selector)];
    for (const node of nodes) {
      const text = normalizeLabel(node.textContent || "");
      if (isMeaningfulLabel(text) && !looksLikeConversationLabel(text)) {
        return text;
      }
    }
  }

  return "";
}

function getWorkspaceSwitcherTitle() {
  const selectors = [
    '[data-testid="workspace-switcher"]',
    'button[aria-haspopup="menu"]',
    'nav [class*="workspace"]'
  ];

  for (const selector of selectors) {
    const text = normalizeLabel(document.querySelector(selector)?.textContent || "");
    if (isMeaningfulLabel(text)) {
      return text;
    }
  }

  return "";
}

function cleanTitleFromDocument(value) {
  return normalizeLabel(String(value || "").replace(/\s*-\s*ChatGPT$/i, ""));
}

function normalizeLabel(value) {
  return String(value || "")
    .replace(/(?:Ctrl|Shift|Alt|Cmd|Option)\s*[A-Za-z0-9+-]*$/giu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMeaningfulLabel(candidates, fallback) {
  for (const candidate of candidates) {
    if (isMeaningfulLabel(candidate)) {
      return candidate;
    }
  }
  return fallback;
}

function isMeaningfulLabel(value) {
  const normalized = normalizeLabel(value);
  if (!normalized) {
    return false;
  }

  if (GENERIC_LABELS.has(normalized) || GENERIC_LABELS.has(normalized.toLowerCase())) {
    return false;
  }

  return normalized.length >= 2;
}

function looksLikeConversationLabel(value) {
  const normalized = normalizeLabel(value).toLowerCase();
  if (!normalized) {
    return false;
  }

  return normalized.includes(LABELS.newChat.toLowerCase()) || normalized.includes("untitled") || normalized.length > 48;
}

function inferModelLabel() {
  const selectors = [
    '[data-testid="model-switcher-dropdown-button"]',
    'button[aria-label*="model"]',
    '[class*="model-switcher"] button'
  ];

  for (const selector of selectors) {
    const text = cleanText(document.querySelector(selector)?.textContent || "");
    if (text) {
      return text;
    }
  }

  return "";
}

function extractConversationId() {
  const match = location.pathname.match(/\/c\/([^/?#]+)/i);
  return match ? match[1] : `${location.pathname}-${inferTitle()}`.replace(/[^a-z0-9-]/gi, "-");
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function deriveFileName(url, fallback) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split("/").filter(Boolean).pop() || fallback;
  } catch {
    return fallback;
  }
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}
