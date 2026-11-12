# Speakly Founder Early Access Runbook
*The daily operating manual for running Speakly as a solo founder.*

---

## ☀️ 1. Daily Morning Routine (5 Minutes)

### A. Check User Feedback (Bug Reports & Feature Ideas)
1. Open your [Supabase Dashboard](https://supabase.com/dashboard/project/lwiznvgeemrkrildyyvw) $\rightarrow$ **Table Editor** $\rightarrow$ `feedback`.
2. Review new incoming messages:
   - `kind = 'bug'`: Check OS and message to triage quick fixes.
   - `kind = 'idea'`: Track common feature requests.
3. Update `status` to `'triaged'` or `'resolved'` as you work through them.

### B. Check Partner Referral Signups
1. Open Supabase **SQL Editor**.
2. Run:
   ```sql
   select * from partner_performance_summary;
   ```
3. See which creator codes (`DOMINIK`, `ALEX`, `VIBECODE`, etc.) drove signups over the last 24 hours.

---

## 💰 2. Commission & Affiliate Model
- **Rule:** Pay commission **only on paid subscriptions** (not free signups).
- **Structure:** 30–35% recurring rev-share for the first 12 months of each active subscription.
- **Auto-cancellation:** Handled automatically by your Merchant of Record (Lemon Squeezy / Polar). When a user churns or refunds, the payout ceases immediately.
- **Payout Schedule:** Net-30 via SEPA direct to your Belgian business bank account.

---

## 🛠️ 3. Deploying App Updates & Fixes

When you fix a bug and want to push a new release:

1. **Bump Version:**
   In `app/package.json`, update `"version": "1.0.1"`.
2. **Build Clean Installers:**
   ```bash
   cd app
   npm run dist:mac
   npm run dist:win
   ```
3. **Publish to GitHub Releases:**
   ```bash
   ./scripts/publish-release.sh v1.0.1
   ```

---

## 📞 4. Creator Outreach Cadence
- Send **5 personalized outreach DMs per day** from [`marketing/CAMPAIGN_BATCH_1.md`](../marketing/CAMPAIGN_BATCH_1.md).
- Follow up once after 4 days if no reply:
  > *"Hey [Name], quick follow-up—just pushed our v1.0.1 build with improved audio device switching. Let me know if you want to take it for a quick spin."*
- Offer creators their custom code before they even ask.
