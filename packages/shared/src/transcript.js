function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderMarkdownTranscript(archive) {
  const lines = [
    `# ${archive.conversation.title}`,
    "",
    `- Workspace: ${archive.workspace.name}`,
    `- Project: ${archive.project.name}`,
    `- Conversation ID: ${archive.conversation.id}`,
    `- Source URL: ${archive.conversation.url || "N/A"}`,
    `- Captured At: ${archive.capturedAt}`,
    ""
  ];

  for (const message of archive.messages) {
    lines.push(`## ${capitalize(message.role)}`);
    lines.push("");

    if (message.createdAt) {
      lines.push(`_Created: ${message.createdAt}_`);
      lines.push("");
    }

    if (message.markdown) {
      lines.push(message.markdown);
      lines.push("");
    }

    if (message.codeBlocks.length) {
      lines.push("### Code Blocks");
      lines.push("");

      for (const block of message.codeBlocks) {
        lines.push("```" + (block.language || ""));
        lines.push(block.code);
        lines.push("```");
        lines.push("");
      }
    }

    if (message.attachments.length) {
      lines.push("### Attachments");
      lines.push("");
      for (const asset of message.attachments) {
        lines.push(`- ${asset.name} (${asset.kind})`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim() + "\n";
}

export function renderHtmlTranscript(archive) {
  const sections = archive.messages
    .map((message) => {
      const attachments = message.attachments.length
        ? `<ul>${message.attachments
            .map((asset) => `<li>${escapeHtml(asset.name)} (${escapeHtml(asset.kind)})</li>`)
            .join("")}</ul>`
        : "";

      const codeBlocks = message.codeBlocks.length
        ? message.codeBlocks
            .map(
              (block) =>
                `<pre><code data-language="${escapeHtml(block.language)}">${escapeHtml(
                  block.code
                )}</code></pre>`
            )
            .join("")
        : "";

      return `
        <section class="message role-${escapeHtml(message.role)}">
          <header>
            <strong>${escapeHtml(capitalize(message.role))}</strong>
            ${message.createdAt ? `<time>${escapeHtml(message.createdAt)}</time>` : ""}
          </header>
          <article>${message.html || `<pre>${escapeHtml(message.text)}</pre>`}</article>
          ${codeBlocks}
          ${attachments}
        </section>
      `;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(archive.conversation.title)}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #f5f1ea; color: #1f1f1f; }
      main { max-width: 920px; margin: 0 auto; padding: 32px 20px 64px; }
      .meta { padding: 16px 18px; background: white; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); }
      .message { margin-top: 18px; padding: 18px; background: white; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.06); }
      .message header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
      pre { overflow: auto; background: #f3f4f6; padding: 12px; border-radius: 12px; }
      article :is(p, ul, ol, pre, table) { margin-top: 0; }
      article table { border-collapse: collapse; width: 100%; }
      article th, article td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    </style>
  </head>
  <body>
    <main>
      <section class="meta">
        <h1>${escapeHtml(archive.conversation.title)}</h1>
        <p><strong>Workspace:</strong> ${escapeHtml(archive.workspace.name)}</p>
        <p><strong>Project:</strong> ${escapeHtml(archive.project.name)}</p>
        <p><strong>Conversation ID:</strong> ${escapeHtml(archive.conversation.id)}</p>
        <p><strong>Captured At:</strong> ${escapeHtml(archive.capturedAt)}</p>
      </section>
      ${sections}
    </main>
  </body>
</html>`;
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unknown";
}
