const { createClient } = require('../backend/node_modules/@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const targetEmail = process.argv[2] || 'serdonsxsander@gmail.com';
const isRevoke = process.argv.includes('--revoke');

const envPath = path.resolve(__dirname, '../backend/.env');
if (!fs.existsSync(envPath)) {
  console.error('Cannot find backend/.env');
  process.exit(1);
}

const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/SUPABASE_URL=([^\r\n]+)/)[1].trim();
const sKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)[1].trim();
const supabaseAdmin = createClient(url, sKey);

async function run() {
  const { data: users, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) {
    console.error('Failed to list users:', listErr.message);
    process.exit(1);
  }

  const user = users.users.find(u => (u.email || '').toLowerCase() === targetEmail.toLowerCase());
  if (!user) {
    console.error(`User with email "${targetEmail}" not found in Supabase!`);
    process.exit(1);
  }

  const userId = user.id;
  console.log(`Found user: ${user.email} (ID: ${userId})`);

  if (isRevoke) {
    await supabaseAdmin.from('subscriptions').delete().eq('user_id', userId);
    await supabaseAdmin.from('user_usage').update({ plan: 'free' }).eq('user_id', userId);
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        speakly_subscription: {
          plan: 'free',
          status: 'trial',
          updatedAt: new Date().toISOString()
        }
      }
    });
    console.log(`✓ User ${targetEmail} reverted to FREE plan.`);
  } else {
    // 1. Update user_usage
    await supabaseAdmin.from('user_usage').upsert({
      user_id: userId,
      plan: 'pro',
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    // 2. Insert active subscription record
    await supabaseAdmin.from('subscriptions').upsert({
      user_id: userId,
      lemon_squeezy_id: 'sub_admin_' + userId.slice(0, 8),
      customer_id: 'cust_admin_' + userId.slice(0, 8),
      order_id: 'order_admin_' + userId.slice(0, 8),
      status: 'active',
      plan: 'pro',
      customer_portal_url: 'https://speakly.lemonsqueezy.com/billing',
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    // 3. Update auth user_metadata
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        speakly_subscription: {
          plan: 'pro',
          status: 'active',
          customerPortalUrl: 'https://speakly.lemonsqueezy.com/billing',
          updatedAt: new Date().toISOString()
        }
      }
    });
    console.log(`★ Successfully granted lifetime SPEAKLY PRO to ${targetEmail}!`);
  }
}

run().catch(console.error);
