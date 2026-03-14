import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ArchiveStore } from "./archive-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewerRoot = path.resolve(__dirname, "../../viewer");
const store = new ArchiveStore();
const port = Number(process.env.PORT || 3184);

await store.init();

const server = createServer(async (req, res) => {
  try {
    enableCors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, {
        ok: true,
        archiveDir: store.rootDir
      });
    }

    if (req.method === "POST" && url.pathname === "/api/archive/conversations") {
      const body = await readJsonBody(req);
      const result = await store.ingestConversation(body);
      return sendJson(res, 200, {
        ok: true,
        summary: {
          conversationId: result.archive.conversation.id,
          title: result.archive.conversation.title,
          newMessages: result.newMessages,
          savedAssets: result.savedAssets
        }
      });
    }

    if (req.method === "GET" && url.pathname === "/api/projects") {
      return sendJson(res, 200, {
        ok: true,
        projects: await store.listProjects()
      });
    }

    if (req.method === "GET" && url.pathname === "/api/search") {
      const result = await store.search({
        q: url.searchParams.get("q") || "",
        workspace: url.searchParams.get("workspace") || "",
        project: url.searchParams.get("project") || ""
      });
      return sendJson(res, 200, { ok: true, ...result });
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/conversations/")) {
      const conversationId = decodeURIComponent(url.pathname.split("/").pop());
      const conversation = await store.getConversation(conversationId);

      if (!conversation) {
        return sendJson(res, 404, { ok: false, error: "Conversation not found" });
      }

      return sendJson(res, 200, { ok: true, ...conversation });
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/api/conversations/")) {
      const conversationId = decodeURIComponent(url.pathname.split("/").pop());
      const body = await readJsonBody(req);
      const result = await store.renameConversation(conversationId, body.title || "");

      if (!result) {
        return sendJson(res, 404, { ok: false, error: "Conversation not found" });
      }

      return sendJson(res, 200, { ok: true, ...result });
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/export/")) {
      const [, , , workspaceSlug, projectSlug] = url.pathname.split("/");
      const format = url.searchParams.get("format") || "bundle";
      const data = await store.exportProject(workspaceSlug, projectSlug, format);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${projectSlug}-${format}.json"`
      });
      res.end(JSON.stringify(data, null, 2));
      return;
    }

    if (req.method === "GET") {
      return serveViewer(res, url);
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown server error"
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ChatGPT Team Archive companion listening on http://127.0.0.1:${port}`);
});

async function serveViewer(res, url) {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.join(viewerRoot, pathname);

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentType(filePath)
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function enableCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}