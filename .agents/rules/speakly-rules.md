# Speakly: rules for every agent and chat

Read `PROJECT_MEMORY.md` at the repo root before making product, pricing or marketing decisions.

## Security (non-negotiable)
- **Never hardcode API keys or secrets** (Groq, OpenAI, Stripe/payment, service-role keys) in `app/`, `website/` or any shipped file. The desktop app is a public download, so anything inside it is public.
- AI provider keys live **only** on the backend (`backend/`, Render env vars). The desktop app talks to the Speakly backend and never directly to Groq or OpenAI with a shared key.
- The Supabase **anon** key may live in the app (it's public by design). Data protection comes from Row Level Security policies, which must exist on every table.
- Never commit `.env` files. Never paste secrets into chat output, logs or artifacts.

## Product
- **The Rubber Ducky mascot must NEVER be changed** (pill HUD and menu bar/tray, all three states: Listening, Thinking, Solved/Pasted).
- Keep the desktop app **simple**. Every new feature must justify its added complexity.
- **No BYOK ("bring your own key")** in the product, pricing or marketing. Speakly is a managed subscription.
- Onboarding order: **create account → (billing, once live) → permissions (Microphone, Accessibility) → first dictation.**

## Marketing and claims
- Claims must be **reasonable and buildable**. We may describe features that are near-term feasible, but **ask the founder for permission before publishing any claim about a feature that doesn't exist yet**.
- No paid ads or upfront spend without explicit founder approval. Prefer commission-only partnerships.
- Affiliate/partner commission is paid **only on actual paid revenue**, recurring, and **stops when the referred customer cancels or refunds**. Never offer free lifetime Pro (API costs are real). A free month or a discount is fine.

## Process
- Ask before spending money, sending emails or posting publicly on the founder's behalf. Draft first, founder approves.
- Update `PROJECT_MEMORY.md` when a decision is made.
