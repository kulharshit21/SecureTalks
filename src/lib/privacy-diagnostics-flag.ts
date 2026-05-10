/**
 * Privacy "Diagnostics" tab is for developers / audits only — not shown in production
 * unless NEXT_PUBLIC_SHOW_PRIVACY_DIAGNOSTICS=true (e.g. staging).
 */
export function showPrivacyDiagnosticsPanel(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.NEXT_PUBLIC_SHOW_PRIVACY_DIAGNOSTICS === "true";
}
