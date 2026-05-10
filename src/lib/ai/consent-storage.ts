const STORAGE_KEY = "securetalks_ai_consent_v1";

export function hasAcceptedAiConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAiConsentAccepted(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* quota / private mode */
  }
}
