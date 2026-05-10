import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`Missing start marker: ${startMarker}`);
  }
  const from = start + startMarker.length;
  const end = source.indexOf(endMarker, from);
  if (end === -1) {
    throw new Error(`Missing end marker: ${endMarker}`);
  }
  return source.slice(from, end);
}

describe("normal send/receive paths stay AI-free", () => {
  const root = process.cwd();

  it("message composer send paths do not reference Mistral proxy", () => {
    const composer = readFileSync(path.join(root, "src/components/chat/message-composer.tsx"), "utf8");
    const sendText = sliceBetween(composer, "async function sendTextMessage()", "async function sendAttachmentMessage()");
    const sendAttach = sliceBetween(composer, "async function sendAttachmentMessage()", "async function onSubmit()");
    expect(sendText).not.toMatch(/callMistralProxy/);
    expect(sendText).not.toMatch(/\/api\/ai\/mistral/);
    expect(sendAttach).not.toMatch(/callMistralProxy/);
    expect(sendAttach).not.toMatch(/\/api\/ai\/mistral/);
  });

  it("chat-thread decrypt path does not reference Mistral proxy", () => {
    const thread = readFileSync(path.join(root, "src/components/chat/chat-thread.tsx"), "utf8");
    const decryptBlock = sliceBetween(thread, "async function decryptRow(row: WireMessage)", "async function refreshReceipts");
    expect(decryptBlock).not.toMatch(/callMistralProxy/);
    expect(decryptBlock).not.toMatch(/\/api\/ai\/mistral/);
  });

  it("encrypted attachment pipeline module does not reference Mistral", () => {
    const mod = readFileSync(path.join(root, "src/lib/chat/send-encrypted-attachment.ts"), "utf8");
    expect(mod).not.toMatch(/callMistralProxy/);
    expect(mod).not.toMatch(/mistral/i);
    expect(mod).not.toMatch(/\/api\/ai\/mistral/);
  });
});
