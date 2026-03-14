const state = {
  projects: [],
  conversations: [],
  stats: null,
  selectedProjectKey: "all",
  query: ""
};

const searchInput = document.getElementById("searchInput");
const projectList = document.getElementById("projectList");
const conversationList = document.getElementById("conversationList");
const statsBar = document.getElementById("statsBar");
const resultSummary = document.getElementById("resultSummary");

document.getElementById("refreshButton").addEventListener("click", loadOverview);
searchInput.addEventListener("input", () => {
  state.query = searchInput.value.trim().toLowerCase();
  render();
});

void loadOverview();

async function loadOverview() {
  resultSummary.textContent = "\u6b63\u5728\u52a0\u8f7d\u5f52\u6863...";
  const response = await sendMessage({ type: "get-archive-overview" });

  if (!response?.ok) {
    resultSummary.textContent = response?.error || "\u52a0\u8f7d\u5931\u8d25\u3002";
    projectList.innerHTML = "";
    conversationList.innerHTML = `<div class="empty-state">${escapeHtml(resultSummary.textContent)}</div>`;
    return;
  }

  state.projects = response.projects || [];
  state.conversations = response.conversations || [];
  state.stats = response.stats || null;

  if (state.selectedProjectKey !== "all" && !state.projects.some((project) => project.key === state.selectedProjectKey)) {
    state.selectedProjectKey = "all";
  }

  render();
}

function render() {
  renderStats();
  renderProjects();
  renderConversations();
}

function renderStats() {
  const stats = state.stats || { projectCount: 0, conversationCount: 0, messageCount: 0 };
  statsBar.innerHTML = [
    renderStatCard("\u9879\u76ee\u6570", stats.projectCount),
    renderStatCard("\u4f1a\u8bdd\u6570", stats.conversationCount),
    renderStatCard("\u6d88\u606f\u6570", stats.messageCount)
  ].join("");
}

function renderStatCard(label, value) {
  return `
    <article class="stat">
      <div class="muted">${escapeHtml(label)}</div>
      <strong>${escapeHtml(String(value))}</strong>
    </article>
  `;
}

function renderProjects() {
  const allProjects = [{
    key: "all",
    workspaceName: "\u5168\u90e8\u7a7a\u95f4",
    projectName: "\u5168\u90e8\u9879\u76ee",
    conversationCount: state.conversations.length,
    messageCount: state.conversations.reduce((sum, item) => sum + item.messages.length, 0),
    lastUpdatedAt: state.conversations[0]?.updatedAt || ""
  }].concat(state.projects);

  projectList.innerHTML = allProjects.map((project) => renderProjectCard(project)).join("") || `
    <div class="empty-state">\u8fd8\u6ca1\u6709\u5df2\u5f52\u6863\u7684\u9879\u76ee\u3002</div>
  `;

  for (const button of projectList.querySelectorAll("[data-project-key]")) {
    button.addEventListener("click", () => {
      state.selectedProjectKey = button.dataset.projectKey;
      render();
    });
  }

  for (const button of projectList.querySelectorAll("[data-export-project]")) {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const projectKey = button.dataset.exportProject;
      const result = await sendMessage({
        type: "export-project-markdown",
        payload: { projectKey }
      });
      if (!result?.ok) {
        window.alert(result?.error || "\u9879\u76ee Markdown \u5bfc\u51fa\u5931\u8d25\u3002");
      }
    });
  }

  for (const button of projectList.querySelectorAll("[data-delete-project]")) {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const projectKey = button.dataset.deleteProject;
      const project = state.projects.find((item) => item.key === projectKey);
      const label = project ? `\u300c${project.projectName}\u300d` : "\u8fd9\u4e2a\u5f52\u6863\u7ec4";
      const confirmed = window.confirm(`${label}\n\u786e\u8ba4\u5220\u9664\uff1f\n\u8fd9\u4f1a\u5220\u6389\u8fd9\u7ec4\u91cc\u7684\u6240\u6709\u5bf9\u8bdd\u5f52\u6863\uff0c\u4e0d\u53ef\u6062\u590d\u3002`);
      if (!confirmed) {
        return;
      }

      const result = await sendMessage({
        type: "delete-project",
        payload: { projectKey }
      });
      if (!result?.ok) {
        window.alert(result?.error || "\u5220\u9664\u5f52\u6863\u7ec4\u5931\u8d25\u3002");
        return;
      }

      if (state.selectedProjectKey === projectKey) {
        state.selectedProjectKey = "all";
      }

      await loadOverview();
    });
  }
}

function renderProjectCard(project) {
  const isActive = project.key === state.selectedProjectKey;
  const extraActions = project.key === "all"
    ? ""
    : `
        <button class="secondary" data-export-project="${escapeHtml(project.key)}">\u5bfc\u51fa Markdown</button>
        <button class="danger" data-delete-project="${escapeHtml(project.key)}">\u5220\u9664\u8fd9\u7ec4</button>
      `;

  return `
    <article class="project-item ${isActive ? "active" : ""}" data-project-key="${escapeHtml(project.key)}">
      <div class="badge">${escapeHtml(project.workspaceName)}</div>
      <h3>${escapeHtml(project.projectName)}</h3>
      <div class="project-meta">
        <div class="meta-line">\u4f1a\u8bdd\uff1a${escapeHtml(String(project.conversationCount))}</div>
        <div class="meta-line">\u6d88\u606f\uff1a${escapeHtml(String(project.messageCount))}</div>
        ${project.lastUpdatedAt ? `<div class="meta-line">\u6700\u8fd1\u5f52\u6863\uff1a${escapeHtml(project.lastUpdatedAt)}</div>` : ""}
      </div>
      <div class="project-actions">
        <button class="ghost" data-project-key="${escapeHtml(project.key)}">\u7b5b\u9009</button>
        ${extraActions}
      </div>
    </article>
  `;
}

function renderConversations() {
  const filtered = state.conversations.filter(matchesFilters);
  const messageCount = filtered.reduce((sum, item) => sum + item.messages.length, 0);
  resultSummary.textContent = `\u5f53\u524d\u89c6\u56fe\u5305\u542b ${filtered.length} \u4e2a\u4f1a\u8bdd\uff0c\u5339\u914d\u5230 ${messageCount} \u6761\u6d88\u606f\u3002`;

  if (filtered.length === 0) {
    conversationList.innerHTML = `
      <div class="empty-state">
        \u8fd8\u6ca1\u6709\u5339\u914d\u5230\u5f52\u6863\u3002\u53ef\u4ee5\u5148\u56de\u5230 ChatGPT \u9875\u9762\uff0c\u5728\u6269\u5c55\u5f39\u7a97\u91cc\u70b9\u201c\u8bb0\u5f55\u5f53\u524d\u804a\u5929\u201d\u3002
      </div>
    `;
    return;
  }

  conversationList.innerHTML = filtered.map((conversation) => renderConversationCard(conversation)).join("");

  for (const button of conversationList.querySelectorAll("[data-toggle-transcript]")) {
    button.addEventListener("click", () => toggleTranscript(button.dataset.toggleTranscript));
  }

  for (const button of conversationList.querySelectorAll("[data-rename-conversation]")) {
    button.addEventListener("click", async () => {
      const conversationId = button.dataset.renameConversation;
      const current = state.conversations.find((item) => item.id === conversationId);
      const nextTitle = window.prompt("\u8bf7\u8f93\u5165\u65b0\u7684\u5f52\u6863\u540d\u79f0", current?.customTitle || current?.title || "");
      if (nextTitle === null) {
        return;
      }

      const result = await sendMessage({
        type: "rename-conversation",
        payload: {
          conversationId,
          customTitle: nextTitle.trim()
        }
      });

      if (!result?.ok) {
        window.alert(result?.error || "\u4fee\u6539\u5f52\u6863\u540d\u79f0\u5931\u8d25\u3002");
        return;
      }

      await loadOverview();
    });
  }

  for (const button of conversationList.querySelectorAll("[data-delete-conversation]")) {
    button.addEventListener("click", async () => {
      const conversationId = button.dataset.deleteConversation;
      const current = state.conversations.find((item) => item.id === conversationId);
      const label = current?.title || current?.sourceTitle || "\u8fd9\u6761\u5f52\u6863";
      const confirmed = window.confirm(`\u786e\u8ba4\u5220\u9664\u300c${label}\u300d\uff1f\n\u5220\u9664\u540e\u4e0d\u53ef\u6062\u590d\u3002`);
      if (!confirmed) {
        return;
      }

      const result = await sendMessage({
        type: "delete-conversation",
        payload: {
          conversationId
        }
      });
      if (!result?.ok) {
        window.alert(result?.error || "\u5220\u9664\u5f52\u6863\u5931\u8d25\u3002");
        return;
      }

      await loadOverview();
    });
  }

  for (const button of conversationList.querySelectorAll("[data-export-conversation]")) {
    button.addEventListener("click", async () => {
      const result = await sendMessage({
        type: "export-conversation-markdown",
        payload: {
          conversationId: button.dataset.exportConversation
        }
      });
      if (!result?.ok) {
        window.alert(result?.error || "Markdown \u5bfc\u51fa\u5931\u8d25\u3002");
      }
    });
  }
}

function renderConversationCard(conversation) {
  const transcriptId = `transcript-${conversation.id}`;
  const hasCustomTitle = Boolean(conversation.customTitle && conversation.customTitle !== conversation.sourceTitle);

  return `
    <article class="conversation-item">
      <div class="section-head">
        <div>
          <div class="badge">${escapeHtml(conversation.projectName)}</div>
          <h3>${escapeHtml(conversation.title)}</h3>
        </div>
        ${hasCustomTitle ? '<span class="badge">自定义归档名</span>' : ""}
      </div>
      <div class="conversation-meta">
        <div class="meta-line">\u539f\u59cb\u6807\u9898\uff1a${escapeHtml(conversation.sourceTitle)}</div>
        <div class="meta-line">\u7a7a\u95f4 / \u9879\u76ee\uff1a${escapeHtml(conversation.workspaceName)} / ${escapeHtml(conversation.projectName)}</div>
        <div class="meta-line">\u6d88\u606f\u6570\uff1a${escapeHtml(String(conversation.messages.length))} | \u6700\u8fd1\u5f52\u6863\uff1a${escapeHtml(conversation.updatedAt)}</div>
      </div>
      <div class="actions">
        <button class="secondary" data-rename-conversation="${escapeHtml(conversation.id)}">\u4fee\u6539\u540d\u79f0</button>
        <button class="secondary" data-export-conversation="${escapeHtml(conversation.id)}">\u5bfc\u51fa Markdown</button>
        <button class="danger" data-delete-conversation="${escapeHtml(conversation.id)}">\u5220\u9664\u8fd9\u6761</button>
        <button class="ghost" data-toggle-transcript="${escapeHtml(transcriptId)}">\u5c55\u5f00 / \u6536\u8d77</button>
      </div>
      <div class="transcript hidden" id="${escapeHtml(transcriptId)}">
        ${conversation.messages.map(renderMessage).join("")}
      </div>
    </article>
  `;
}

function renderMessage(message) {
  const blocks = [];
  if (message.markdown) {
    blocks.push(`<div class="message-body">${escapeHtml(message.markdown)}</div>`);
  }

  if (Array.isArray(message.codeBlocks) && message.codeBlocks.length > 0) {
    for (const block of message.codeBlocks) {
      blocks.push(`<pre>${escapeHtml(block.code || "")}</pre>`);
    }
  }

  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    const items = message.attachments
      .map((attachment) => {
        const label = attachment.sourceUrl ? `<a href="${escapeAttribute(attachment.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(attachment.name || attachment.sourceUrl)}</a>` : escapeHtml(attachment.name || "附件");
        return `<li>${label}</li>`;
      })
      .join("");
    blocks.push(`<div class="message-body">\u9644\u4ef6\uff1a<ul>${items}</ul></div>`);
  }

  return `
    <article class="message-item ${escapeHtml(message.role)}">
      <div class="message-meta">
        <span class="message-role">${escapeHtml(roleLabel(message.role))}</span>
        ${message.createdAt ? `<span> ${escapeHtml(message.createdAt)}</span>` : ""}
      </div>
      ${blocks.join("") || '<div class="message-body">（内容为空）</div>'}
    </article>
  `;
}

function matchesFilters(conversation) {
  const matchesProject = state.selectedProjectKey === "all" || buildProjectKey(conversation) === state.selectedProjectKey;
  if (!matchesProject) {
    return false;
  }

  if (!state.query) {
    return true;
  }

  const haystack = [
    conversation.title,
    conversation.sourceTitle,
    conversation.customTitle,
    conversation.workspaceName,
    conversation.projectName,
    ...conversation.messages.map((message) => message.markdown || message.text || "")
  ]
    .join("\n")
    .toLowerCase();

  return haystack.includes(state.query);
}

function toggleTranscript(transcriptId) {
  const node = document.getElementById(transcriptId);
  if (!node) {
    return;
  }
  node.classList.toggle("hidden");
}

function buildProjectKey(conversation) {
  return `${conversation.workspaceName}::${conversation.projectName}`;
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }
      resolve(response);
    });
  });
}
