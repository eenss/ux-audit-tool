import express from 'express';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { getFlow, listFlows } from './flows/index.js';

const app = express();
const PORT = 3200;
const ROOT = import.meta.dirname;
const LOG_FILE = path.join(ROOT, 'audit.log');
const FEEDBACK_FILE = path.join(ROOT, 'feedback.json');

// Capture console output to log file
const origLog = console.log;
const origError = console.error;
function appendLog(args) {
  try {
    const line = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n';
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
}
console.log = function(...args) { origLog.apply(console, args); appendLog(args); };
console.error = function(...args) { origError.apply(console, args); appendLog(args); };

app.use(express.json());
app.get('/feedback', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'feedback.html'));
});

app.get('/setup-guide', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'setup-guide.html'));
});

app.use(express.static(path.join(ROOT, 'public')));
app.use('/screenshots', express.static(path.join(ROOT, 'screenshots')));

// Extract userId from header for all API requests
function getUserId(req) {
  return req.headers['x-user-id'] || '_default';
}

// Check if request is from localhost (admin)
function isAdmin(req) {
  const host = req.hostname || req.headers.host || '';
  return host === 'localhost' || host === '127.0.0.1' || host.startsWith('localhost:');
}

// List available flows
app.get('/api/flows', (req, res) => {
  res.json(listFlows());
});

// List completed audits (scan screenshots directory, filtered by userId)
app.get('/api/audits', (req, res) => {
  const userId = getUserId(req);
  const userDir = path.join(ROOT, 'screenshots', userId);
  const audits = [];

  if (!fs.existsSync(userDir)) {
    return res.json(audits);
  }

  for (const ota of fs.readdirSync(userDir)) {
    const otaDir = path.join(userDir, ota);
    if (!fs.statSync(otaDir).isDirectory()) continue;

    for (const platform of fs.readdirSync(otaDir)) {
      const platDir = path.join(otaDir, platform);
      if (!fs.statSync(platDir).isDirectory()) continue;

      for (const flowType of fs.readdirSync(platDir)) {
        const flowDir = path.join(platDir, flowType);
        if (!fs.statSync(flowDir).isDirectory()) continue;

        // Try to load metadata
        const metaPath = path.join(flowDir, '_meta.json');
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            audits.push({
              ota,
              platform,
              flowType,
              capturedAt: meta.capturedAt,
              params: meta.params,
              steps: meta.steps.map((s) => ({
                filename: s.filename,
                url: `/screenshots/${userId}/${ota}/${platform}/${flowType}/${s.filename}`,
                name: s.name,
                pageUrl: s.url,
                description: s.description,
              })),
            });
            continue;
          } catch { /* fall through to file scan */ }
        }

        // Fallback: scan for PNGs
        const files = fs.readdirSync(flowDir)
          .filter((f) => f.endsWith('.png'))
          .sort();

        if (files.length > 0) {
          audits.push({
            ota,
            platform,
            flowType,
            steps: files.map((f) => ({
              filename: f,
              url: `/screenshots/${userId}/${ota}/${platform}/${flowType}/${f}`,
              name: f.replace(/^\d+_/, '').replace('.png', ''),
            })),
          });
        }
      }
    }
  }

  res.json(audits);
});

// Run an audit
let runningAudit = null;

app.post('/api/audit/run', async (req, res) => {
  const userId = getUserId(req);

  if (runningAudit && runningAudit.userId === userId) {
    return res.status(409).json({ error: 'An audit is already running. Please wait.' });
  }

  const { ota, platform, flowType, params } = req.body;

  try {
    const flow = getFlow(ota, platform, flowType);
    runningAudit = { ota, platform, flowType, userId, startedAt: new Date() };

    // Clear previous screenshots for this user's flow
    const flowDir = path.join(ROOT, 'screenshots', userId, ota, platform, flowType);
    if (fs.existsSync(flowDir)) {
      for (const f of fs.readdirSync(flowDir)) {
        if (f.endsWith('.png')) fs.unlinkSync(path.join(flowDir, f));
      }
    }

    // Inject userId into params so the flow can use it for profile/screenshot paths
    const flowParams = { ...params, userId };

    // Run in background, respond immediately
    res.json({ status: 'started', ota, platform, flowType });

    const result = await flow.run(flowParams);
    runningAudit = null;
    console.log('Audit complete:', result.steps.length, 'steps captured');
  } catch (err) {
    runningAudit = null;
    console.error('=== AUDIT FAILED ===');
    console.error(err.message);
    console.error(err.stack);
  }
});

app.get('/api/audit/status', (req, res) => {
  if (runningAudit) {
    res.json({ running: true, ...runningAudit });
  } else {
    res.json({ running: false });
  }
});

// ===== Session management (login / locale) =====
var OTA_URLS = {
  agoda: 'https://www.agoda.com',
  bcom: 'https://www.booking.com',
  expedia: 'https://www.expedia.com',
  trip: 'https://www.trip.com',
};

let sessionBrowser = null; // active login/locale browser context

app.post('/api/session/open', async (req, res) => {
  if (sessionBrowser) {
    return res.status(409).json({ error: 'A browser session is already open. Close it first.' });
  }

  const { ota, mode } = req.body; // mode: 'login' or 'locale'
  const userId = getUserId(req);
  if (!OTA_URLS[ota]) {
    return res.status(400).json({ error: 'Unknown OTA: ' + ota });
  }

  const profileDir = path.resolve(ROOT, 'profiles', userId, ota);
  fs.mkdirSync(profileDir, { recursive: true });

  try {
    const { chromium } = await import('playwright');
    const context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1440, height: 900 },
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();
    await page.goto(OTA_URLS[ota]);

    sessionBrowser = { context, ota, mode, startedAt: new Date() };
    console.log(`Session browser opened for ${ota} (${mode})`);
    res.json({ status: 'opened', ota, mode });
  } catch (err) {
    console.error('Failed to open session browser:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/session/close', async (req, res) => {
  if (!sessionBrowser) {
    return res.status(404).json({ error: 'No browser session is open.' });
  }

  try {
    await sessionBrowser.context.close();
    console.log(`Session browser closed for ${sessionBrowser.ota}`);
    sessionBrowser = null;
    res.json({ status: 'closed' });
  } catch (err) {
    sessionBrowser = null;
    res.json({ status: 'closed', warning: err.message });
  }
});

app.get('/api/session/status', (req, res) => {
  if (sessionBrowser) {
    res.json({ open: true, ota: sessionBrowser.ota, mode: sessionBrowser.mode });
  } else {
    res.json({ open: false });
  }
});

// Check which OTAs have saved profiles (per user)
app.get('/api/sessions', (req, res) => {
  const userId = getUserId(req);
  const sessions = {};
  const otas = ['agoda', 'bcom', 'expedia', 'trip'];

  for (const ota of otas) {
    const profileDir = path.join(ROOT, 'profiles', userId, ota, 'Default');
    sessions[ota] = fs.existsSync(profileDir);
  }

  res.json(sessions);
});

// Get audit log (last 200 lines)
app.get('/api/audit/log', (req, res) => {
  try {
    if (!fs.existsSync(LOG_FILE)) return res.json({ log: '' });
    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = content.split('\n');
    const last200 = lines.slice(-200).join('\n');
    res.json({ log: last200 });
  } catch {
    res.json({ log: '' });
  }
});

// Clear audit log
app.post('/api/audit/log/clear', (req, res) => {
  try { fs.writeFileSync(LOG_FILE, ''); } catch {}
  res.json({ status: 'cleared' });
});

// Download all screenshots as zip (per user)
app.get('/api/audits/download/:ota/:platform/:flowType', (req, res) => {
  const userId = getUserId(req);
  const { ota, platform, flowType } = req.params;
  const flowDir = path.join(ROOT, 'screenshots', userId, ota, platform, flowType);

  if (!fs.existsSync(flowDir)) {
    return res.status(404).json({ error: 'No screenshots found' });
  }

  const files = fs.readdirSync(flowDir).filter(f => f.endsWith('.png'));
  if (files.length === 0) {
    return res.status(404).json({ error: 'No screenshots found' });
  }

  const zipName = `${ota}_${platform}_${flowType}_screenshots.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.pipe(res);

  for (const file of files) {
    archive.file(path.join(flowDir, file), { name: file });
  }

  // Include metadata
  const metaPath = path.join(flowDir, '_meta.json');
  if (fs.existsSync(metaPath)) {
    archive.file(metaPath, { name: '_meta.json' });
  }

  archive.finalize();
});

// ---- Feedback API ----
function readFeedback() {
  try {
    if (fs.existsSync(FEEDBACK_FILE)) {
      return JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

function writeFeedback(items) {
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(items, null, 2));
}

const ADMIN_PASSWORD = process.env.ADMIN_PW || 'uxaudit2026';

function checkAdminAuth(req, res) {
  const pw = req.headers['x-admin-pw'] || req.query.pw;
  if (pw !== ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

app.get('/api/feedback', (req, res) => {
  if (!checkAdminAuth(req, res)) return;
  res.json(readFeedback());
});

app.post('/api/feedback', (req, res) => {
  const { name, type, message, auditContext } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }
  const items = readFeedback();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: (name || 'Anonymous').trim(),
    type: type || 'bug',
    message: message.trim(),
    auditContext: auditContext || null,
    createdAt: new Date().toISOString(),
    resolved: false,
  };
  items.unshift(entry);
  writeFeedback(items);
  res.json(entry);
});

app.patch('/api/feedback/:id', (req, res) => {
  if (!checkAdminAuth(req, res)) return;
  const items = readFeedback();
  const item = items.find(f => f.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (req.body.resolved !== undefined) item.resolved = req.body.resolved;
  writeFeedback(items);
  res.json(item);
});

app.delete('/api/feedback/:id', (req, res) => {
  if (!checkAdminAuth(req, res)) return;
  let items = readFeedback();
  const before = items.length;
  items = items.filter(f => f.id !== req.params.id);
  if (items.length === before) return res.status(404).json({ error: 'Not found' });
  writeFeedback(items);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\nUX Audit Tool running at http://localhost:${PORT}\n`);
});
