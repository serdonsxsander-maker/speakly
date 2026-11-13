# Speakly — Lemon Squeezy & Recurring Affiliate Setup Guide

## 1. Why Lemon Squeezy for Speakly?
- **Belgian & EU VAT Solved Automatically**: As a solo founder based in Belgium, selling software internationally requires calculating VAT per EU member state (OSS/MOSS) and filing quarterly declarations. Lemon Squeezy acts as the **Merchant of Record (MoR)**: they legally make the sale, calculate EU/BE VAT, issue compliant tax invoices, and remit the taxes.
- **Zero Fixed Overhead**: 0€ monthly fee. You only pay a small fee per transaction (5% + $0.50).
- **Native Recurring Affiliates**: Lemon Squeezy includes a built-in Affiliate system that handles partner registrations, referral link tracking, and automatically calculates the **30% recurring commission on paid subscription conversions only** (not free signups or cancelled churned users).

---

## 2. Lemon Squeezy Store Setup Checklist

### Step 1: Create your Store & Address
1. Go to [Lemon Squeezy](https://www.lemonsqueezy.com/) and register/sign in.
2. Under **Store Settings**:
   - Store Name: **Speakly**
   - Store URL: `speakly.lemonsqueezy.com`
   - Country: **Belgium** (Lemon Squeezy automatically registers your MoR status for EU VAT).

### Step 2: Create the Subscription Product
1. Go to **Products** -> **New Product**:
   - Product Name: `Speakly Pro`
   - Description: `Sub-second AI voice dictation with Groq LPU silicon across macOS & Windows.`
   - Pricing Model: **Subscription**
   - Billing Frequency: **Monthly**
   - Price: `$10.00` (or `€10.00`)
   - Free Trial: `14 days`
   - Tax Category: **Digital Goods / SaaS Software** (automatically taxes at correct EU rates).
2. Save and note the **Variant ID** or product checkout link (`https://speakly.lemonsqueezy.com/buy/...`).

### Step 3: Enable Native Lemon Squeezy Affiliates
1. In your Lemon Squeezy sidebar, click **Affiliates**.
2. Click **Activate Affiliates**:
   - Default Commission: **30%**
   - Commission Type: **Recurring** (partners earn 30% every month their referred customer stays active).
   - Minimum Payout: Set to $25 or $50.
   - Payout Method: Lemon Squeezy manages affiliate payouts directly (PayPal / direct bank transfer).
3. Copy your **Public Affiliate Registration Link** (e.g. `https://speakly.lemonsqueezy.com/affiliates`).
   - Share this with influencers, AI creators, Cursor advocates, and tech partners.
   - When partners sign up, they receive their custom affiliate link (e.g. `?aff=XYZ`).
   - Our website has `https://assets.lemonsqueezy.com/lemon.js` installed, which automatically captures and cookies `?aff=...` and passes it through checkout.

### Step 4: Configure Webhooks
1. In Lemon Squeezy, navigate to **Settings** -> **Webhooks**.
2. Click **Create Webhook**:
   - Callback URL: `https://speakly-backend.onrender.com/api/v1/billing/webhook` (or your local ngrok/backend URL during development).
   - Secret: Generate a random secret string (e.g. using `openssl rand -hex 24`).
   - Select Events:
     - `subscription_created`
     - `subscription_updated`
     - `subscription_cancelled`
     - `subscription_resumed`
     - `subscription_expired`
     - `subscription_paused`
     - `subscription_unpaused`
     - `subscription_payment_success`
     - `subscription_payment_failed`
     - `order_created`
     - `order_refunded`
3. Copy the Secret into your environment variables:
   ```env
   LEMONSQUEEZY_WEBHOOK_SECRET=your_secret_here
   ```

---

## 3. End-to-End Attribution & Checkout Architecture

```
User visits website with ?ref=ALEX or ?aff=1234
    │
    ├─> Website records "ALEX" into localStorage ("speakly_referral_code")
    ├─> Lemon.js records affiliate cookie ("lmsqueezy_aff")
    │
User signs up in App or Website
    │
    ├─> Referral code saved into Supabase: auth.users.user_metadata.referral_code
    │
User clicks "Upgrade to Pro" ($10/mo)
    │
    ├─> App/Web triggers Lemon Squeezy checkout with:
    │     checkout[custom][user_id]       = Supabase User UUID
    │     checkout[custom][referral_code] = "ALEX"
    │     checkout[email]                 = user@example.com
    │
Lemon Squeezy Checkout Completed
    │
    ├─> Lemon Squeezy collects EU/Belgian VAT automatically
    ├─> Lemon Squeezy Affiliates logs 30% recurring commission for affiliate
    ├─> Webhook fired to /api/v1/billing/webhook
    │
Backend Webhook Execution
    │
    ├─> Verifies HMAC-SHA256 signature
    ├─> Updates Supabase auth.users.raw_user_meta_data.speakly_subscription
    ├─> Upserts into public.subscriptions table (plan: 'pro', status: 'active')
    ├─> On paid invoice: Inserts into public.partner_conversions (30% commission attributed)
    │
Founder Morning Run
    │
    └─> Run: node scripts/stats.js
        Instantly view Active Pro MRR, signups, and 30% partner commissions!
```

---

## 4. Run the Supabase Database Migration
In your Supabase project SQL Editor, run:
```bash
# File: supabase/migrations/20261112170000_lemon_squeezy.sql
```
This creates:
- `public.subscriptions`
- `public.partner_conversions`
- `public.partner_revenue_summary` (instant rollup of signups, paying users, gross revenue, and 30% commission).
