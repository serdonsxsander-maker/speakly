#!/usr/bin/env node

/**
 * Speakly Founder Quick-Stats CLI Dashboard
 * Run anytime: node scripts/stats.js
 * 
 * Fetches:
 * 1. Total user signups & recent 24h registrations
 * 2. Partner referral code breakdown
 * 3. Unread in-app feedback & bug reports
 */

const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = (match[2] || '').trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
      }
    }
  }
}

loadEnvFile(path.resolve(__dirname, '../.env'));
loadEnvFile(path.resolve(__dirname, '../backend/.env'));

let createClient;
try {
  createClient = require('../backend/node_modules/@supabase/supabase-js').createClient;
} catch (_) {
  try {
    createClient = require('../app/node_modules/@supabase/supabase-js').createClient;
  } catch (err) {
    console.error('Could not locate @supabase/supabase-js. Run npm install in backend/');
    process.exit(1);
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lwiznvgeemrkrildyyvw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_KEY) {
  console.log('\n⚠️  Notice: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY not set.');
  console.log('   Add your key to .env to view live Supabase database statistics.\n');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  console.log('\n🐥 =======================================================');
  console.log('   SPEAKLY FOUNDER MORNING DASHBOARD');
  console.log('   Time:', new Date().toLocaleString());
  console.log('=========================================================\n');

  // 1. In-App Feedback & Bugs
  try {
    const { data: feedback, error: fbErr } = await supabase
      .from('feedback')
      .select('id, created_at, kind, message, status, os, active_mode')
      .order('created_at', { ascending: false })
      .limit(10);

    if (fbErr) {
      console.log('💬 Feedback Table:', fbErr.message);
    } else {
      const newItems = feedback.filter(f => f.status === 'new');
      console.log(`💬 In-App Feedback: ${feedback.length} total (${newItems.length} unread/new)`);
      if (newItems.length > 0) {
        console.log('   Recent unread submissions:');
        newItems.slice(0, 3).forEach(f => {
          console.log(`   - [${f.kind.toUpperCase()}] "${f.message.slice(0, 60)}..." (${f.os || 'unknown OS'})`);
        });
      } else {
        console.log('   ✓ Zero pending unread feedback items.');
      }
    }
  } catch (err) {
    console.log('💬 Feedback check:', err.message);
  }

  // 2. Active Subscriptions & MRR (Lemon Squeezy Sync)
  console.log('\n---------------------------------------------------------');
  try {
    const { data: subs, error: subErr } = await supabase
      .from('subscriptions')
      .select('status, plan, renews_at');

    if (subErr) {
      console.log('💳 Subscriptions Table:', subErr.message);
    } else if (subs && subs.length > 0) {
      const activeSubs = subs.filter(s => s.status === 'active');
      const trialSubs = subs.filter(s => s.status === 'on_trial');
      const mrr = activeSubs.length * 10;
      console.log(`💳 Lemon Squeezy Subscriptions:`);
      console.log(`   - Active Pro Users: ${activeSubs.length} ($${mrr}/mo MRR)`);
      console.log(`   - 14-Day Free Trials: ${trialSubs.length}`);
      console.log(`   - Total Subscriptions Recorded: ${subs.length}`);
    } else {
      console.log('💳 Subscriptions: 0 active paid subscriptions yet (Early access free trials active).');
    }
  } catch (err) {
    console.log('💳 Subscriptions check:', err.message);
  }

  // 3. Partner Referral & 30% Recurring Commission Performance
  console.log('\n---------------------------------------------------------');
  try {
    const { data: partners, error: ptErr } = await supabase
      .from('partner_revenue_summary')
      .select('*')
      .limit(10);

    if (ptErr) {
      // Fallback to basic performance summary if revenue summary view not yet run
      const { data: fallbackPartners, error: fbErr } = await supabase
        .from('partner_performance_summary')
        .select('*')
        .limit(10);

      if (fbErr) {
        console.log('🤝 Partner Referrals:', fbErr.message);
      } else if (fallbackPartners && fallbackPartners.length > 0) {
        console.log('🤝 Partner Referrals (Signups):');
        console.table(fallbackPartners);
      } else {
        console.log('🤝 Partner Referrals: 0 signups recorded yet. (Share partner codes to start tracking!)');
      }
    } else if (partners && partners.length > 0) {
      console.log('🤝 Top Partner Codes (Signups + 30% Paid Conversions):');
      const formatted = partners.map(p => ({
        'Partner Code': p.partner_code,
        'Signups': p.total_signups,
        'Paying Users': p.paying_customers,
        'Active Subs': p.active_subscriptions,
        'Conversion %': `${p.conversion_rate_pct || 0}%`,
        'Gross Revenue': `$${((p.total_revenue_cents || 0) / 100).toFixed(2)}`,
        '30% Commission': `$${((p.total_commission_cents || 0) / 100).toFixed(2)}`
      }));
      console.table(formatted);
    } else {
      console.log('🤝 Partner Referrals: 0 signups recorded yet. (Share partner codes to start tracking!)');
    }
  } catch (err) {
    console.log('🤝 Partner check:', err.message);
  }

  console.log('\n=========================================================\n');
}

main().catch(err => {
  console.error('Error fetching stats:', err.message);
});
