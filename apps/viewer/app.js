const state = {
  projects: [],
  search: null,
  activeProjectKey: "",
  activeConversationId: ""
};

const projectList = document.getElementById("projectList");
const conversationList = document.getElementById("conversationList");
const conversationDetail = document.getElementById("conversationDetail");
const summary = document.getElementById("summary");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");

document.getElementById("refreshButton").addEventListener("click", loadProjects);
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(searchInput.value.trim());
});

await loadProjects();

async function loadProjects() {
  const response = await fetch("/api/projects");
  const data = await response.json();
  state.projects = data.projects || [];
  renderProjects();
  if (!state.activeProjectKey && state.projects[0]) {
    void selectProject(state.projects[0]);
  }
}

async function runSearch(query) {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  state.search = await response.json();
  state.activeConversationId = "";
  renderSearchResults();
}

function renderProjects() {
  projectList.innerHTML = "";
  if (state.projects.length === 0) {
    projectList.innerHTML = '<p class="summary">还没有归档项目。现在只会在你手动点击记录时入库。</p>';
    return;
  }

  for (const project of state.projects) {
    const key = `${project.workspace.slug}:${project.project.slug}`;
    const card = document.createElement("section");
    card.className = `project-card ${state.activeProjectKey === key ? "active" : ""}`;
    card.innerHTML = `
      <p class="eyebrow">${escapeHtml(project.workspace.name)}</p>
      <h3>${escapeHtml(project.project.name)}</h3>
      <p class="meta">${project.conversations} 个会话</p>
      <p class="meta">最近归档：${escapeHtml(project.lastCapturedAt || "未知")}</p>
      <div class="project-actions">
        <a href="/api/export/${encodeURIComponent(project.workspace.slug)}/${encodeURIComponent(project.project.slug)}?format=bundle">打包导出</a>
        <a href="/api/export/${encodeURIComponent(project.workspace.slug)}/${encodeURIComponent(project.project.slug)}?format=normalized">标准化导出</a>
      </div>
    `;
    card.addEventListener("click", () => selectProject(project));
    projectList.append(card);
  }
}

async function selectProject(project) {
  state.activeProjectKey = `${project.workspace.slug}:${project.project.slug}`;
  const response = await fetch(
    `/api/search?workspace=${encodeURIComponent(project.workspace.slug)}&project=${encodeURIComponent(project.project.slug)}`
  );
  const result = await response.json();
  state.search = result;
  state.activeConversationId = "";
  renderProjects();
  renderSearchResults();
}

function renderSearchResults() {
  conversationList.innerHTML = "";
  conversationDetail.innerHTML = "";

  if (!state.search) {
    summary.textContent = "选择一个会话，查看本地归档内容。";
    return;
  }

  const conversations = state.search.conversations || [];
  const messages = state.search.messages || [];
  summary.textContent = `当前视图包含 ${conversations.length} 个会话，匹配到 ${messages.length} 条消息。`;

  if (conversations.length === 0) {
    conversationList.innerHTML = '<div class="summary">当前条件下没有匹配结果。</div>';
    return;
  }

  for (const conversation of conversations) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `conversation-card ${state.activeConversationId === conversation.conversation.id ? "active" : ""}`;
    card.innerHTML = `
      <p class="eyebrow">${escapeHtml(conversation.project.name)}</p>
      <h3>${escapeHtml(conversation.conversation.title)}</h3>
      <p class="meta">原始标题：${escapeHtml(conversation.conversation.sourceTitle || conversation.conversation.title)}</p>
      <p class="meta">${escapeHtml(conversation.lastCapturedAt || "未知")}</p>
    `;
    card.addEventListener("click", () => selectConversation(conversation.conversation.id));
    conversationList.append(card);
  }

  if (!state.activeConversationId && conversations[0]) {
    void selectConversation(conversations[0].conversation.id);
  }
}

async function selectConversation(conversationId) {
  state.activeConversationId = conversationId;
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`);
  const data = await response.json();
  renderConversation(data.manifest, data.messages || []);
  updateConversationSelection();
}

function updateConversationSelection() {
  [...conversationList.children].forEach((node, index) => {
    const item = state.search?.conversations?.[index];
    node.classList.toggle("active", item?.conversation.id === state.activeConversationId);
  });
}

function renderConversation(manifest, messages) {
  conversationDetail.innerHTML = `
    <section class="summary">
      <p class="eyebrow">${escapeHtml(manifest.workspace.name)} / ${escapeHtml(manifest.project.name)}</p>
      <h2>${escapeHtml(manifest.conversation.title)}</h2>
      <p class="meta">原始标题：${escapeHtml(manifest.conversation.sourceTitle || manifest.conversation.title)}</p>
      <p class="meta">会话 ID：${escapeHtml(manifest.conversation.id)}</p>
      <p class="meta">消息数：${manifest.counts.messages} | 附件数：${manifest.counts.assets} | 最近归档：${escapeHtml(manifest.lastCapturedAt || "未知")}</p>
      <form id="renameForm" class="rename-form">
        <label>
          <span>自定义归档名称</span>
          <input id="renameInput" type="text" value="${escapeAttr(manifest.conversation.customTitle || manifest.conversation.title || "")}" placeholder="输入新的归档名称">
        </label>
        <button type="submit">保存名称</button>
      </form>
    </section>
  `;

  const renameForm = document.getElementById("renameForm");
  renameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("renameInput");
    await fetch(`/api/conversations/${encodeURIComponent(manifest.conversation.id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title: input.value.trim() })
    });
    await refreshCurrentViews();
  });

  for (const message of messages) {
    const card = document.createElement("section");
    card.className = `message-card role-${message.role}`;
    const attachments = (message.attachments || []).length
      ? `<p class="meta">附件：${message.attachments.map((asset) => escapeHtml(asset.name)).join("，")}</p>`
      : "";
    const codeBlocks = (message.codeBlocks || []).length
      ? message.codeBlocks
          .map((block) => `<pre><code>${escapeHtml(block.code)}</code></pre>`)
          .join("")
      : "";
    card.innerHTML = `
      <header>
        <strong>${escapeHtml(formatRole(message.role))}</strong>
        <span class="message-meta">${escapeHtml(message.createdAt || "时间未知")}</span>
      </header>
      <pre>${escapeHtml(message.markdown || message.text || "")}</pre>
      ${codeBlocks}
      ${attachments}
    `;
    conversationDetail.append(card);
  }
}

async function refreshCurrentViews() {
  await loadProjects();
  if (state.activeConversationId) {
    await selectConversation(state.activeConversationId);
  }
}

function formatRole(role) {
  const map = {
    user: "用户",
    assistant: "助手",
    system: "系统",
    tool: "工具"
  };
  return map[role] || role || "未知";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}