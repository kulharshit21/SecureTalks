export const ATTACHMENT_MANIFEST_KIND = "attachment" as const;

export type AttachmentManifest = {
  kind: typeof ATTACHMENT_MANIFEST_KIND;
  filename: string;
  mimeType: string;
  plaintextByteLength: number;
  caption?: string;
};

export function tryParseAttachmentManifest(decryptedUtf8: string): AttachmentManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decryptedUtf8);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (o.kind !== ATTACHMENT_MANIFEST_KIND) return null;
  if (typeof o.filename !== "string" || o.filename.length === 0) return null;
  if (typeof o.mimeType !== "string" || o.mimeType.length === 0) return null;
  if (typeof o.plaintextByteLength !== "number" || !Number.isFinite(o.plaintextByteLength) || o.plaintextByteLength < 0) {
    return null;
  }
  const caption = o.caption;
  return {
    kind: ATTACHMENT_MANIFEST_KIND,
    filename: o.filename,
    mimeType: o.mimeType,
    plaintextByteLength: o.plaintextByteLength,
    caption: typeof caption === "string" && caption.length > 0 ? caption : undefined,
  };
}
