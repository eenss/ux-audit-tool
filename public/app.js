// ---- User identity ----
function getUserId() {
  let id = localStorage.getItem('userId');
  if (!id) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('userId', id);
  }
  return id;
}

// Wrapper for fetch that includes user ID header
function apiFetch(url, options = {}) {
  options.headers = { ...options.headers, 'X-User-Id': getUserId() };
  return fetch(url, options);
}

const form = document.getElementById('audit-form');
const runBtn = document.getElementById('run-btn');
const runStatus = document.getElementById('run-status');
const resultsContainer = document.getElementById('results-container');
const sessionStatus = document.getElementById('session-status');

// Session setup buttons
const loginBtn = document.getElementById('login-btn');
const sessionDoneBtn = document.getElementById('session-done-btn');
const sessionOta = document.getElementById('session-ota');

// Session status badge in collapsed header
const sessionBadge = document.getElementById('session-badge');

// Floating panels + FABs
const fabGuide = document.getElementById('fab-guide');
const fabFeedback = document.getElementById('fab-feedback');
const floatGuide = document.getElementById('float-guide');
const floatFeedback = document.getElementById('float-feedback');

function closeAllPanels() {
  floatGuide.classList.remove('open');
  floatFeedback.classList.remove('open');
  fabGuide.classList.remove('active');
  fabFeedback.classList.remove('active');
}

fabGuide.addEventListener('click', () => {
  const wasOpen = floatGuide.classList.contains('open');
  closeAllPanels();
  if (!wasOpen) {
    floatGuide.classList.add('open');
    fabGuide.classList.add('active');
  }
});

fabFeedback.addEventListener('click', () => {
  const wasOpen = floatFeedback.classList.contains('open');
  closeAllPanels();
  if (!wasOpen) {
    floatFeedback.classList.add('open');
    fabFeedback.classList.add('active');
  }
});

document.getElementById('float-guide-close').addEventListener('click', closeAllPanels);
document.getElementById('float-feedback-close').addEventListener('click', closeAllPanels);

const isLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);

// Close panels on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllPanels();
});

// Session panel collapse toggle
const sessionPanel = document.getElementById('session-panel');
const sessionToggle = document.getElementById('session-toggle');

sessionToggle.addEventListener('click', () => {
  sessionPanel.classList.toggle('open');
});

// Start with session panel open if no profile exists
(async function initSessionPanel() {
  try {
    const res = await apiFetch('/api/sessions');
    const sessions = await res.json();
    const ota = sessionOta.value;
    if (!sessions[ota]) {
      sessionPanel.classList.add('open');
    }
  } catch {
    sessionPanel.classList.add('open');
  }
})();

// Language-to-currency auto-linking
const LANG_CURRENCY_MAP = {
  'ko-kr': 'KRW', 'en-us': 'USD', 'fr-fr': 'EUR', 'de-de': 'EUR',
  'es-es': 'EUR', 'ja': 'JPY', 'zh-cn': 'CNY', 'zh-tw': 'TWD',
  'zh-hk': 'HKD', 'th': 'THB', 'vi': 'VND', 'ms': 'MYR',
  'id': 'IDR', 'ru': 'RUB',
};

// Set default dates (today + 1 month)
const defaultDate = new Date();
defaultDate.setMonth(defaultDate.getMonth() + 1);
const dayAfter = new Date(defaultDate);
dayAfter.setDate(dayAfter.getDate() + 1);
document.getElementById('check-in').value = formatDate(defaultDate);
document.getElementById('check-out').value = formatDate(dayAfter);
document.getElementById('departure-date').value = formatDate(defaultDate);

// Icon toggle logic
const platformHidden = document.getElementById('platform');
const flowHidden = document.getElementById('flow-type');
const hotelFields = document.getElementById('hotel-fields');
const flightFields = document.getElementById('flight-fields');

function setupIconToggle(containerId, hiddenInput, onChange) {
  const container = document.getElementById(containerId);
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-btn');
    if (!btn || btn.disabled) return;
    container.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    hiddenInput.value = btn.dataset.value;
    if (onChange) onChange(btn.dataset.value);
  });
}

setupIconToggle('platform-toggle', platformHidden);
setupIconToggle('flow-toggle', flowHidden, (val) => {
  localStorage.setItem('lastFlowType', val);
  if (val === 'flight') {
    hotelFields.classList.add('hidden');
    flightFields.classList.remove('hidden');
  } else {
    hotelFields.classList.remove('hidden');
    flightFields.classList.add('hidden');
  }
});

// Restore last selected flow type (default: flight)
(function restoreFlowType() {
  const saved = localStorage.getItem('lastFlowType') || 'flight';
  const container = document.getElementById('flow-toggle');
  const target = container.querySelector('[data-value="' + saved + '"]');
  if (target && !target.disabled) {
    container.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('active'));
    target.classList.add('active');
    flowHidden.value = saved;
    if (saved === 'flight') {
      hotelFields.classList.add('hidden');
      flightFields.classList.remove('hidden');
    } else {
      hotelFields.classList.remove('hidden');
      flightFields.classList.add('hidden');
    }
  }
})();

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

// Check sessions on load
async function checkSessions() {
  try {
    const res = await apiFetch('/api/sessions');
    const sessions = await res.json();
    const ota = sessionOta.value;
    if (sessions[ota]) {
      sessionStatus.textContent = `Profile exists for ${ota}`;
      sessionStatus.style.color = '#1a8754';
      sessionBadge.textContent = 'Logged in';
      sessionBadge.className = 'session-badge session-badge--ok';
    } else {
      sessionStatus.textContent = `No profile for ${ota}. Click "Open Login" to set up.`;
      sessionStatus.style.color = '#d63031';
      sessionBadge.textContent = 'Not logged in';
      sessionBadge.className = 'session-badge session-badge--warn';
    }
  } catch {
    sessionStatus.textContent = '';
    sessionBadge.textContent = '';
    sessionBadge.className = 'session-badge';
  }
}

sessionOta.addEventListener('change', checkSessions);
checkSessions();

// Session setup: open browser for login
async function openSessionBrowser() {
  const ota = sessionOta.value;
  loginBtn.disabled = true;

  sessionStatus.textContent = `Opening ${ota} for Login...`;
  sessionStatus.style.color = '#3366e6';

  try {
    const res = await apiFetch('/api/session/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ota, mode: 'login' }),
    });

    if (res.status === 409) {
      sessionStatus.textContent = 'A browser is already open. Click "Done" to close it first.';
      sessionStatus.style.color = '#d63031';
      sessionDoneBtn.style.display = '';
      return;
    }

    if (!res.ok) {
      const err = await res.json();
      sessionStatus.textContent = 'Error: ' + (err.error || 'Failed to open browser');
      sessionStatus.style.color = '#d63031';
      loginBtn.disabled = false;
      return;
    }

    sessionStatus.textContent = `Chrome opened. Log in to ${ota}, then click "Done" below.`;
    sessionStatus.style.color = '#3366e6';
    sessionDoneBtn.style.display = '';
  } catch (err) {
    sessionStatus.textContent = 'Error: ' + err.message;
    sessionStatus.style.color = '#d63031';
    loginBtn.disabled = false;
  }
}

loginBtn.addEventListener('click', () => openSessionBrowser());

sessionDoneBtn.addEventListener('click', async () => {
  sessionDoneBtn.disabled = true;
  sessionStatus.textContent = 'Closing browser...';

  try {
    await apiFetch('/api/session/close', { method: 'POST' });
    sessionStatus.textContent = 'Session saved!';
    sessionStatus.style.color = '#1a8754';
  } catch (err) {
    sessionStatus.textContent = 'Error closing: ' + err.message;
    sessionStatus.style.color = '#d63031';
  }

  sessionDoneBtn.style.display = 'none';
  sessionDoneBtn.disabled = false;
  loginBtn.disabled = false;
  checkSessions();
});

// Load existing results
async function loadResults() {
  try {
    const res = await apiFetch('/api/audits');
    const audits = await res.json();

    if (audits.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <p>No audits yet. Run one above to get started.</p>
        </div>`;
      return;
    }

    resultsContainer.innerHTML = '';
    for (const audit of audits) {
      const group = document.createElement('div');
      group.className = 'audit-group';

      const timeStr = audit.capturedAt
        ? new Date(audit.capturedAt).toLocaleString()
        : '';
      const localeStr = audit.params
        ? ` (${audit.params.language || '?'}, ${audit.params.currency || '?'})`
        : '';

      const downloadPath = `/api/audits/download/${audit.ota}/${audit.platform}/${audit.flowType}`;

      const langLabel = audit.params?.language || '';
      const curLabel = audit.params?.currency || '';
      const localeBadge = langLabel ? `<span class="locale-badge">${langLabel} / ${curLabel}</span>` : '';

      group.innerHTML = `
        <div class="audit-header">
          <div class="audit-header-left">
            <h3>
              <span class="ota-badge ota-${audit.ota}">${audit.ota.toUpperCase()}</span>
              <span class="platform-badge">${audit.platform.toUpperCase()}</span>
              <span class="flow-label">${audit.flowType}</span>
              ${localeBadge}
            </h3>
            ${timeStr ? `<span class="capture-time">${timeStr}</span>` : ''}
          </div>
          <div class="audit-header-actions">
            <span class="step-count">${audit.steps.length} steps</span>
            <a href="${downloadPath}" class="btn-download" download>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download
            </a>
          </div>
        </div>
        <div class="steps-grid">
          ${audit.steps.map((step, i) => `
            <div class="step-card">
              <img src="${step.url}" alt="${step.name}" loading="lazy" onclick="openLightbox('${step.url}')">
              <div class="step-info">
                <div class="step-num">Step ${i + 1}</div>
                <div class="step-name">${step.name.replace(/-/g, ' ')}</div>
                ${step.pageUrl ? `<div class="step-url" title="${step.pageUrl}">${truncateUrl(step.pageUrl)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      resultsContainer.appendChild(group);
    }
  } catch (err) {
    console.error('Failed to load results:', err);
  }
}

loadResults();

// Language / currency persistence + auto-linking
const auditLanguage = document.getElementById('audit-language');
const auditCurrency = document.getElementById('audit-currency');

(function restoreLocaleSettings() {
  const savedLang = localStorage.getItem('auditLanguage');
  const savedCur = localStorage.getItem('auditCurrency');
  if (savedLang) auditLanguage.value = savedLang;
  if (savedCur) auditCurrency.value = savedCur;
})();

auditLanguage.addEventListener('change', () => {
  localStorage.setItem('auditLanguage', auditLanguage.value);
  // Auto-select matching currency
  const mapped = LANG_CURRENCY_MAP[auditLanguage.value];
  if (mapped) {
    auditCurrency.value = mapped;
    localStorage.setItem('auditCurrency', mapped);
    // Brief highlight animation on currency field
    auditCurrency.closest('label').classList.add('field-flash');
    setTimeout(() => auditCurrency.closest('label').classList.remove('field-flash'), 600);
  }
});
auditCurrency.addEventListener('change', () => {
  localStorage.setItem('auditCurrency', auditCurrency.value);
});

// Run audit
console.log('Form listener attached');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  console.log('Run Audit clicked!');

  const ota = sessionOta.value;
  const platform = platformHidden.value;
  const flowType = flowHidden.value;
  const language = auditLanguage.value;
  const currency = auditCurrency.value;

  let params;
  if (flowType === 'flight') {
    params = {
      language,
      currency,
      origin: document.getElementById('origin').value,
      destination: document.getElementById('flight-destination').value,
      departureDate: document.getElementById('departure-date').value,
      cabinClass: document.getElementById('cabin-class').value,
    };
  } else {
    params = {
      language,
      currency,
      destination: document.getElementById('destination').value,
      checkIn: document.getElementById('check-in').value,
      checkOut: document.getElementById('check-out').value,
    };
  }

  runBtn.disabled = true;
  runBtn.innerHTML = '<span class="spinner"></span> Running audit...';
  runBtn.classList.add('btn--running');
  showStatus('Launching browser and setting up locale...', 'info');

  try {
    console.log('Sending request...', { ota, platform, flowType });
    const res = await apiFetch('/api/audit/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ota,
        platform,
        flowType,
        params,
      }),
    });
    console.log('Response:', res.status);

    if (res.status === 409) {
      showStatus('An audit is already running. Please wait.', 'error');
      resetRunBtn();
      return;
    }

    // Poll for completion
    pollStatus();
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'error');
    resetRunBtn();
  }
});

function resetRunBtn() {
  runBtn.disabled = false;
  runBtn.classList.remove('btn--running');
  runBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Audit`;
}

async function pollStatus() {
  const check = async () => {
    try {
      const res = await apiFetch('/api/audit/status');
      const status = await res.json();

      if (status.running) {
        const step = status.currentStep || '';
        if (step) {
          showStatus(`Running: ${step}...`, 'info');
        }
        setTimeout(check, 2000);
      } else {
        showStatus('Audit complete! Screenshots captured.', 'success');
        resetRunBtn();
        // Short delay to ensure screenshots and meta are fully written to disk
        setTimeout(loadResults, 1500);
      }
    } catch {
      setTimeout(check, 2000);
    }
  };
  setTimeout(check, 3000);
}

function showStatus(msg, type) {
  runStatus.textContent = msg;
  runStatus.className = `status ${type}`;
}

// Lightbox with zoom slider, download, close
function openLightbox(url) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';

  const img = document.createElement('img');
  img.src = url;
  lb.appendChild(img);

  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let isDragging = false;
  let startX, startY;

  function updateTransform() {
    img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    img.style.cursor = scale > 1 ? 'grab' : 'default';
    zoomSlider.value = scale;
    zoomLabel.textContent = Math.round(scale * 100) + '%';
  }

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'lightbox-toolbar';

  // Zoom slider group
  const zoomGroup = document.createElement('div');
  zoomGroup.className = 'lb-zoom-group';

  const zoomMin = document.createElement('span');
  zoomMin.className = 'lb-zoom-cap';
  zoomMin.textContent = '-';

  const zoomSlider = document.createElement('input');
  zoomSlider.type = 'range';
  zoomSlider.className = 'lb-slider';
  zoomSlider.min = '0.25';
  zoomSlider.max = '5';
  zoomSlider.step = '0.05';
  zoomSlider.value = '1';
  zoomSlider.addEventListener('input', (e) => {
    e.stopPropagation();
    scale = parseFloat(zoomSlider.value);
    updateTransform();
  });

  const zoomMax = document.createElement('span');
  zoomMax.className = 'lb-zoom-cap';
  zoomMax.textContent = '+';

  const zoomLabel = document.createElement('span');
  zoomLabel.className = 'lb-zoom-label';
  zoomLabel.textContent = '100%';

  zoomGroup.appendChild(zoomMin);
  zoomGroup.appendChild(zoomSlider);
  zoomGroup.appendChild(zoomMax);
  zoomGroup.appendChild(zoomLabel);

  // Download button
  const dlBtn = document.createElement('a');
  dlBtn.href = url;
  dlBtn.download = url.split('/').pop();
  dlBtn.className = 'lb-btn';
  dlBtn.textContent = 'Download';
  dlBtn.addEventListener('click', (e) => e.stopPropagation());

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.className = 'lb-btn lb-btn-close';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    lb.remove();
    document.removeEventListener('keydown', escHandler);
  });

  toolbar.appendChild(zoomGroup);
  toolbar.appendChild(dlBtn);
  toolbar.appendChild(closeBtn);
  lb.appendChild(toolbar);

  // Scroll to zoom
  lb.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    scale = Math.max(0.25, Math.min(5, scale + delta));
    updateTransform();
  }, { passive: false });

  // Drag to pan
  img.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    img.style.cursor = 'grabbing';
    e.preventDefault();
  });

  lb.addEventListener('mousemove', (e) => {
    if (isDragging) {
      translateX = e.clientX - startX;
      translateY = e.clientY - startY;
      updateTransform();
    }
  });

  lb.addEventListener('mouseup', () => {
    isDragging = false;
    img.style.cursor = scale > 1 ? 'grab' : 'default';
  });

  // Close on background click
  lb.addEventListener('click', (e) => {
    if (e.target === lb) {
      lb.remove();
      document.removeEventListener('keydown', escHandler);
    }
  });

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);

  document.body.appendChild(lb);
}

function truncateUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 40
      ? u.pathname.substring(0, 40) + '...'
      : u.pathname;
    return u.hostname + path;
  } catch {
    return url.substring(0, 50);
  }
}

// Make functions available globally
window.openLightbox = openLightbox;

// ---- Feedback submit ----
const feedbackForm = document.getElementById('feedback-form');
const feedbackSuccess = document.getElementById('feedback-success');

function getAuditContext() {
  return {
    ota: sessionOta.value,
    platform: platformHidden.value,
    flow: flowHidden.value,
    language: auditLanguage.value,
    currency: auditCurrency.value,
  };
}

feedbackForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('fb-name').value;
  const type = document.getElementById('fb-type').value;
  const message = document.getElementById('fb-message').value;
  const attachContext = document.getElementById('fb-attach-context').checked;

  try {
    await apiFetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        type,
        message,
        auditContext: attachContext ? getAuditContext() : null,
      }),
    });
    document.getElementById('fb-message').value = '';
    document.getElementById('fb-name').value = '';
    feedbackSuccess.style.display = '';
    setTimeout(() => { feedbackSuccess.style.display = 'none'; }, 4000);
  } catch (err) {
    console.error('Failed to submit feedback:', err);
  }
});
