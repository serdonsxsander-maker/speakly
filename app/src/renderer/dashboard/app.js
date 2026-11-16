(() => {
  document.body.dataset.platform = window.voxflow.platform;

  // Light-dismiss fallback for browsers where <dialog closedby="any"> is not yet native
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (e, dialog) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => {
        pressedOutside = outside(e, dialog);
      });
      dialog.addEventListener('pointerup', (e) => {
        if (pressedOutside && outside(e, dialog)) dialog.close();
      });
    }
  }

  let appState = null;
  let searchFilter = '';

  // Elements
  const navButtons = Array.from(document.querySelectorAll('.nav-btn'));
  const tabViews = {
    overview: document.getElementById('tab-overview'),
    modes: document.getElementById('tab-modes'),
    dictionary: document.getElementById('tab-dictionary'),
    settings: document.getElementById('tab-settings')
  };

  const liveStatusPill = document.getElementById('live-status-pill');
  const liveStatusText = document.getElementById('live-status-text');
  const sidebarTriggerVerb = document.getElementById('sidebar-trigger-verb');
  const sidebarHotkeyKbd = document.getElementById('sidebar-hotkey-kbd');
  const sidebarModeName = document.getElementById('sidebar-mode-name');
  const sidebarOfflineSwitch = document.getElementById('sidebar-offline-switch');
  const sidebarOfflineLabel = document.getElementById('sidebar-offline-label');
  const prefOfflineMode = document.getElementById('pref-offline-mode');

  const headerRecordBtn = document.getElementById('header-record-btn');
  const headerRecordLabel = document.getElementById('header-record-label');
  const playgroundHotkey = document.getElementById('playground-hotkey');
  const playgroundTextarea = document.getElementById('playground-textarea');
  const clearPlaygroundBtn = document.getElementById('clear-playground-btn');

  const permissionsCard = document.getElementById('permissions-card');
  const micPermBadge = document.getElementById('mic-perm-badge');
  const accPermBadge = document.getElementById('acc-perm-badge');
  const grantMicBtn = document.getElementById('grant-mic-btn');
  const grantAccBtn = document.getElementById('grant-acc-btn');
  const refreshPermBtn = document.getElementById('refresh-perm-btn');

  const statWords = document.getElementById('stat-words');
  const statSessions = document.getElementById('stat-sessions');
  const statTimeSaved = document.getElementById('stat-time-saved');
  const statQuotaValue = document.getElementById('stat-quota-value');
  const statQuotaProgress = document.getElementById('stat-quota-progress');
  const statQuotaFoot = document.getElementById('stat-quota-foot');
  const settingsUsageText = document.getElementById('settings-usage-text');
  const settingsUsageProgress = document.getElementById('settings-usage-progress');
  const settingsUsageReset = document.getElementById('settings-usage-reset');
  const settingsUsageResetDate = document.getElementById('settings-usage-reset-date');
  const dictLockBanner = document.getElementById('dict-lock-banner');
  const btnDictUpgradePro = document.getElementById('btn-dict-upgrade-pro');
  const dictSubmitBtn = document.getElementById('dict-submit-btn');

  // Rubber ducky quota modal elements
  const quotaModal = document.getElementById('quota-modal');
  const quotaDuckMascot = document.getElementById('quota-duck-mascot');
  const quotaCloseBtn = document.getElementById('quota-close-btn');
  const btnQuotaUpgradePro = document.getElementById('btn-quota-upgrade-pro');
  const btnQuotaDismiss = document.getElementById('btn-quota-dismiss');
  const quotaModalBadge = document.getElementById('quota-modal-badge');
  const quotaModalTitle = document.getElementById('quota-modal-title');
  const quotaModalDesc = document.getElementById('quota-modal-desc');

  let currentUsage = { plan: 'free', wordsUsed: 0, wordLimit: 3000, periodEnd: null };

  const historyList = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');
  const historySearch = document.getElementById('history-search');
  const clearHistoryBtn = document.getElementById('clear-history-btn');

  const modesGrid = document.getElementById('modes-grid');
  const settingsModesGrid = document.getElementById('settings-modes-grid');
  const modesLockBanner = document.getElementById('modes-lock-banner');
  const btnModesUpgradePro = document.getElementById('btn-modes-upgrade-pro');
  const btnGotoModesTab = document.getElementById('btn-goto-modes-tab');
  const newModeBtn = document.getElementById('new-mode-btn');

  const dictionaryForm = document.getElementById('dictionary-form');
  const dictInput = document.getElementById('dict-input');
  const dictionaryTags = document.getElementById('dictionary-tags');

  // Settings elements
  const accountBadge = document.getElementById('account-badge');
  const accountLoggedOut = document.getElementById('account-logged-out');
  const accountLoggedIn = document.getElementById('account-logged-in');
  const accountUserEmail = document.getElementById('account-user-email');
  const accountSyncedHotkey = document.getElementById('account-synced-hotkey');
  const userFirstNameInput = document.getElementById('user-first-name-input');
  const userLastNameInput = document.getElementById('user-last-name-input');
  const authGoogleBtn = document.getElementById('auth-google-btn');
  const authEmailInput = document.getElementById('auth-email-input');
  const authPasswordInput = document.getElementById('auth-password-input');
  const authSigninBtn = document.getElementById('auth-signin-btn');
  const authSignupBtn = document.getElementById('auth-signup-btn');
  const authLogoutBtn = document.getElementById('auth-logout-btn');
  const authFeedback = document.getElementById('auth-feedback');

  const defaultHotkeyLabel = window.voxflow.platform === 'win32' ? 'Right Ctrl' : 'Right ⌥ Option';
  if (sidebarHotkeyKbd) sidebarHotkeyKbd.textContent = defaultHotkeyLabel;
  if (playgroundHotkey) playgroundHotkey.textContent = defaultHotkeyLabel;

  const providerRadios = Array.from(document.querySelectorAll('input[name="provider"]'));
  const triggerRadios = Array.from(document.querySelectorAll('input[name="triggerMode"]'));
  const openaiKeyInput = document.getElementById('openai-key-input');
  const groqKeyInput = document.getElementById('groq-key-input');
  const testOpenaiBtn = document.getElementById('test-openai-btn');
  const testGroqBtn = document.getElementById('test-groq-btn');
  const openaiFeedback = document.getElementById('openai-key-feedback');
  const groqFeedback = document.getElementById('groq-key-feedback');
  const getGroqLink = document.getElementById('get-groq-link');

  const holdKeySelect = document.getElementById('hold-key-select');
  const recordHotkeyBtn = document.getElementById('record-hotkey-btn');
  const recordHotkeyLabel = document.getElementById('record-hotkey-label');
  const languageSelect = document.getElementById('language-select');
  const themeSelect = document.getElementById('theme-select');
  const micSensitivitySelect = document.getElementById('mic-sensitivity-select');

  const prefPreserveClipboard = document.getElementById('pref-preserve-clipboard');
  const prefAudioFeedback = document.getElementById('pref-audio-feedback');
  const prefShowPill = document.getElementById('pref-show-pill');
  const prefLaunchLogin = document.getElementById('pref-launch-login');

  // Alert banner
  const globalAlert = document.getElementById('global-alert');
  const globalAlertText = document.getElementById('global-alert-text');
  const dismissAlertBtn = document.getElementById('dismiss-alert-btn');

  // Dialogs
  const onboardingDialog = document.getElementById('onboarding-dialog');
  const onbGoogleBtn = document.getElementById('onb-google-btn');
  const onbFirstNameInput = document.getElementById('onb-first-name-input');
  const onbLastNameInput = document.getElementById('onb-last-name-input');
  const onbEmailInput = document.getElementById('onb-email-input');
  const onbPasswordInput = document.getElementById('onb-password-input');
  const onbSigninBtn = document.getElementById('onb-signin-btn');
  const onbSignupBtn = document.getElementById('onb-signup-btn');
  const onbAuthFeedback = document.getElementById('onb-auth-feedback');
  const onbAuthLoggedOut = document.getElementById('onb-auth-logged-out');
  const onbAuthLoggedIn = document.getElementById('onb-auth-logged-in');
  const onbUserEmail = document.getElementById('onb-user-email');
  const onbLogoutBtn = document.getElementById('onb-logout-btn');
  const onbGrantMicBtn = document.getElementById('onb-grant-mic-btn');
  const onbGrantAccBtn = document.getElementById('onb-grant-acc-btn');
  const onbFinishBtn = document.getElementById('onb-finish-btn');

  const customModeDialog = document.getElementById('custom-mode-dialog');
  const customModeForm = document.getElementById('custom-mode-form');
  const cmId = document.getElementById('cm-id');
  const cmName = document.getElementById('cm-name');
  const cmBadge = document.getElementById('cm-badge');
  const cmDesc = document.getElementById('cm-desc');
  const cmPrompt = document.getElementById('cm-prompt');

  function applyTheme(themePref) {
    if (themePref === 'dark' || themePref === 'light') {
      document.documentElement.dataset.theme = themePref;
    } else {
      delete document.documentElement.dataset.theme;
    }
  }

  function switchTab(tabId) {
    navButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.tab === tabId);
    });
    Object.entries(tabViews).forEach(([id, el]) => {
      el.hidden = id !== tabId;
    });
  }

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  function updateRecordingIndicators(recState) {
    if (recState === 'recording') {
      liveStatusPill.dataset.status = 'recording';
      liveStatusText.textContent = 'Recording Voice…';
      headerRecordBtn.classList.add('is-recording');
      headerRecordLabel.textContent = 'Stop & Transcribe';
    } else if (recState === 'processing') {
      liveStatusPill.dataset.status = 'processing';
      liveStatusText.textContent = 'Polishing Text…';
      headerRecordBtn.classList.remove('is-recording');
      headerRecordLabel.textContent = 'Processing…';
    } else {
      liveStatusPill.dataset.status = 'ready';
      liveStatusText.textContent = 'Ready to Dictate';
      headerRecordBtn.classList.remove('is-recording');
      headerRecordLabel.textContent = 'Start Dictation';
    }
  }

  function renderPermissions(perms) {
    if (!perms || perms.platform !== 'darwin') {
      permissionsCard.hidden = true;
      return;
    }
    const micOk = perms.microphone === 'granted';
    const accOk = Boolean(perms.accessibility);

    if (micOk && accOk) {
      permissionsCard.hidden = true;
      return;
    }

    permissionsCard.hidden = false;
    micPermBadge.dataset.ok = String(micOk);
    micPermBadge.textContent = micOk ? '✓ Granted' : '• Required';
    grantMicBtn.disabled = micOk;
    grantMicBtn.textContent = micOk ? 'Granted' : 'Allow Microphone';

    accPermBadge.dataset.ok = String(accOk);
    accPermBadge.textContent = accOk ? '✓ Granted' : '• Action Needed';
    grantAccBtn.disabled = accOk;
    grantAccBtn.textContent = accOk ? 'Enabled' : 'Open Accessibility';
  }

  function renderStats(stats) {
    const words = stats?.wordsDictated || 0;
    const secs = stats?.secondsRecorded || 0;
    const sessions = stats?.sessionsCount || 0;

    statWords.textContent = words.toLocaleString();
    statSessions.textContent = sessions.toLocaleString();

    // Typing 42 WPM vs speaking
    const typingMinutes = words / 42;
    const speakingMinutes = secs / 60;
    const savedMinutes = Math.max(0, typingMinutes - speakingMinutes);

    if (savedMinutes < 1 && words > 0) {
      statTimeSaved.textContent = `${Math.max(1, Math.round(savedMinutes * 60))} sec`;
    } else if (savedMinutes >= 60) {
      statTimeSaved.textContent = `${(savedMinutes / 60).toFixed(1)} hrs`;
    } else {
      statTimeSaved.textContent = `${Math.round(savedMinutes)} min`;
    }

    renderUsageBar();
  }

  function renderUsageBar() {
    const isPro = currentUsage.plan === 'pro';
    const used = currentUsage.wordsUsed || 0;
    const limit = currentUsage.wordLimit || 3000;

    // Format reset date for free tier
    let resetDateFormatted = '';
    if (currentUsage.periodEnd) {
      try {
        const d = new Date(currentUsage.periodEnd);
        resetDateFormatted = d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      } catch (_) {}
    }

    if (statQuotaValue) {
      if (isPro) {
        statQuotaValue.textContent = 'Unlimited';
        statQuotaValue.style.color = '#34d399';
        if (statQuotaProgress) {
          statQuotaProgress.style.width = '100%';
          statQuotaProgress.style.background = '#34d399';
        }
        if (statQuotaFoot) {
          statQuotaFoot.textContent = '★ Speakly Pro (Unlimited Words)';
        }
      } else {
        const pct = Math.min(100, Math.round((used / limit) * 100));
        statQuotaValue.textContent = `${used.toLocaleString()} / ${limit.toLocaleString()}`;
        statQuotaValue.style.color = used >= limit ? '#ef4444' : '#f4f4f5';
        if (statQuotaProgress) {
          statQuotaProgress.style.width = `${pct}%`;
          statQuotaProgress.style.background = used >= limit ? '#ef4444' : '#ffd000';
        }
        if (statQuotaFoot) {
          const remaining = limit - used > 0 ? (limit - used).toLocaleString() : 0;
          if (resetDateFormatted) {
            statQuotaFoot.textContent = `${remaining} free words · Refreshes ${resetDateFormatted}`;
          } else {
            statQuotaFoot.textContent = `${remaining} free words remaining`;
          }
        }
      }
    }

    if (settingsUsageText && settingsUsageProgress) {
      if (isPro) {
        settingsUsageText.textContent = 'Unlimited words (Speakly Pro)';
        settingsUsageText.style.color = '#34d399';
        settingsUsageProgress.style.width = '100%';
        settingsUsageProgress.style.background = '#34d399';
        if (settingsUsageReset) settingsUsageReset.style.display = 'none';
      } else {
        const pct = Math.min(100, Math.round((used / limit) * 100));
        settingsUsageText.textContent = `${used.toLocaleString()} / ${limit.toLocaleString()} words used this month`;
        settingsUsageText.style.color = used >= limit ? '#ef4444' : '#f4f4f5';
        settingsUsageProgress.style.width = `${pct}%`;
        settingsUsageProgress.style.background = used >= limit ? '#ef4444' : '#ffd000';

        if (settingsUsageReset && settingsUsageResetDate) {
          if (resetDateFormatted) {
            settingsUsageResetDate.textContent = resetDateFormatted;
            settingsUsageReset.style.display = 'block';
          } else {
            settingsUsageReset.style.display = 'none';
          }
        }
      }
    }

    // Personal Dictionary Lock Banner
    if (dictLockBanner && dictInput && dictSubmitBtn) {
      if (isPro) {
        dictLockBanner.hidden = true;
        dictInput.disabled = false;
        dictSubmitBtn.disabled = false;
        dictInput.placeholder = 'e.g. Acme Corp, PostgreSQL, ProductName, Alex Rivera';
      } else {
        dictLockBanner.hidden = false;
        dictInput.disabled = true;
        dictSubmitBtn.disabled = true;
        dictInput.placeholder = '🔒 Personal Dictionary is locked on Free Tier (Upgrade to Pro)';
      }
    }
  }

  function getRubberDuckySVG(state = 'listening') {
    let stateExtras = '';
    if (state === 'listening') {
      stateExtras = `
        <ellipse cx="32" cy="34" rx="4" ry="5.5" fill="#0F172A" />
        <circle cx="30.5" cy="32" r="1.8" fill="#FFFFFF" />
        <circle cx="33.5" cy="35.5" r="0.9" fill="#FFFFFF" />
        <path d="M22 34 C22 15, 50 15, 50 34" fill="none" stroke="#3B82F6" stroke-width="4.5" stroke-linecap="round" />
        <rect x="37" y="29" width="7.5" height="14" rx="3.75" fill="#2563EB" />
        <rect x="38.8" y="31.5" width="4" height="9" rx="2" fill="#60A5FA" />
      `;
    } else if (state === 'thinking') {
      stateExtras = `
        <path d="M26 35 Q32 29 38 35" fill="none" stroke="#0F172A" stroke-width="3.2" stroke-linecap="round" />
        <circle cx="58" cy="18" r="3.2" fill="#F59E0B" />
        <circle cx="67" cy="11" r="5" fill="#38BDF8" />
      `;
    } else if (state === 'solved') {
      stateExtras = `
        <path d="M27 34 Q33 27 39 34" fill="none" stroke="#0F172A" stroke-width="3.2" stroke-linecap="round" />
        <ellipse cx="28" cy="41" rx="4.5" ry="2.5" fill="#FF8A8A" opacity="0.8" />
        <path d="M68 8 L70 15 L77 17 L70 19 L68 26 L66 19 L59 17 L66 15 Z" fill="#FBBF24" />
      `;
    }

    return `
      <svg viewBox="0 0 100 95" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
        <ellipse cx="52" cy="86" rx="30" ry="4" fill="#38BDF8" opacity="0.25" />
        <path d="M18 36 Q7 38 11 45 Q21 47 27 42 Z" fill="#FF6B00" />
        <ellipse cx="52" cy="62" rx="31" ry="23" fill="#FFD000" />
        <path d="M78 52 C88 42, 92 46, 82 62 Z" fill="#FFD000" />
        <circle cx="36" cy="37" r="20.5" fill="#FFD000" />
        <ellipse cx="34" cy="24" rx="10" ry="4.5" fill="#FFE866" opacity="0.55" />
        <path d="M39 58 Q50 49 65 60 Q54 74 39 70 Z" fill="#F59E0B" />
        ${stateExtras}
      </svg>
    `;
  }

  async function fetchUserUsage(token) {
    let effectiveToken = token;
    if (!effectiveToken && window.voxflow?.getValidToken) {
      effectiveToken = await window.voxflow.getValidToken();
    }
    if (!effectiveToken) return;
    try {
      const backendUrl = window.voxflow?.getBackendUrl
        ? await window.voxflow.getBackendUrl()
        : 'https://speakly-backend-ie1b.onrender.com';
      const res = await fetch(`${backendUrl}/api/v1/user/usage`, {
        headers: { 'Authorization': `Bearer ${effectiveToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          currentUsage = {
            plan: data.plan,
            wordsUsed: data.wordsUsed,
            wordLimit: data.wordLimit,
            periodEnd: data.periodEnd
          };
          renderUsageBar();
        }
      }
    } catch (err) {
      console.warn('Failed to fetch user usage:', err.message);
    }
  }

  function showQuotaExceededModal(data = {}) {
    if (quotaDuckMascot) {
      quotaDuckMascot.innerHTML = getRubberDuckySVG('thinking');
    }
    if (quotaModalBadge) {
      if (data.badge) {
        quotaModalBadge.textContent = data.badge;
      } else if (data.isModeLock) {
        quotaModalBadge.textContent = 'Pro Feature 🔒';
      } else {
        const cur = (data.current || 3000).toLocaleString();
        const lim = (data.limit || 3000).toLocaleString();
        quotaModalBadge.textContent = `${cur} / ${lim} Words Used`;
      }
    }
    if (quotaModalTitle) {
      quotaModalTitle.textContent = data.title || (data.isModeLock ? 'Unlock Speakly Pro' : 'Monthly Cap Reached!');
    }
    if (quotaModalDesc) {
      quotaModalDesc.textContent = data.message || 'Monthly cap reached, upgrade to Pro for unlimited usage.';
    }
    if (quotaModal && typeof quotaModal.showModal === 'function') {
      try {
        if (!quotaModal.open) quotaModal.showModal();
      } catch (_) {
        quotaModal.show();
      }
    }
  }

  function formatRelativeTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' +
        d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  function renderHistory(items = []) {
    const q = searchFilter.trim().toLowerCase();
    const filtered = (q
      ? items.filter((item) => item.text.toLowerCase().includes(q) || (item.modeName || '').toLowerCase().includes(q))
      : items
    ).slice(0, 20);

    historyList.replaceChildren();
    historyEmpty.hidden = filtered.length > 0;

    for (const item of filtered) {
      const li = document.createElement('li');
      li.className = 'history-item';

      const meta = document.createElement('div');
      meta.className = 'history-meta';

      const badges = document.createElement('div');
      badges.className = 'history-badges';

      const modeTag = document.createElement('span');
      modeTag.className = 'pill-tag';
      modeTag.textContent = item.modeName || 'Smart Polish';
      badges.appendChild(modeTag);

      if (item.provider === 'local') {
        const localTag = document.createElement('span');
        localTag.className = 'pill-tag';
        localTag.style.background = 'rgba(16, 185, 129, 0.16)';
        localTag.style.color = '#10b981';
        localTag.textContent = '🔒 Offline';
        badges.appendChild(localTag);
      }

      const wordsSpan = document.createElement('span');
      wordsSpan.textContent = `${item.wordCount || 0} words · ${item.durationSeconds || 0}s`;
      badges.appendChild(wordsSpan);

      const timeSpan = document.createElement('time');
      timeSpan.dateTime = item.timestamp;
      timeSpan.textContent = formatRelativeTime(item.timestamp);

      meta.append(badges, timeSpan);

      const textP = document.createElement('p');
      textP.className = 'history-text';
      textP.textContent = item.text;

      const actions = document.createElement('div');
      actions.className = 'history-actions';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn btn-secondary btn-sm';
      copyBtn.textContent = 'Copy Text';
      copyBtn.addEventListener('click', async () => {
        await window.voxflow.copyText(item.text);
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => {
          copyBtn.textContent = 'Copy Text';
        }, 1200);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-ghost btn-sm';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => {
        window.voxflow.deleteHistoryItem(item.id);
      });

      actions.append(copyBtn, delBtn);
      li.append(meta, textP, actions);
      historyList.appendChild(li);
    }
  }

  function createModeCard(mode, activeModeId, isPro, gridId = 'modes') {
    const isFreeTierAllowed = mode.id === 'smart' || mode.id === 'raw';
    const isLocked = !isPro && !isFreeTierAllowed;

    const label = document.createElement('label');
    label.className = `mode-card${isLocked ? ' is-locked' : ''}`;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `active_mode_${gridId}`;
    radio.value = mode.id;
    radio.checked = mode.id === activeModeId;
    if (isLocked) {
      radio.disabled = true;
    }

    const activateMode = () => {
      if (isLocked) {
        showQuotaExceededModal();
        return;
      }
      window.voxflow.updateSettings({ activeModeId: mode.id });
    };

    radio.addEventListener('change', () => {
      if (radio.checked) activateMode();
    });

    label.addEventListener('click', (e) => {
      if (isLocked) {
        e.preventDefault();
        e.stopPropagation();
        showQuotaExceededModal();
      }
    });

    const top = document.createElement('div');
    top.className = 'mode-card-top';

    const titleWrap = document.createElement('div');
    titleWrap.style.display = 'flex';
    titleWrap.style.alignItems = 'center';
    titleWrap.style.gap = '8px';

    const title = document.createElement('h2');
    title.textContent = mode.name;
    titleWrap.appendChild(title);

    if (isLocked) {
      const lockBadge = document.createElement('span');
      lockBadge.className = 'mode-card-lock-badge';
      lockBadge.innerHTML = '🔒 Pro';
      titleWrap.appendChild(lockBadge);
    }

    const badge = document.createElement('span');
    badge.className = 'pill-tag';
    badge.textContent = mode.badge;

    top.append(titleWrap, badge);

    const desc = document.createElement('p');
    desc.textContent = mode.description;

    let targetSelectorWrap = null;
    if (mode.id === 'code') {
      targetSelectorWrap = document.createElement('div');
      targetSelectorWrap.style.marginTop = '10px';
      targetSelectorWrap.style.paddingTop = '10px';
      targetSelectorWrap.style.borderTop = '1px solid var(--border)';
      targetSelectorWrap.style.display = 'flex';
      targetSelectorWrap.style.alignItems = 'center';
      targetSelectorWrap.style.justifyContent = 'space-between';
      targetSelectorWrap.style.gap = '8px';

      const selLabel = document.createElement('span');
      selLabel.textContent = 'Target AI Model:';
      selLabel.style.fontSize = '12px';
      selLabel.style.fontWeight = '600';
      selLabel.style.color = 'var(--text-secondary)';

      const select = document.createElement('select');
      select.style.fontSize = '12px';
      select.style.padding = '5px 8px';
      select.style.borderRadius = '6px';
      select.style.maxWidth = '165px';
      if (isLocked) select.disabled = true;

      const aiTargets = [
        { value: 'chatgpt', label: 'OpenAI / ChatGPT' },
        { value: 'claude', label: 'Claude (Anthropic)' },
        { value: 'gemini', label: 'Google Gemini' },
        { value: 'cursor', label: 'Cursor / Coding IDE' }
      ];
      const currentTarget = appState?.settings?.aiPromptTarget || 'chatgpt';
      for (const t of aiTargets) {
        const opt = document.createElement('option');
        opt.value = t.value;
        opt.textContent = t.label;
        if (t.value === currentTarget) opt.selected = true;
        select.appendChild(opt);
      }

      select.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      select.addEventListener('change', (e) => {
        e.stopPropagation();
        window.voxflow.updateSettings({ aiPromptTarget: select.value });
      });

      targetSelectorWrap.append(selLabel, select);
    }

    const footer = document.createElement('div');
    footer.className = 'mode-card-footer';

    if (isLocked) {
      const lockCta = document.createElement('button');
      lockCta.type = 'button';
      lockCta.className = 'mode-card-lock-cta';
      lockCta.textContent = '🔒 Unlock with Pro';
      lockCta.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.voxflow.openCheckout();
      });
      footer.appendChild(lockCta);
    } else {
      const activeSpan = document.createElement('span');
      activeSpan.className = 'active-indicator';
      activeSpan.textContent = mode.id === activeModeId ? '✓ Active Mode' : 'Click to activate';
      footer.appendChild(activeSpan);
    }

    if (!mode.builtIn) {
      const btnWrap = document.createElement('div');
      btnWrap.style.display = 'flex';
      btnWrap.style.gap = '6px';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-ghost btn-sm';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openCustomModeModal(mode);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-ghost btn-sm';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.voxflow.deleteCustomMode(mode.id);
      });

      btnWrap.append(editBtn, delBtn);
      footer.appendChild(btnWrap);
    }

    if (targetSelectorWrap) {
      label.append(radio, top, desc, targetSelectorWrap, footer);
    } else {
      label.append(radio, top, desc, footer);
    }
    return label;
  }

  function renderModes(modes = [], activeModeId) {
    const isPro = currentUsage.plan === 'pro';

    // Lock banner visibility in AI Modes tab
    if (modesLockBanner) {
      modesLockBanner.hidden = isPro;
    }

    // Render Tab 2: AI Modes Grid
    if (modesGrid) {
      modesGrid.replaceChildren();
      for (const mode of modes) {
        const card = createModeCard(mode, activeModeId, isPro, 'tab_modes');
        modesGrid.appendChild(card);
      }
    }

    // Render Tab 4: Settings AI Modes Grid
    if (settingsModesGrid) {
      settingsModesGrid.replaceChildren();
      for (const mode of modes) {
        const card = createModeCard(mode, activeModeId, isPro, 'settings_modes');
        settingsModesGrid.appendChild(card);
      }
    }
  }

  function renderDictionary(words = []) {
    dictionaryTags.replaceChildren();
    for (const word of words) {
      const li = document.createElement('li');
      li.className = 'vocab-tag';
      const span = document.createElement('span');
      span.textContent = word;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', `Remove ${word}`);
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        const next = words.filter((w) => w !== word);
        window.voxflow.setDictionary(next);
      });

      li.append(span, removeBtn);
      dictionaryTags.appendChild(li);
    }
  }

  function renderHoldKeyOptions(options = [], selectedId) {
    if (holdKeySelect.options.length !== options.length) {
      holdKeySelect.replaceChildren();
      for (const opt of options) {
        const el = document.createElement('option');
        el.value = opt.id;
        el.textContent = opt.label;
        holdKeySelect.appendChild(el);
      }
    }
    if (selectedId) {
      holdKeySelect.value = selectedId;
    }
  }

  function renderState(state) {
    appState = state;
    const { settings } = state;

    applyTheme(settings.theme);

    sidebarTriggerVerb.textContent = settings.triggerMode === 'hold' ? 'Hold' : 'Press';
    sidebarHotkeyKbd.textContent = state.hotkeyDisplay;
    playgroundHotkey.textContent = state.hotkeyDisplay;
    sidebarModeName.textContent = state.activeMode?.name || 'Smart Polish';

    updateRecordingIndicators(state.recordingState);
    renderPermissions(state.permissions);
    renderStats(state.stats);
    renderHistory(state.history);
    renderModes(state.modes, settings.activeModeId);
    renderDictionary(state.dictionary);
    renderHoldKeyOptions(state.holdKeyOptions, settings.holdKey);

    const isOffline = settings.provider === 'local';
    if (prefOfflineMode) {
      prefOfflineMode.checked = isOffline;
    }
    if (sidebarOfflineSwitch) {
      sidebarOfflineSwitch.checked = isOffline;
    }
    if (sidebarOfflineLabel) {
      sidebarOfflineLabel.textContent = isOffline ? '🔒 Offline Local' : '⚡ Cloud Turbo';
      sidebarOfflineLabel.style.color = isOffline ? '#10b981' : '';
    }

    providerRadios.forEach((r) => {
      r.checked = r.value === settings.provider;
    });
    triggerRadios.forEach((r) => {
      r.checked = r.value === settings.triggerMode;
    });

    if (openaiKeyInput && document.activeElement !== openaiKeyInput) {
      openaiKeyInput.value = settings.openaiApiKey || '';
    }
    if (groqKeyInput && document.activeElement !== groqKeyInput) {
      groqKeyInput.value = settings.groqApiKey || '';
    }

    if (userFirstNameInput && document.activeElement !== userFirstNameInput) {
      userFirstNameInput.value = settings.userFirstName || '';
    }
    if (userLastNameInput && document.activeElement !== userLastNameInput) {
      userLastNameInput.value = settings.userLastName || '';
    }
    if (onbFirstNameInput && document.activeElement !== onbFirstNameInput && !onbFirstNameInput.value) {
      onbFirstNameInput.value = settings.userFirstName || '';
    }
    if (onbLastNameInput && document.activeElement !== onbLastNameInput && !onbLastNameInput.value) {
      onbLastNameInput.value = settings.userLastName || '';
    }

    if (state.auth && state.auth.user && state.auth.user.email) {
      if (accountBadge) {
        accountBadge.dataset.ok = 'true';
        accountBadge.textContent = '✓ Signed In';
      }
      if (accountLoggedOut) accountLoggedOut.hidden = true;
      if (accountLoggedIn) accountLoggedIn.hidden = false;
      if (accountUserEmail) accountUserEmail.textContent = state.auth.user.email;
      if (accountSyncedHotkey) accountSyncedHotkey.textContent = state.hotkeyDisplay;

      // Render Lemon Squeezy subscription & billing status
      const sub = state.subscription || {};
      const isPro = sub.plan === 'pro' && (sub.status === 'active' || sub.status === 'on_trial');
      currentUsage.plan = isPro ? 'pro' : 'free';
      renderModes(state.modes, settings.activeModeId);
      const subBadge = document.getElementById('sub-plan-badge');
      const subDesc = document.getElementById('sub-plan-desc');
      const btnUpgrade = document.getElementById('btn-upgrade-pro');
      const btnBilling = document.getElementById('btn-manage-billing');

      if (subBadge && subDesc && btnUpgrade && btnBilling) {
        if (isPro) {
          subBadge.textContent = 'Pro';
          subBadge.style.background = 'rgba(52, 211, 153, 0.12)';
          subBadge.style.color = '#34d399';
          subBadge.style.borderColor = 'rgba(52, 211, 153, 0.25)';
          subDesc.textContent = sub.renewsAt ? `Renews on ${new Date(sub.renewsAt).toLocaleDateString()}` : 'Unlimited voice dictation active.';
          btnUpgrade.hidden = true;
          btnBilling.hidden = false;
        } else {
          subBadge.textContent = 'Free Tier';
          subBadge.style.background = 'rgba(255, 208, 0, 0.12)';
          subBadge.style.color = '#ffd000';
          subBadge.style.borderColor = 'rgba(255, 208, 0, 0.25)';
          subDesc.textContent = 'Includes 3,000 words per month with Smart Polish & Fast Verbatim.';
          btnUpgrade.hidden = false;
          btnBilling.hidden = true;
        }
      }

      // Fetch user usage from backend if user is signed in
      if (state.auth && state.auth.user) {
        fetchUserUsage(state.auth.accessToken);
      }
    } else {
      if (accountBadge) {
        accountBadge.dataset.ok = 'false';
        accountBadge.textContent = '• Guest';
      }
      if (accountLoggedOut) accountLoggedOut.hidden = false;
      if (accountLoggedIn) accountLoggedIn.hidden = true;
    }

    if (languageSelect) languageSelect.value = settings.language || '';
    if (themeSelect) themeSelect.value = settings.theme || 'system';
    if (micSensitivitySelect) {
      micSensitivitySelect.value = settings.micSensitivity || 'high';
    }

    if (prefPreserveClipboard) prefPreserveClipboard.checked = Boolean(settings.preserveClipboard);
    if (prefAudioFeedback) prefAudioFeedback.checked = Boolean(settings.audioFeedback);
    if (prefShowPill) prefShowPill.checked = Boolean(settings.showIdlePill);
    if (prefLaunchLogin) prefLaunchLogin.checked = Boolean(settings.launchAtLogin);

    updateOnboardingGate(state);
  }

  let lastAllReady = false;

  function updateOnboardingGate(state) {
    if (!onboardingDialog) return;
    const isAuthed = Boolean(state.auth?.user?.email);
    const perms = state.permissions;
    const isMac = !perms || perms.platform === 'darwin';
    const micOk = !isMac || perms?.microphone === 'granted';
    const accOk = !isMac || Boolean(perms?.accessibility);
    const allReady = isAuthed && micOk && accOk;
    lastAllReady = allReady;

    if (onbAuthLoggedOut && onbAuthLoggedIn) {
      if (isAuthed) {
        onbAuthLoggedOut.hidden = true;
        onbAuthLoggedIn.hidden = false;
        if (onbUserEmail) onbUserEmail.textContent = state.auth.user.email;
      } else {
        onbAuthLoggedOut.hidden = false;
        onbAuthLoggedIn.hidden = true;
      }
    }

    if (onbGrantMicBtn) {
      onbGrantMicBtn.disabled = micOk;
      onbGrantMicBtn.textContent = micOk ? '✓ Microphone Allowed' : 'Allow Microphone';
      if (micOk) onbGrantMicBtn.classList.add('btn-granted');
      else onbGrantMicBtn.classList.remove('btn-granted');
    }
    if (onbGrantAccBtn) {
      onbGrantAccBtn.disabled = accOk;
      onbGrantAccBtn.textContent = accOk ? '✓ Accessibility Granted' : 'Open Accessibility';
      if (accOk) onbGrantAccBtn.classList.add('btn-granted');
      else onbGrantAccBtn.classList.remove('btn-granted');
    }

    if (onbFinishBtn) {
      if (allReady) {
        onbFinishBtn.disabled = false;
        onbFinishBtn.textContent = '✓ Start Using Speakly';
      } else if (!isAuthed) {
        onbFinishBtn.disabled = true;
        onbFinishBtn.textContent = '1. Please Sign In to Continue';
      } else if (!micOk && !accOk) {
        onbFinishBtn.disabled = true;
        onbFinishBtn.textContent = '2. Allow Microphone & Accessibility Above';
      } else if (!micOk) {
        onbFinishBtn.disabled = true;
        onbFinishBtn.textContent = '2. Please Allow Microphone Above';
      } else {
        onbFinishBtn.disabled = true;
        onbFinishBtn.textContent = '2. Please Grant Accessibility in Settings';
      }
    }

    // AUTO-UNLOCK: If all requirements are ready, auto-close the modal immediately!
    if (allReady) {
      if (onboardingDialog.open) {
        if (onbFinishBtn) {
          onbFinishBtn.textContent = '✓ Permissions Verified — Launching Speakly...';
        }
        setTimeout(() => {
          if (onboardingDialog && onboardingDialog.open) {
            onboardingDialog.close();
          }
        }, 350);
      }
      if (!state.settings?.onboardingComplete) {
        window.voxflow.updateSettings({ onboardingComplete: true });
      }
    } else {
      // If missing permissions or login, show modal only if user hasn't explicitly skipped it
      if (!onboardingDialog.open && !state.settings?.onboardingComplete) {
        onboardingDialog.showModal();
      }
    }
  }

  // Event Listeners
  headerRecordBtn.addEventListener('click', () => {
    window.voxflow.toggleRecording();
  });

  clearPlaygroundBtn.addEventListener('click', () => {
    playgroundTextarea.value = '';
    playgroundTextarea.focus();
  });

  grantMicBtn.addEventListener('click', async () => {
    await window.voxflow.requestMicPermission();
    const next = await window.voxflow.checkPermissions();
    renderState(next);
  });

  grantAccBtn.addEventListener('click', async () => {
    await window.voxflow.requestAccessibility();
  });

  refreshPermBtn.addEventListener('click', async () => {
    const next = await window.voxflow.checkPermissions();
    renderState(next);
  });

  historySearch.addEventListener('input', () => {
    searchFilter = historySearch.value;
    if (appState) renderHistory(appState.history);
  });

  clearHistoryBtn.addEventListener('click', () => {
    window.voxflow.clearHistory();
  });

  dictionaryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = dictInput.value.trim();
    if (!raw || !appState) return;
    const additions = raw.split(',').map((s) => s.trim()).filter(Boolean);
    window.voxflow.setDictionary([...appState.dictionary, ...additions]);
    dictInput.value = '';
  });

  providerRadios.forEach((r) => {
    r.addEventListener('change', () => {
      if (r.checked) window.voxflow.updateSettings({ provider: r.value });
    });
  });

  if (prefOfflineMode) {
    prefOfflineMode.addEventListener('change', () => {
      window.voxflow.updateSettings({ provider: prefOfflineMode.checked ? 'local' : 'groq' });
    });
  }

  if (sidebarOfflineSwitch) {
    sidebarOfflineSwitch.addEventListener('change', () => {
      window.voxflow.updateSettings({ provider: sidebarOfflineSwitch.checked ? 'local' : 'groq' });
    });
  }

  triggerRadios.forEach((r) => {
    r.addEventListener('change', () => {
      if (r.checked) window.voxflow.updateSettings({ triggerMode: r.value });
    });
  });

  holdKeySelect.addEventListener('change', () => {
    window.voxflow.updateSettings({ holdKey: holdKeySelect.value });
  });

  let isRecordingShortcut = false;

  recordHotkeyBtn.addEventListener('click', () => {
    isRecordingShortcut = true;
    recordHotkeyBtn.style.borderColor = '#FFD000';
    recordHotkeyLabel.textContent = '🟡 Press any key now…';
  });

  window.addEventListener('keydown', (e) => {
    if (!isRecordingShortcut) return;
    e.preventDefault();
    e.stopPropagation();

    isRecordingShortcut = false;
    recordHotkeyBtn.style.borderColor = '';

    // Map common key to our friendly options
    let chosenId = 'right_cmd';
    let chosenLabel = e.key;

    if (e.code === 'AltRight') {
      chosenId = 'right_alt';
      chosenLabel = 'Right ⌥ Option';
    } else if (e.code === 'AltLeft') {
      chosenId = 'left_alt';
      chosenLabel = 'Left ⌥ Option';
    } else if (e.code === 'ControlRight') {
      chosenId = 'right_ctrl';
      chosenLabel = 'Right ⌃ Control';
    } else if (e.code === 'ControlLeft') {
      chosenId = 'left_ctrl';
      chosenLabel = 'Left ⌃ Control';
    } else if (e.code === 'ShiftRight') {
      chosenId = 'right_shift';
      chosenLabel = 'Right ⇧ Shift';
    } else if (e.code === 'ShiftLeft') {
      chosenId = 'left_shift';
      chosenLabel = 'Left ⇧ Shift';
    } else if (e.code === 'MetaRight') {
      chosenId = 'right_cmd';
      chosenLabel = 'Right ⌘ Command';
    } else if (e.code === 'MetaLeft') {
      chosenId = 'left_cmd';
      chosenLabel = 'Left ⌘ Command';
    } else if (['F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].includes(e.key)) {
      chosenId = e.key.toLowerCase();
      chosenLabel = e.key;
    } else {
      // For any other key or combo, set hands-free accelerator!
      const parts = [];
      if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      const cleanKey = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(cleanKey)) {
        parts.push(cleanKey === ' ' ? 'Space' : cleanKey);
      }
      const accel = parts.length > 0 ? parts.join('+') : 'CommandOrControl+Shift+Space';
      window.voxflow.updateSettings({ toggleAccelerator: accel, triggerMode: 'toggle' });
      recordHotkeyLabel.textContent = `✓ Set to ${accel}`;
      setTimeout(() => {
        recordHotkeyLabel.textContent = '⌨️ Click & Press Any Key…';
      }, 2000);
      return;
    }

    holdKeySelect.value = chosenId;
    window.voxflow.updateSettings({ holdKey: chosenId });
    recordHotkeyLabel.textContent = `✓ Set to ${chosenLabel}`;
    setTimeout(() => {
      recordHotkeyLabel.textContent = '⌨️ Click & Press Any Key…';
    }, 2000);
  });

  if (languageSelect) {
    languageSelect.addEventListener('change', () => {
      window.voxflow.updateSettings({ language: languageSelect.value });
    });
  }

  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      applyTheme(themeSelect.value);
      window.voxflow.updateSettings({ theme: themeSelect.value });
    });
  }

  if (micSensitivitySelect) {
    micSensitivitySelect.addEventListener('change', () => {
      window.voxflow.updateSettings({ micSensitivity: micSensitivitySelect.value });
    });
  }

  if (prefPreserveClipboard) {
    prefPreserveClipboard.addEventListener('change', () => {
      window.voxflow.updateSettings({ preserveClipboard: prefPreserveClipboard.checked });
    });
  }

  if (prefAudioFeedback) {
    prefAudioFeedback.addEventListener('change', () => {
      window.voxflow.updateSettings({ audioFeedback: prefAudioFeedback.checked });
    });
  }

  if (prefShowPill) {
    prefShowPill.addEventListener('change', () => {
      window.voxflow.updateSettings({ showIdlePill: prefShowPill.checked });
    });
  }

  if (prefLaunchLogin) {
    prefLaunchLogin.addEventListener('change', () => {
      window.voxflow.updateSettings({ launchAtLogin: prefLaunchLogin.checked });
    });
  }

  if (userFirstNameInput) {
    userFirstNameInput.addEventListener('change', () => {
      window.voxflow.updateSettings({ userFirstName: userFirstNameInput.value.trim() });
    });
    userFirstNameInput.addEventListener('blur', () => {
      window.voxflow.updateSettings({ userFirstName: userFirstNameInput.value.trim() });
    });
  }

  if (userLastNameInput) {
    userLastNameInput.addEventListener('change', () => {
      window.voxflow.updateSettings({ userLastName: userLastNameInput.value.trim() });
    });
    userLastNameInput.addEventListener('blur', () => {
      window.voxflow.updateSettings({ userLastName: userLastNameInput.value.trim() });
    });
  }

  if (getGroqLink) {
    getGroqLink.addEventListener('click', () => {
      window.voxflow.openExternal('https://console.groq.com/keys');
    });
  }

  async function verifyAndSaveKey(provider, inputEl, feedbackEl) {
    if (!inputEl || !feedbackEl) return;
    const key = inputEl.value.trim();
    feedbackEl.className = 'field-feedback';
    feedbackEl.textContent = 'Verifying key…';

    if (!key) {
      await window.voxflow.updateSettings(
        provider === 'groq' ? { groqApiKey: '' } : { openaiApiKey: '' }
      );
      feedbackEl.textContent = 'Key cleared.';
      return;
    }

    const res = await window.voxflow.validateKey({ provider, apiKey: key });
    if (res.ok) {
      await window.voxflow.updateSettings(
        provider === 'groq'
          ? { groqApiKey: key, provider: 'groq', onboardingComplete: true }
          : { openaiApiKey: key, provider: 'openai', onboardingComplete: true }
      );
      feedbackEl.className = 'field-feedback is-ok';
      feedbackEl.textContent = '✓ Verified & saved! Active engine updated.';
    } else {
      feedbackEl.className = 'field-feedback is-error';
      feedbackEl.textContent = `✕ ${res.error}`;
    }
  }

  if (testOpenaiBtn) {
    testOpenaiBtn.addEventListener('click', () => {
      verifyAndSaveKey('openai', openaiKeyInput, openaiFeedback);
    });
  }

  if (testGroqBtn) {
    testGroqBtn.addEventListener('click', () => {
      verifyAndSaveKey('groq', groqKeyInput, groqFeedback);
    });
  }

  async function handleAuth(isSignUp) {
    const email = (authEmailInput?.value || '').trim();
    const password = (authPasswordInput?.value || '').trim();
    const firstName = (userFirstNameInput?.value || '').trim();
    const lastName = (userLastNameInput?.value || '').trim();
    const referralCode = (document.getElementById('auth-referral-input')?.value || '').trim();
    if (!email || !password) {
      authFeedback.className = 'field-feedback is-error';
      authFeedback.textContent = 'Please enter both email and password.';
      return;
    }
    authFeedback.className = 'field-feedback';
    authFeedback.textContent = isSignUp ? 'Creating account…' : 'Signing in…';
    try {
      const next = await window.voxflow.authLogin({ email, password, firstName, lastName, referralCode, isSignUp });
      authFeedback.className = 'field-feedback is-ok';
      authFeedback.textContent = '✓ Signed in!';
      authPasswordInput.value = '';
      renderState(next);
    } catch (err) {
      authFeedback.className = 'field-feedback is-error';
      authFeedback.textContent = `✕ ${err.message || 'Authentication failed'}`;
    }
  }

  async function handleGoogleAuth(feedbackEl) {
    if (feedbackEl) {
      feedbackEl.className = 'field-feedback';
      feedbackEl.textContent = 'Opening Google sign-in in browser…';
    }
    try {
      const firstName = (userFirstNameInput?.value || onbFirstNameInput?.value || '').trim();
      const lastName = (userLastNameInput?.value || onbLastNameInput?.value || '').trim();
      if (firstName || lastName) {
        await window.voxflow.updateSettings({
          ...(firstName ? { userFirstName: firstName } : {}),
          ...(lastName ? { userLastName: lastName } : {})
        });
      }
      const next = await window.voxflow.authGoogle();
      if (feedbackEl) {
        feedbackEl.className = 'field-feedback is-ok';
        feedbackEl.textContent = '✓ Signed in with Google!';
      }
      renderState(next);
    } catch (err) {
      if (feedbackEl) {
        feedbackEl.className = 'field-feedback is-error';
        feedbackEl.textContent = `✕ ${err.message || 'Google sign-in failed'}`;
      }
    }
  }

  if (authGoogleBtn) {
    authGoogleBtn.addEventListener('click', () => handleGoogleAuth(authFeedback));
  }
  if (authSigninBtn) {
    authSigninBtn.addEventListener('click', () => handleAuth(false));
  }
  if (authSignupBtn) {
    authSignupBtn.addEventListener('click', () => handleAuth(true));
  }
  if (authLogoutBtn) {
    authLogoutBtn.addEventListener('click', async () => {
      const next = await window.voxflow.authLogout();
      renderState(next);
    });
  }

  // Lemon Squeezy Checkout & Customer Portal Buttons
  const btnUpgradePro = document.getElementById('btn-upgrade-pro');
  if (btnUpgradePro) {
    btnUpgradePro.addEventListener('click', async () => {
      btnUpgradePro.disabled = true;
      btnUpgradePro.textContent = 'Opening checkout…';
      try {
        await window.voxflow.openCheckout();
      } catch (err) {
        console.error('Checkout error:', err);
      } finally {
        setTimeout(() => {
          btnUpgradePro.disabled = false;
          btnUpgradePro.textContent = 'Upgrade to Pro (10€/mo)';
        }, 2000);
      }
    });
  }

  if (btnDictUpgradePro) {
    btnDictUpgradePro.addEventListener('click', async () => {
      btnDictUpgradePro.disabled = true;
      btnDictUpgradePro.textContent = 'Opening checkout…';
      try {
        await window.voxflow.openCheckout();
      } catch (err) {
        console.error('Checkout error:', err);
      } finally {
        setTimeout(() => {
          btnDictUpgradePro.disabled = false;
          btnDictUpgradePro.textContent = 'Upgrade to Pro (10€/mo)';
        }, 2000);
      }
    });
  }

  if (btnModesUpgradePro) {
    btnModesUpgradePro.addEventListener('click', async () => {
      btnModesUpgradePro.disabled = true;
      btnModesUpgradePro.textContent = 'Opening checkout…';
      try {
        await window.voxflow.openCheckout();
      } catch (err) {
        console.error('Checkout error:', err);
      } finally {
        setTimeout(() => {
          btnModesUpgradePro.disabled = false;
          btnModesUpgradePro.textContent = 'Upgrade to Pro (10€/mo)';
        }, 2000);
      }
    });
  }

  if (btnGotoModesTab) {
    btnGotoModesTab.addEventListener('click', () => {
      switchTab('modes');
    });
  }

  if (btnQuotaUpgradePro) {
    btnQuotaUpgradePro.addEventListener('click', async () => {
      btnQuotaUpgradePro.disabled = true;
      btnQuotaUpgradePro.textContent = 'Opening checkout…';
      try {
        await window.voxflow.openCheckout();
        if (quotaModal && quotaModal.open) quotaModal.close();
      } catch (err) {
        console.error('Checkout error:', err);
      } finally {
        setTimeout(() => {
          btnQuotaUpgradePro.disabled = false;
          btnQuotaUpgradePro.textContent = 'Upgrade to Pro (10€/month) →';
        }, 2000);
      }
    });
  }

  if (quotaCloseBtn) {
    quotaCloseBtn.addEventListener('click', () => {
      if (quotaModal && quotaModal.open) quotaModal.close();
    });
  }

  if (btnQuotaDismiss) {
    btnQuotaDismiss.addEventListener('click', () => {
      if (quotaModal && quotaModal.open) quotaModal.close();
    });
  }

  const btnManageBilling = document.getElementById('btn-manage-billing');
  if (btnManageBilling) {
    btnManageBilling.addEventListener('click', async () => {
      btnManageBilling.disabled = true;
      btnManageBilling.textContent = 'Opening portal…';
      try {
        await window.voxflow.openBillingPortal();
      } catch (err) {
        console.error('Portal error:', err);
      } finally {
        setTimeout(() => {
          btnManageBilling.disabled = false;
          btnManageBilling.textContent = 'Manage Subscription';
        }, 2000);
      }
    });
  }

  // Onboarding Gate Handlers
  if (onbGoogleBtn) {
    onbGoogleBtn.addEventListener('click', () => handleGoogleAuth(onbAuthFeedback));
  }

  async function handleOnbEmailAuth(isSignUp) {
    const email = (onbEmailInput?.value || '').trim();
    const password = (onbPasswordInput?.value || '').trim();
    const firstName = (onbFirstNameInput?.value || '').trim();
    const lastName = (onbLastNameInput?.value || '').trim();
    const referralCode = (document.getElementById('onb-referral-input')?.value || '').trim();
    if (!email || !password) {
      onbAuthFeedback.className = 'field-feedback is-error';
      onbAuthFeedback.textContent = 'Please enter both email and password.';
      return;
    }
    onbAuthFeedback.className = 'field-feedback';
    onbAuthFeedback.textContent = isSignUp ? 'Creating account…' : 'Signing in…';
    try {
      const next = await window.voxflow.authLogin({ email, password, firstName, lastName, referralCode, isSignUp });
      onbAuthFeedback.className = 'field-feedback is-ok';
      onbAuthFeedback.textContent = '✓ Signed in!';
      onbPasswordInput.value = '';
      renderState(next);
    } catch (err) {
      onbAuthFeedback.className = 'field-feedback is-error';
      onbAuthFeedback.textContent = `✕ ${err.message || 'Authentication failed'}`;
    }
  }

  if (onbSigninBtn) {
    onbSigninBtn.addEventListener('click', () => handleOnbEmailAuth(false));
  }
  if (onbSignupBtn) {
    onbSignupBtn.addEventListener('click', () => handleOnbEmailAuth(true));
  }
  if (onbLogoutBtn) {
    onbLogoutBtn.addEventListener('click', async () => {
      const next = await window.voxflow.authLogout();
      renderState(next);
    });
  }

  if (onbGrantMicBtn) {
    onbGrantMicBtn.addEventListener('click', async () => {
      await window.voxflow.requestMicPermission();
      const next = await window.voxflow.checkPermissions();
      renderState(next);
    });
  }

  if (onbGrantAccBtn) {
    onbGrantAccBtn.addEventListener('click', async () => {
      await window.voxflow.requestAccessibility();
      const next = await window.voxflow.checkPermissions();
      renderState(next);
    });
  }

  if (onbFinishBtn) {
    onbFinishBtn.addEventListener('click', async () => {
      await window.voxflow.updateSettings({ onboardingComplete: true });
      onboardingDialog.close();
    });
  }

  dismissAlertBtn.addEventListener('click', () => {
    globalAlert.hidden = true;
  });

  onboardingDialog.addEventListener('close', () => {
    onboardingDialog.returnValue = '';
  });

  // Custom Mode Modal Handlers
  function openCustomModeModal(existing = null) {
    cmId.value = existing?.id || '';
    cmName.value = existing?.name || '';
    cmBadge.value = existing?.badge || '';
    cmDesc.value = existing?.description || '';
    cmPrompt.value = existing?.prompt || '';
    customModeDialog.showModal();
  }

  if (newModeBtn) {
    newModeBtn.addEventListener('click', () => {
      openCustomModeModal(null);
    });
  }

  customModeDialog.addEventListener('close', async () => {
    const action = customModeDialog.returnValue;
    customModeDialog.returnValue = '';

    if (action === 'save' && cmName.value.trim() && cmPrompt.value.trim()) {
      const savedState = await window.voxflow.saveCustomMode({
        id: cmId.value || undefined,
        name: cmName.value,
        badge: cmBadge.value || cmName.value.slice(0, 10),
        description: cmDesc.value || 'Custom AI formatting mode.',
        prompt: cmPrompt.value
      });
      renderState(savedState);
    }
  });

  if (onboardingDialog) {
    onboardingDialog.addEventListener('cancel', () => {
      // Allow Escape key to dismiss setup dialog without blocking
    });
  }

  const onbCloseBtn = document.getElementById('onb-close-btn');
  if (onbCloseBtn) {
    onbCloseBtn.addEventListener('click', () => {
      if (onboardingDialog && onboardingDialog.open) {
        onboardingDialog.close();
      }
    });
  }

  const onbSkipBtn = document.getElementById('onb-skip-btn');
  if (onbSkipBtn) {
    onbSkipBtn.addEventListener('click', async () => {
      await window.voxflow.updateSettings({ onboardingComplete: true });
      if (onboardingDialog && onboardingDialog.open) {
        onboardingDialog.close();
      }
    });
  }

  const onbRefreshBtn = document.getElementById('onb-refresh-btn');
  if (onbRefreshBtn) {
    onbRefreshBtn.addEventListener('click', async () => {
      onbRefreshBtn.textContent = 'Checking...';
      const next = await window.voxflow.checkPermissions();
      renderState(next);
      setTimeout(() => {
        if (onbRefreshBtn) onbRefreshBtn.textContent = '🔄 Check Again';
      }, 500);
    });
  }

  // GDPR Data Rights Handlers (Articles 17 & 20)
  const gdprExportBtn = document.getElementById('gdpr-export-btn');
  const gdprDeleteBtn = document.getElementById('gdpr-delete-btn');
  const gdprFeedback = document.getElementById('gdpr-feedback');

  if (gdprExportBtn) {
    gdprExportBtn.addEventListener('click', async () => {
      if (gdprFeedback) {
        gdprFeedback.className = 'field-feedback';
        gdprFeedback.textContent = 'Preparing your data export…';
      }
      try {
        const res = await window.voxflow.exportData();
        if (res.ok) {
          if (gdprFeedback) {
            gdprFeedback.className = 'field-feedback is-ok';
            gdprFeedback.textContent = '✓ Data exported successfully!';
          }
        } else if (!res.canceled) {
          if (gdprFeedback) {
            gdprFeedback.className = 'field-feedback is-error';
            gdprFeedback.textContent = res.error || 'Failed to export data.';
          }
        } else if (gdprFeedback) {
          gdprFeedback.textContent = '';
        }
      } catch (err) {
        if (gdprFeedback) {
          gdprFeedback.className = 'field-feedback is-error';
          gdprFeedback.textContent = err.message || 'Export failed.';
        }
      }
    });
  }

  if (gdprDeleteBtn) {
    gdprDeleteBtn.addEventListener('click', async () => {
      const confirmed = window.confirm(
        '⚠️ Are you sure you want to permanently delete all your data?\n\n' +
        'This will erase your dictation history, personal dictionary terms, and all cloud preferences. This action cannot be undone.'
      );
      if (!confirmed) return;

      if (gdprFeedback) {
        gdprFeedback.className = 'field-feedback';
        gdprFeedback.textContent = 'Permanently erasing all data…';
      }
      try {
        await window.voxflow.deleteAccount();
        if (gdprFeedback) {
          gdprFeedback.className = 'field-feedback is-ok';
          gdprFeedback.textContent = '✓ All data and cloud preferences have been permanently erased.';
        }
      } catch (err) {
        if (gdprFeedback) {
          gdprFeedback.className = 'field-feedback is-error';
          gdprFeedback.textContent = err.message || 'Failed to delete data.';
        }
      }
    });
  }

  // Auto-refresh permissions when window regains focus on macOS
  window.addEventListener('focus', async () => {
    if (window.voxflow.platform === 'darwin') {
      const next = await window.voxflow.checkPermissions();
      renderState(next);
    }
  });

  // Live polling when permissions are missing so flipping the toggle in System Settings updates instantly!
  setInterval(async () => {
    if (window.voxflow.platform === 'darwin') {
      const perms = appState?.permissions;
      const micOk = perms?.microphone === 'granted';
      const accOk = Boolean(perms?.accessibility);
      if (!micOk || !accOk || (onboardingDialog && onboardingDialog.open)) {
        const next = await window.voxflow.checkPermissions();
        renderState(next);
      }
    }
  }, 800);

  // IPC Subscriptions
  window.voxflow.onStateUpdated((next) => renderState(next));
  window.voxflow.onRecordingStatus(({ state }) => updateRecordingIndicators(state));
  window.voxflow.onError(({ message }) => {
    globalAlertText.textContent = message;
    globalAlert.hidden = false;
  });
  window.voxflow.onQuotaExceeded((data) => {
    if (data && typeof data.current === 'number') {
      currentUsage.wordsUsed = data.current;
      renderUsageBar();
    }
    showQuotaExceededModal(data || {});
  });
  if (typeof window.voxflow.onUsageUpdated === 'function') {
    window.voxflow.onUsageUpdated((data) => {
      if (data && typeof data.wordsUsed === 'number') {
        currentUsage.wordsUsed = data.wordsUsed;
        if (data.plan) currentUsage.plan = data.plan;
        if (data.wordLimit !== undefined) currentUsage.wordLimit = data.wordLimit;
        renderUsageBar();
      }
    });
  }

  // Initial Boot
  const DASHBOARD_KITS = [
    {
      id: 'kit-1',
      name: '01 · Acoustic Sovereign',
      sub: 'Obsidian & Studio Gold',
      accent: '#fbbf24',
      swatches: ['#FFD000', '#FF6B00', '#2563EB', '#0C0D12'],
      svg: `<svg viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0F121C"/><ellipse cx="52" cy="84" rx="27" ry="3.5" fill="#38BDF8" opacity="0.32"/><path d="M21 41 Q10 43 14 49 Q24 51 29 46 Z" fill="#FF6B00"/><ellipse cx="54" cy="63" rx="26.5" ry="19.5" fill="#FFD000"/><path d="M75 54 C85 44, 89 48, 79 63 Z" fill="#FFD000"/><circle cx="38" cy="40" r="18" fill="#FFD000"/><path d="M43 59 Q53 51 66 61 Q56 73 43 69 Z" fill="#D97706"/><ellipse cx="33.5" cy="37" rx="3.6" ry="4.8" fill="#0F172A"/><circle cx="32.2" cy="35.3" r="1.6" fill="#FFFFFF"/><path d="M24 37 C24 19, 51 19, 51 37" fill="none" stroke="#3B82F6" stroke-width="3.6" stroke-linecap="round"/><rect x="37" y="33" width="7" height="12" rx="3.5" fill="#2563EB"/></svg>`
    },
    {
      id: 'kit-2',
      name: '02 · Editorial Warmth',
      sub: 'Alabaster, Terracotta & Sage',
      accent: '#d97757',
      swatches: ['#FAF9F5', '#D97757', '#788C5D', '#141413'],
      svg: `<svg viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#FAF9F5"/><circle cx="62" cy="32" r="12" fill="#D97757" opacity="0.22"/><path d="M18 78 Q35 73 52 78 T84 78" fill="none" stroke="#788C5D" stroke-width="2.5" stroke-linecap="round"/><path d="M22 41 Q11 42 15 48 Q24 50 28 45 Z" fill="#D97757" stroke="#141413" stroke-width="2.2"/><ellipse cx="54" cy="61" rx="25" ry="18" fill="#FFD000" stroke="#141413" stroke-width="2.4"/><circle cx="38" cy="40" r="16.5" fill="#FFD000" stroke="#141413" stroke-width="2.4"/><path d="M44 58 Q55 51 66 60 Q55 70 44 66 Z" fill="#FAF9F5" stroke="#141413" stroke-width="2.2"/><circle cx="34" cy="37" r="3" fill="#141413"/></svg>`
    },
    {
      id: 'kit-3',
      name: '03 · Swiss Bauhaus',
      sub: 'Signal Yellow & Carbon Grid',
      accent: '#f59e0b',
      swatches: ['#FFD000', '#0A0A0A', '#FF5500', '#FFFFFF'],
      svg: `<svg viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#FFD000"/><rect x="13" y="36" width="18" height="9" rx="4.5" fill="#FF5500"/><path d="M26 52 A28 28 0 0 0 82 52 Z" fill="#0A0A0A"/><circle cx="38" cy="38" r="16" fill="#0A0A0A"/><path d="M44 56 A14 14 0 0 0 72 56 Z" fill="#FFD000"/><circle cx="34" cy="35" r="3.5" fill="#FFFFFF"/><circle cx="76" cy="26" r="5" fill="#FF5500"/></svg>`
    },
    {
      id: 'kit-4',
      name: '04 · LPU Cyber-Matrix',
      sub: '60fps Capsule Waveform',
      accent: '#38bdf8',
      swatches: ['#FFD000', '#00F5D4', '#FF6B00', '#06080E'],
      svg: `<svg viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#06080E"/><rect x="13" y="38" width="13" height="6" rx="3" fill="#FF6B00"/><rect x="27" y="26" width="6" height="44" rx="3" fill="#FFD000"/><rect x="36" y="21" width="6" height="54" rx="3" fill="#FFD000"/><rect x="45" y="25" width="6" height="52" rx="3" fill="#FFD000"/><rect x="54" y="44" width="6" height="33" rx="3" fill="#F59E0B"/><rect x="63" y="46" width="6" height="29" rx="3" fill="#F59E0B"/><rect x="72" y="42" width="6" height="26" rx="3" fill="#FFD000"/><circle cx="39" cy="33" r="3.5" fill="#06080E"/><circle cx="39" cy="33" r="2" fill="#00F5D4"/><rect x="81" y="48" width="4" height="14" rx="2" fill="#00F5D4"/></svg>`
    },
    {
      id: 'kit-5',
      name: '05 · Iridescent Glass',
      sub: 'Titanium & Frosted Wing',
      accent: '#6366f1',
      swatches: ['#F59E0B', '#E2E8F0', '#6366F1', '#0F172A'],
      svg: `<svg viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#E2E8F0"/><circle cx="65" cy="35" r="20" fill="#6366F1" opacity="0.2"/><path d="M20 40 Q10 42 14 48 Q23 50 28 45 Z" fill="#EA580C"/><ellipse cx="53" cy="62" rx="26" ry="19" fill="#F59E0B"/><circle cx="38" cy="40" r="17.5" fill="#FBBF24"/><path d="M40 56 Q54 46 69 58 Q57 74 40 69 Z" fill="#FFFFFF" opacity="0.75"/><circle cx="34" cy="37" r="3.5" fill="#0F172A"/></svg>`
    },
    {
      id: 'kit-6',
      name: '06 · Studio Seal Crest',
      sub: 'Vintage Studio Green & Gold',
      accent: '#34d399',
      swatches: ['#FFD000', '#0B1F17', '#123125', '#FF6B00'],
      svg: `<svg viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0B1F17"/><circle cx="50" cy="50" r="36" fill="none" stroke="#FFD000" stroke-width="2" stroke-dasharray="6 4"/><circle cx="50" cy="50" r="30" fill="#123125" stroke="#F59E0B" stroke-width="1.5"/><path d="M26 42 Q18 43 21 48 Q28 50 32 46 Z" fill="#FF6B00"/><ellipse cx="53" cy="58" rx="19" ry="14" fill="#FFD000"/><circle cx="40" cy="42" r="13" fill="#FFD000"/><path d="M45 55 Q53 49 63 56 Q54 66 45 63 Z" fill="#F59E0B"/><circle cx="37" cy="39.5" r="2.6" fill="#0B1F17"/></svg>`
    }
  ];

  let activeDashKit = 'kit-4';
  const dashKitRatings = { 'kit-1': 4, 'kit-2': 3, 'kit-3': 4, 'kit-4': 5, 'kit-5': 4, 'kit-6': 3 };
  const dashKitGrid = document.getElementById('dashboard-brandkit-grid');
  const dashKitBadge = document.getElementById('dashboard-active-kit-badge');
  const sidebarBrandLogo = document.querySelector('.brand-logo');

  // Initialize active brand kit styling (Option 04 · LPU Cyber-Matrix)
  const defaultKit = DASHBOARD_KITS.find((k) => k.id === activeDashKit);
  if (defaultKit) {
    document.documentElement.style.setProperty('--brand', defaultKit.accent);
    document.documentElement.style.setProperty('--brand-solid', defaultKit.accent);
    if (sidebarBrandLogo) sidebarBrandLogo.innerHTML = defaultKit.svg;
    if (dashKitBadge) dashKitBadge.textContent = `Active: ${defaultKit.name}`;
  }

  function renderDashboardBrandKits() {
    if (!dashKitGrid) return;
    dashKitGrid.innerHTML = DASHBOARD_KITS.map((k) => {
      const isAct = k.id === activeDashKit;
      const rating = dashKitRatings[k.id] || 0;
      const dots = k.swatches.map((hex) => `<span class="dash-kit-dot" style="background:${hex};"></span>`).join('');
      const stars = [1, 2, 3, 4, 5]
        .map((s) => `<button type="button" class="dash-star-btn ${s <= rating ? 'filled' : ''}" data-rate-dash="${k.id}" data-star="${s}">★</button>`)
        .join('');
      return `
        <div class="dash-kit-card ${isAct ? 'is-active' : ''}" data-select-dash="${k.id}">
          <div class="dash-kit-top">
            <div class="dash-kit-icon">${k.svg}</div>
            <div>
              <div class="dash-kit-title">${k.name}</div>
              <div class="dash-kit-sub">${k.sub}</div>
            </div>
          </div>
          <div class="dash-kit-swatches">${dots}</div>
          <div class="dash-kit-stars">
            <div>${stars}</div>
            <span style="font-size:11px;color:var(--text-secondary);font-weight:600;">${rating ? `${rating}/5` : 'Rate'}</span>
          </div>
        </div>
      `;
    }).join('');

    dashKitGrid.querySelectorAll('[data-select-dash]').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-rate-dash]')) return;
        const chosen = DASHBOARD_KITS.find((x) => x.id === card.dataset.selectDash);
        if (chosen) {
          activeDashKit = chosen.id;
          document.documentElement.style.setProperty('--brand', chosen.accent);
          document.documentElement.style.setProperty('--brand-solid', chosen.accent);
          if (sidebarBrandLogo) sidebarBrandLogo.innerHTML = chosen.svg;
          if (dashKitBadge) dashKitBadge.textContent = `Active: ${chosen.name}`;
          renderDashboardBrandKits();
        }
      });
    });

    dashKitGrid.querySelectorAll('[data-rate-dash]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dashKitRatings[btn.dataset.rateDash] = Number(btn.dataset.star);
        renderDashboardBrandKits();
      });
    });
  }

  renderDashboardBrandKits();

  // --- Early-Access Feedback Modal ---
  const feedbackDialog = document.getElementById('feedback-dialog');
  const openFeedbackBtn = document.getElementById('open-feedback-btn');
  const feedbackCloseBtn = document.getElementById('feedback-close-btn');
  const feedbackCancelBtn = document.getElementById('feedback-cancel-btn');
  const feedbackForm = document.getElementById('feedback-form');
  const feedbackMsg = document.getElementById('feedback-message');
  const feedbackCount = document.getElementById('feedback-count');
  const feedbackDiag = document.getElementById('feedback-diagnostics');
  const feedbackStatus = document.getElementById('feedback-status');
  const feedbackSendBtn = document.getElementById('feedback-send-btn');
  const feedbackFormView = document.getElementById('feedback-form-view');
  const feedbackSuccessView = document.getElementById('feedback-success-view');
  const feedbackDoneBtn = document.getElementById('feedback-done-btn');

  function openFeedback() {
    if (!feedbackDialog) return;
    if (feedbackFormView) feedbackFormView.hidden = false;
    if (feedbackSuccessView) feedbackSuccessView.hidden = true;
    if (feedbackStatus) {
      feedbackStatus.textContent = '';
      feedbackStatus.className = 'field-feedback';
    }
    if (feedbackSendBtn) feedbackSendBtn.disabled = false;
    feedbackDialog.showModal();
    if (feedbackMsg) feedbackMsg.focus();
  }

  function closeFeedback() {
    if (feedbackDialog && feedbackDialog.open) {
      feedbackDialog.close();
    }
  }

  if (openFeedbackBtn) openFeedbackBtn.addEventListener('click', openFeedback);
  if (feedbackCloseBtn) feedbackCloseBtn.addEventListener('click', closeFeedback);
  if (feedbackCancelBtn) feedbackCancelBtn.addEventListener('click', closeFeedback);
  if (feedbackDoneBtn) {
    feedbackDoneBtn.addEventListener('click', () => {
      closeFeedback();
      if (feedbackForm) feedbackForm.reset();
      if (feedbackCount) feedbackCount.textContent = '0 / 5000';
    });
  }

  if (feedbackMsg && feedbackCount) {
    feedbackMsg.addEventListener('input', () => {
      feedbackCount.textContent = `${feedbackMsg.value.length} / 5000`;
    });
  }

  if (feedbackForm) {
    feedbackForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = (feedbackMsg ? feedbackMsg.value : '').trim();
      if (!message) {
        if (feedbackStatus) {
          feedbackStatus.className = 'field-feedback is-error';
          feedbackStatus.textContent = 'Please write a message first.';
        }
        return;
      }

      const selectedKind = feedbackForm.querySelector('input[name="feedback-kind"]:checked')?.value || 'other';
      const includeDiagnostics = feedbackDiag ? feedbackDiag.checked : true;

      if (feedbackSendBtn) feedbackSendBtn.disabled = true;
      if (feedbackStatus) {
        feedbackStatus.className = 'field-feedback';
        feedbackStatus.textContent = 'Sending feedback…';
      }

      try {
        const res = await window.voxflow.submitFeedback({
          kind: selectedKind,
          message,
          includeDiagnostics
        });

        if (res && res.ok) {
          if (feedbackFormView) feedbackFormView.hidden = true;
          if (feedbackSuccessView) feedbackSuccessView.hidden = false;
        } else {
          if (feedbackSendBtn) feedbackSendBtn.disabled = false;
          if (feedbackStatus) {
            feedbackStatus.className = 'field-feedback is-error';
            feedbackStatus.textContent = (res && res.error) ? res.error : 'Could not send. Please try again.';
          }
        }
      } catch (err) {
        if (feedbackSendBtn) feedbackSendBtn.disabled = false;
        if (feedbackStatus) {
          feedbackStatus.className = 'field-feedback is-error';
          feedbackStatus.textContent = err?.message || 'Network error sending feedback.';
        }
      }
    });
  }

  if (window.voxflow.onOpenFeedback) {
    window.voxflow.onOpenFeedback(() => {
      openFeedback();
    });
  }

  window.voxflow.getState().then((initial) => {
    renderState(initial);
  });
})();
