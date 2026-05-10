// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "path";

import { describe, expect, it } from "vitest";

describe("secrets stay server-only in client modules", () => {
  const root = process.cwd();

  it("browser Supabase client never references service role key string", () => {
    const src = readFileSync(path.join(root, "src/lib/supabase/client.ts"), "utf8");
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("AI browser client never references Mistral secret env name", () => {
    const src = readFileSync(path.join(root, "src/lib/ai/client.ts"), "utf8");
    expect(src).not.toMatch(/MISTRAL_API_KEY/);
  });

  it("no NEXT_PUBLIC_MISTRAL in env example", () => {
    const ex = readFileSync(path.join(root, ".env.example"), "utf8");
    expect(ex).not.toMatch(/NEXT_PUBLIC_MISTRAL/);
  });
});
