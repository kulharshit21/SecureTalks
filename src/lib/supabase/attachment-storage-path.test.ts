import { describe, expect, it } from "vitest";

import { ENCRYPTED_ATTACHMENTS_BUCKET, encryptedAttachmentObjectPath } from "@/lib/supabase/storage-buckets";

describe("attachment storage contract", () => {
  it("uses encrypted-attachments bucket constant", () => {
    expect(ENCRYPTED_ATTACHMENTS_BUCKET).toBe("encrypted-attachments");
  });

  it("paths are conversation_id/message_id/attachment_id.bin", () => {
    const c = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const m = "11111111-2222-4333-8444-555555555555";
    const a = "66666666-7777-4888-8999-aaaaaaaaaaaa";
    expect(encryptedAttachmentObjectPath(c, m, a)).toBe(`${c}/${m}/${a}.bin`);
  });
});
