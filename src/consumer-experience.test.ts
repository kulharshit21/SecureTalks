import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

import { extractOverviewPlainText } from "@/components/chat/privacy-copy";
import { APP_NAME } from "@/lib/brand";

describe("brand", () => {
  it("uses Privyra as product name constant", () => {
    expect(APP_NAME).toBe("Privyra");
  });

  it("auth shell brand file references Privyra not CipherSafe", () => {
    const fp = path.join(process.cwd(), "src/components/chat/auth-shell.tsx");
    const src = fs.readFileSync(fp, "utf8");
    expect(src).toContain("APP_NAME");
    expect(src).not.toMatch(/CipherSafe/);
  });
});

describe("privacy overview consumer copy", () => {
  it("does not leak technical stack terms in overview strings", () => {
    const text = extractOverviewPlainText().toLowerCase();
    expect(text).not.toContain("libsodium");
    expect(text).not.toContain("postgres");
    expect(text).not.toContain("rls");
    expect(text).not.toContain("x25519");
    expect(text).not.toContain("xchacha");
    expect(text).not.toContain("mistral");
    expect(text).not.toContain("edge functions");
  });
});

describe("chat home empty state", () => {
  it("hero avoids technical jargon in source", () => {
    const fp = path.join(process.cwd(), "src/app/chat/page.tsx");
    const src = fs.readFileSync(fp, "utf8");
    expect(src).toContain("Your private inbox starts here");
    expect(src).not.toMatch(/libsodium|Postgres|RLS|CipherSafe/i);
  });
});

describe("forgot password generic response", () => {
  it("page copy promises generic messaging", () => {
    const fp = path.join(process.cwd(), "src/app/forgot-password/page.tsx");
    const src = fs.readFileSync(fp, "utf8");
    expect(src).toContain("If an account exists");
    expect(src).not.toMatch(/no account found|user not found/i);
  });
});

describe("device reset honesty", () => {
  it("device gate warns old messages may not decrypt", () => {
    const fp = path.join(process.cwd(), "src/components/chat/device-gate.tsx");
    const src = fs.readFileSync(fp, "utf8");
    expect(src).toMatch(/may not decrypt|may not open/i);
    expect(src).not.toMatch(/recover all messages/i);
  });
});

describe("privacy diagnostics gating", () => {
  it("flag module documents dev vs prod behavior", () => {
    const fp = path.join(process.cwd(), "src/lib/privacy-diagnostics-flag.ts");
    const src = fs.readFileSync(fp, "utf8");
    expect(src).toContain("NODE_ENV");
    expect(src).toContain("NEXT_PUBLIC_SHOW_PRIVACY_DIAGNOSTICS");
  });
});

describe("AI send path", () => {
  it("sendTextMessage body does not invoke Mistral proxy", () => {
    const fp = path.join(process.cwd(), "src/components/chat/message-composer.tsx");
    const src = fs.readFileSync(fp, "utf8");
    const start = src.indexOf("async function sendTextMessage()");
    const end = src.indexOf("async function sendAttachmentMessage()", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fnBody = src.slice(start, end);
    expect(fnBody).not.toContain("callMistralProxy");
  });
});
