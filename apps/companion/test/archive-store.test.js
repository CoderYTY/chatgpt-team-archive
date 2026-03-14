import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ArchiveStore } from "../src/archive-store.js";

test("ArchiveStore manually appends messages and preserves custom titles", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chatgpt-archive-"));
  const store = new ArchiveStore(root);
  await store.init();

  const firstPayload = {
    capturedAt: "2026-03-14T12:00:00.000Z",
    workspace: { name: "Team Alpha" },
    project: { name: "Interview Prep" },
    conversation: {
      id: "conv-123",
      title: "八股文面试题 - 第一轮",
      sourceTitle: "算法笔试题",
      customTitle: "八股文面试题 - 第一轮",
      url: "https://chatgpt.com/c/conv-123"
    },
    messages: [
      {
        id: "m-1",
        role: "user",
        markdown: "第一题：最长无重复子串"
      },
      {
        id: "m-2",
        role: "assistant",
        markdown: "可以用滑动窗口。"
      }
    ]
  };

  const secondPayload = {
    ...firstPayload,
    capturedAt: "2026-03-14T12:05:00.000Z",
    conversation: {
      id: "conv-123",
      title: "算法笔试题",
      sourceTitle: "算法笔试题",
      customTitle: "",
      url: "https://chatgpt.com/c/conv-123"
    },
    messages: [...firstPayload.messages, {
      id: "m-3",
      role: "user",
      markdown: "第二题：反转链表"
    }]
  };

  const first = await store.ingestConversation(firstPayload);
  const second = await store.ingestConversation(secondPayload);

  assert.equal(first.newMessages, 2);
  assert.equal(second.newMessages, 1);
  assert.equal(second.manifest.conversation.title, "八股文面试题 - 第一轮");

  const renamed = await store.renameConversation("conv-123", "手动归档名");
  assert.equal(renamed.manifest.conversation.title, "手动归档名");
  assert.equal(renamed.manifest.conversation.sourceTitle, "算法笔试题");

  const conversation = await store.getConversation("conv-123");
  assert.equal(conversation.messages.length, 3);

  const transcript = await readFile(path.join(renamed.manifest.conversationDir, "transcript.md"), "utf8");
  assert.match(transcript, /手动归档名/);

  const search = await store.search({ q: "手动归档名" });
  assert.equal(search.conversations.length, 1);
});