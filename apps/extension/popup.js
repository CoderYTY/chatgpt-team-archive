const TEXT = {
  loadingContext: "\u6b63\u5728\u8bfb\u53d6\u5f53\u524d\u804a\u5929...",
  noContext: "\u672a\u8bfb\u53d6\u5230\u804a\u5929\u4fe1\u606f",
  untitled: "\u672a\u547d\u540d\u4f1a\u8bdd",
  contextLoaded: "\u5df2\u8bfb\u53d6\u5f53\u524d\u804a\u5929\u4fe1\u606f",
  project: "\u9879\u76ee",
  workspace: "\u7a7a\u95f4",
  currentTitle: "\u539f\u59cb\u6807\u9898",
  archiveTitle: "\u5f52\u6863\u540d\u79f0",
  recording: "\u6b63\u5728\u624b\u52a8\u8bb0\u5f55\u5f53\u524d\u804a\u5929...",
  waiting: "\u7b49\u5f85\u624b\u52a8\u5f52\u6863...",
  failed: "\u64cd\u4f5c\u5931\u8d25",
  skipped: "\u672c\u6b21\u672a\u5f52\u6863",
  success: "\u8bb0\u5f55\u6210\u529f",
  time: "\u65f6\u95f4",
  trigger: "\u89e6\u53d1\u65b9\u5f0f",
  reason: "\u539f\u56e0",
  newMessages: "\u65b0\u589e\u6d88\u606f",
  manual: "\u624b\u52a8",
  unknown: "\u672a\u77e5"
};

const currentChatTitleInput = document.getElementById("currentChatTitle");
const archiveTitleInput = document.getElementById("archiveTitle");
const statusText = document.getElementById("statusText");

document.getElementById("refreshContextButton").addEventListener("click", loadActiveContext);
document.getElementById("backupButton").addEventListener("click", backupCurrent);
document.getElementById("viewerButton").addEventListener("click", openViewer);
archiveTitleInput.addEventListener("input", () => {
  archiveTitleInput.dataset.autoFilled = "false";
});

void load();

async function load() {
  const settings = await sendMessage({ type: "get-settings" });
  statusText.textContent = formatStatus(settings?.lastStatus || null);
  await loadActiveContext();
}

async function loadActiveContext() {
  currentChatTitleInput.value = TEXT.loadingContext;
  const context = await sendMessage({ type: "get-active-context" });

  if (!context?.ok) {
    currentChatTitleInput.value = TEXT.noContext;
    statusText.textContent = formatStatus(context);
    return;
  }

  currentChatTitleInput.value = context.chatTitle || TEXT.untitled;
  if (!archiveTitleInput.value.trim() || archiveTitleInput.dataset.autoFilled === "true") {
    archiveTitleInput.value = context.chatTitle || "";
    archiveTitleInput.dataset.autoFilled = "true";
  }

  statusText.textContent = [
    TEXT.contextLoaded,
    context.projectName ? `${TEXT.project}\uff1a${context.projectName}` : null,
    context.workspaceName ? `${TEXT.workspace}\uff1a${context.workspaceName}` : null,
    context.chatTitle ? `${TEXT.currentTitle}\uff1a${context.chatTitle}` : null,
    archiveTitleInput.value ? `${TEXT.archiveTitle}\uff1a${archiveTitleInput.value}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

async function backupCurrent() {
  statusText.textContent = TEXT.recording;
  const rawTitle = archiveTitleInput.value.trim();
  const currentTitle = (currentChatTitleInput.value || "").trim();
  const customTitle = archiveTitleInput.dataset.autoFilled === "true" && rawTitle === currentTitle ? "" : rawTitle;

  const result = await sendMessage({
    type: "manual-backup",
    payload: {
      customTitle
    }
  });

  statusText.textContent = formatStatus(result);
}

async function openViewer() {
  await sendMessage({ type: "open-viewer" });
}

function formatStatus(status) {
  if (!status) {
    return TEXT.waiting;
  }

  if (status.error) {
    return [
      TEXT.failed,
      status.capturedAt ? `${TEXT.time}\uff1a${status.capturedAt}` : null,
      status.trigger ? `${TEXT.trigger}\uff1a${translateTrigger(status.trigger)}` : null,
      `${TEXT.reason}\uff1a${status.error || TEXT.unknown}`
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (status.skipped) {
    return [
      TEXT.skipped,
      status.trigger ? `${TEXT.trigger}\uff1a${translateTrigger(status.trigger)}` : null,
      `${TEXT.reason}\uff1a${status.reason || TEXT.unknown}`
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    TEXT.success,
    status.capturedAt ? `${TEXT.time}\uff1a${status.capturedAt}` : null,
    status.title ? `${TEXT.archiveTitle}\uff1a${status.title}` : null,
    status.sourceTitle ? `${TEXT.currentTitle}\uff1a${status.sourceTitle}` : null,
    `${TEXT.trigger}\uff1a${translateTrigger(status.trigger)}`,
    `${TEXT.newMessages}\uff1a${status.newMessages ?? 0}`
  ]
    .filter(Boolean)
    .join("\n");
}

function translateTrigger(trigger) {
  return trigger === "manual" ? TEXT.manual : trigger || TEXT.unknown;
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
