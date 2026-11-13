# Speakly Central Marketing Hub: API & Automated Data Pipeline Integration Guide

This guide gives you the exact credentials, scopes, webhooks, and step-by-step setup instructions to connect your **Speakly Marketing OS** to all advertising, social, analytics, and AI video cloud services.

---

## 📑 Integration Architecture Overview

```
                          ┌─────────────────────────────────────┐
                          │     Speakly Marketing OS (Hub)      │
                          │        (marketing/index.html)       │
                          └──────────────────┬──────────────────┘
                                             │
      ┌──────────────────────┬───────────────┴───────────────┬──────────────────────┐
      ▼                      ▼                               ▼                      ▼
┌───────────────┐     ┌───────────────┐               ┌───────────────┐      ┌───────────────┐
│ Client & MRR  │     │  Paid Ad &    │               │ Social Media  │      │ UGC & Cloud   │
│ Telemetry     │     │  Analytics    │               │ Auto-Publish  │      │ AI Video      │
├───────────────┤     ├───────────────┤               ├───────────────┤      ├───────────────┤
│ • Supabase    │     │ • Meta Ads    │               │ • TikTok API  │      │ • Inference.sh│
│ • Stripe /    │     │ • TikTok Ads  │               │ • YouTube API │      │   (Veo/Wan)   │
│   LemonSqueezy│     │ • Google Ads  │               │ • Meta Graph  │      │ • ElevenLabs  │
│ • Referral CRM│     │ • PostHog/GA4 │               │ • Make/Zapier │      │ • MediaRec.   │
└───────────────┘     └───────────────┘               └───────────────┘      └───────────────┘
```

---

## 1. 🗄️ Supabase Telemetry & Client Pipeline

Speakly already runs on Supabase (project `lwiznvgeemrkrildyyvw`). The Marketing Hub reads real user signups, early access onboarding completions, and referral partner attribution.

### Setup Instructions:
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard/project/lwiznvgeemrkrildyyvw).
2. Navigate to **Project Settings $\rightarrow$ API**.
3. Copy:
   - **Project URL:** `https://lwiznvgeemrkrildyyvw.supabase.co`
   - **Anon Public Key:** `eyJh...`
4. In your Speakly Marketing Hub, open **⚙️ API Integrations** and paste your URL and Anon Key.
5. **Referral Attribution Query:**
   The hub aggregates users by `user_metadata->>'referral_code'` to attribute every signup to a specific creator or hub (e.g. `COLEMEDIN`, `WINTERCIRCUS`).

```sql
-- Query run by the Hub to inspect partner attribution
select 
  raw_user_meta_data->>'referral_code' as partner_code,
  count(*) as total_signups,
  count(*) filter (where raw_user_meta_data->>'is_pro' = 'true') as paid_conversions
from auth.users
where raw_user_meta_data->>'referral_code' is not null
group by partner_code
order by total_signups desc;
```

---

## 2. 💳 Stripe / Lemon Squeezy (Subscriptions & Partner Payouts)

Once you activate subscription billing, connect your payment provider to feed real MRR, active paying subscribers, churn rate, and automated 35% partner commissions.

### Option A: Lemon Squeezy (Recommended for EU VAT & Built-in Affiliates)
* **Why Lemon Squeezy:** Acts as Merchant of Record (MoR) and handles all EU VAT for digital software in Belgium automatically, plus native affiliate tracking.
1. Sign up at [lemonsqueezy.com](https://lemonsqueezy.com) and create store **Speakly**.
2. Go to **Settings $\rightarrow$ API Keys** and generate a read-only API Key.
3. Go to **Webhooks $\rightarrow$ Create Webhook**:
   - URL: `https://speakly-backend.onrender.com/api/webhooks/lemonsqueezy`
   - Events: `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_payment_success`.
4. Enter your Lemon Squeezy API Key in the Marketing Hub to pull live MRR and churn metrics.

### Option B: Stripe Billing & Stripe Connect
1. In your [Stripe Dashboard](https://dashboard.stripe.com/apikeys), generate a Restricted API Key with read permissions for `Subscriptions`, `Customers`, and `Invoices`.
2. Add your **Stripe Restricted Key** to the Hub.

---

## 3. 📱 Social Media Analytics & Auto-Publishing

### A. TikTok for Business & Content Posting API
* **Developer Portal:** [developers.tiktok.com](https://developers.tiktok.com)
1. Register a TikTok Developer App: **Speakly Marketing OS**.
2. Request permissions:
   - `user.info.basic`, `user.info.stats` (to fetch follower count, views, profile visits).
   - `video.upload`, `video.publish` (for 1-click video publishing).
3. Once approved, copy your **Client Key** and **Client Secret**.
4. Generate an OAuth User Access Token and paste into the Hub.

### B. YouTube Data API v3 (Shorts Performance & Uploads)
* **Google Cloud Console:** [console.cloud.google.com](https://console.cloud.google.com)
1. Create project **Speakly Marketing**.
2. Enable **YouTube Data API v3**.
3. Create an **OAuth 2.0 Client ID** (Web application).
4. Required Scopes:
   - `https://www.googleapis.com/auth/youtube.readonly` (Stats, views, CTR)
   - `https://www.googleapis.com/auth/youtube.upload` (Direct Shorts publishing)
5. Paste your API Key and OAuth Token in the Hub.

### C. Meta Graph API (Instagram Reels & Facebook Ads)
* **Meta for Developers:** [developers.facebook.com](https://developers.facebook.com)
1. Create an App under **Business**.
2. Add products: **Instagram Graph API** and **Marketing API**.
3. Generate a Long-Lived System User Access Token with:
   - `instagram_basic`, `instagram_manage_insights`, `instagram_content_publish`
   - `ads_read`, `ads_management`
4. Add your **Meta App ID** and **Access Token** in the Hub to monitor Instagram reach and Meta ad spend.

### D. X / Twitter API v2
* **Developer Portal:** [developer.x.com](https://developer.x.com)
1. Sign up for the X Developer Basic/Pro tier.
2. Create Project **Speakly**.
3. Generate Bearer Token with `tweet.read`, `users.read`.
4. Enter Bearer Token in the Hub for live tweet impressions, retweets, and bookmark rates.

---

## 4. 🪝 1-Click Multi-Platform Auto-Publisher via Webhook (Make / Zapier / N8N)

Instead of managing separate complex OAuth tokens for 5 social platforms, the easiest and most reliable method is to use a **Webhook Dispatcher** in [Make.com](https://make.com) or [Zapier](https://zapier.com).

### The 1-Click Webhook Architecture:
1. In Make.com, create a scenario with a **Custom Webhook** trigger.
2. Route the webhook to 4 parallel branches:
   - **Branch 1:** Upload Video to TikTok
   - **Branch 2:** Upload Video to YouTube Shorts
   - **Branch 3:** Upload Video to Instagram Reels
   - **Branch 4:** Post Tweet with Video on X
3. Copy your Make.com Webhook URL (e.g., `https://hook.eu1.make.com/xxxxxxxxxxxx`).
4. In the Speakly Marketing Hub (**Tab: Video Studio & Dispatcher**), paste your Webhook URL.
5. Whenever you hit **🚀 Dispatch to All Channels**, the Hub transmits the following JSON payload:

```json
{
  "event": "publish_short_form_video",
  "project": "Speakly",
  "wedge": "AI Coding (Cursor)",
  "video_filename": "03-ad-creative-30s.mp4",
  "video_url": "https://speakly.app/assets/videos/03-ad-creative-30s.mp4",
  "caption": "Stop typing 3 paragraphs of context into Cursor Composer. Hold Right-⌘, speak your thought, and watch it paste in 0.29s.",
  "hashtags": ["#cursorai", "#vibecoding", "#developer", "#webdev", "#macapps"],
  "pinned_comment": "Early access for Mac & Windows is open at speakly.app 🦆 (0.29s latency on Groq LPUs)",
  "scheduled_at": "immediate",
  "channels": ["tiktok", "youtube_shorts", "instagram_reels", "x_twitter"]
}
```

---

## 5. 🤖 Cloud AI Video & Voice Services (UGC Ad Generation)

### A. Inference.sh (Veo 3.1, Seedance 2.0, Wan 2.5)
* [inference.sh](https://inference.sh) provides 40+ state-of-the-art AI video and avatar models accessible via CLI or REST API.
1. Run `belt login` in your terminal to obtain your API key.
2. Endpoint: `https://api.inference.sh/v1/apps/run`
3. Enter your Inference.sh API Key in the Marketing Hub to generate photorealistic UGC avatar b-roll on demand directly from the studio.

### B. ElevenLabs (Hyper-Realistic Developer Voiceovers)
1. Go to [elevenlabs.io](https://elevenlabs.io) $\rightarrow$ **Profile $\rightarrow$ API Keys**.
2. Copy your API Key.
3. Recommended Voice ID for high-converting developer ads:
   - `21m00Tcm4TlvDq8ikWAM` (Rachel - calm, clear tech narrator)
   - `pNInz6obpgDQGcFmaJgB` (Adam - deep, authoritative developer tone)
4. Enter your ElevenLabs API Key in the Hub to auto-generate crisp 158 WPM audio narrations for your UGC scripts.

---

## 🔒 Security & Privacy Notice
* All API keys entered into the Speakly Marketing Hub are stored strictly inside your browser's private `localStorage`.
* Keys are **never** transmitted to any external server or 3rd-party telemetry service.
* To clear all stored keys at any time, click **"Purge Saved Keys"** in the API Integrations tab.
