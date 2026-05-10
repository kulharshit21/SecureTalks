# AI features & privacy (Mistral)

SecureTalks may offer **optional** assistant features powered by **Mistral** through a **server-side proxy**. These features are **never** wired into normal send/receive/decrypt flows.

## Hard rule

**Private conversation traffic must never be sent to Mistral automatically.**

That includes:

- Incoming realtime inserts  
- Background decryption  
- Plain “Send” / attachment encrypt-upload paths  
- Periodic refresh or receipt polling  

No cron, no middleware hook, and no `useEffect` on message lists may call the AI proxy.

## Allowed purposes (explicit user action only)

| Feature | What may be sent | User steps |
|--------|-------------------|------------|
| **Rewrite draft** | Only the current textarea draft | Click **Rewrite draft** → first-time consent → optional edit → server receives that string once |
| **Summarize export** | Only text built from **messages the user checked** in summarize mode, plus confirmation | **Select messages to summarize** → tick rows → **Review export & summarize…** → edit excerpt → **Send to Mistral & summarize** |
| **Report analysis** | Only the **single reported** plaintext snippet | **Abuse analysis (AI)** on a message → review → **Confirm & analyze with Mistral** |
| **Smart reply** | Only **peer-visible plaintext** already rendered on device (bounded window), after explicit click | **Suggest reply (AI)** → consent if needed → server receives that excerpt once |

Attachments without decrypted caption/text are **not** selectable for summarize/report unless the UI exposes explicit text (captions may be included where decrypted).

## Server behaviour

- **`POST /api/ai/mistral`** requires an authenticated Supabase session.  
- **Rate limiting** applies per user ID (configurable env).  
- **Prompts and model outputs are not logged** by application code (avoid server logs that echo bodies).  
- **Secrets**: `MISTRAL_API_KEY` is server-only; never exposed to the browser.

## Threat notes

- Mistral is a **third party**. Any opt-in send exposes **that slice of content** to Mistral under their policies.  
- Users should treat AI features like **paste-to-external-tool**: intentional, scoped, revocable by not using them.

For product copy shown in-app, see the **AI features** banner and consent dialogs.
