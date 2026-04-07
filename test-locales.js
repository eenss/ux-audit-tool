/**
 * Automated locale testing script
 *
 * Runs flight audit for each target locale sequentially,
 * waits for completion, and verifies:
 *   1. Audit completed with screenshots
 *   2. Page URLs contain the correct locale code
 *   3. Page URLs contain the correct currency
 *
 * Usage: node test-locales.js [--dry-run]
 */

const BASE = 'http://localhost:3200';

// Locale code mapping (language input -> URL locale code)
const LOCALE_MAP = {
  'ko-kr': 'ko-kr', 'ja': 'ja-jp', 'th': 'th-th',
  'zh-hk': 'zh-hk', 'zh-tw': 'zh-tw', 'ru': 'ru-ru',
  'fr': 'fr-fr', 'de': 'de-de', 'es': 'es-es',
  'vi': 'vi-vn', 'id': 'id-id', 'ms': 'ms-my',
};

// Target locales (excluding en-xx variants) with matching currencies
const LOCALES = [
  { language: 'ko-kr', currency: 'KRW', label: 'Korean' },
  { language: 'ja',    currency: 'JPY', label: 'Japanese' },
  { language: 'th',    currency: 'THB', label: 'Thai' },
  { language: 'zh-hk', currency: 'HKD', label: 'Chinese (HK)' },
  { language: 'zh-tw', currency: 'TWD', label: 'Chinese (TW)' },
  { language: 'ru',    currency: 'RUB', label: 'Russian' },
  { language: 'fr',    currency: 'EUR', label: 'French' },
  { language: 'de',    currency: 'EUR', label: 'German' },
  { language: 'es',    currency: 'EUR', label: 'Spanish' },
  { language: 'vi',    currency: 'VND', label: 'Vietnamese' },
  { language: 'id',    currency: 'IDR', label: 'Indonesian' },
  { language: 'ms',    currency: 'MYR', label: 'Malaysian' },
];

// Default search params
const defaultDate = new Date();
defaultDate.setMonth(defaultDate.getMonth() + 1);
const departureDate = defaultDate.toISOString().split('T')[0];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForComplete(maxWait = 180000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(BASE + '/api/audit/status');
      const status = await res.json();
      if (!status.running) return true;
    } catch (e) {}
    await sleep(3000);
  }
  return false;
}

async function runAudit(locale) {
  const params = {
    language: locale.language,
    currency: locale.currency,
    origin: 'ICN',
    destination: 'NRT',
    departureDate: departureDate,
    cabinClass: 'economy',
  };

  const res = await fetch(BASE + '/api/audit/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ota: 'agoda',
      platform: 'ol',
      flowType: 'flight',
      params,
    }),
  });

  if (res.status === 409) {
    console.log('  [!] Audit already running, waiting...');
    await waitForComplete();
    // Retry
    return runAudit(locale);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { success: false, error: err.error || res.statusText };
  }

  // Wait for completion
  const completed = await waitForComplete();
  if (!completed) {
    return { success: false, error: 'Timed out after 3 minutes' };
  }

  // Check results and verify locale
  try {
    const auditsRes = await fetch(BASE + '/api/audits');
    const audits = await auditsRes.json();
    const latest = audits.find(a => a.ota === 'agoda' && a.platform === 'ol' && a.flowType === 'flight');
    if (!latest || !latest.steps || latest.steps.length === 0) {
      return { success: false, error: 'No steps captured' };
    }

    // Verify locale and currency from step URLs
    const expectedLocale = LOCALE_MAP[locale.language] || locale.language;
    const expectedCurrency = locale.currency;
    const warnings = [];

    // Check page URLs for locale code
    const urlSteps = latest.steps.filter(s => s.pageUrl);
    const localeInUrl = urlSteps.filter(s =>
      s.pageUrl.includes('/' + expectedLocale + '/') ||
      s.pageUrl.includes('locale=' + expectedLocale) ||
      s.pageUrl.includes('htmlLanguage=' + expectedLocale)
    );

    if (urlSteps.length > 0 && localeInUrl.length === 0) {
      warnings.push('LANG_MISMATCH: No URLs contain locale "' + expectedLocale + '"');
      // Show what locale was actually in the URLs
      const sampleUrl = urlSteps[0].pageUrl;
      const localeMatch = sampleUrl.match(/\/([a-z]{2}-[a-z]{2})\//);
      if (localeMatch) warnings.push('  actual locale in URL: ' + localeMatch[1]);
    } else if (urlSteps.length > 0) {
      const pct = Math.round(localeInUrl.length / urlSteps.length * 100);
      if (pct < 50) {
        warnings.push('LANG_PARTIAL: Only ' + pct + '% of URLs contain locale "' + expectedLocale + '"');
      }
    }

    // Check page URLs for currency
    const currencyInUrl = urlSteps.filter(s =>
      s.pageUrl.toLowerCase().includes('currency=' + expectedCurrency.toLowerCase())
    );
    if (urlSteps.length > 0 && currencyInUrl.length === 0) {
      warnings.push('CURRENCY_MISMATCH: No URLs contain currency "' + expectedCurrency + '"');
      const currMatch = urlSteps[0].pageUrl.match(/currency=([A-Z]{3})/i);
      if (currMatch) warnings.push('  actual currency in URL: ' + currMatch[1]);
    }

    // Check that params were correctly stored in metadata
    if (latest.params) {
      if (latest.params.language !== locale.language) {
        warnings.push('PARAM_LANG: Stored language "' + latest.params.language + '" != expected "' + locale.language + '"');
      }
      if (latest.params.currency !== locale.currency) {
        warnings.push('PARAM_CUR: Stored currency "' + latest.params.currency + '" != expected "' + locale.currency + '"');
      }
    } else {
      warnings.push('NO_PARAMS: No params stored in metadata');
    }

    return {
      success: true,
      steps: latest.steps.length,
      capturedAt: latest.capturedAt,
      localeVerified: warnings.length === 0,
      warnings,
      sampleUrl: urlSteps.length > 0 ? urlSteps[0].pageUrl : null,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('=== Locale Automation Test ===');
  console.log('Server: ' + BASE);
  console.log('Departure: ' + departureDate);
  console.log('Locales: ' + LOCALES.length);
  console.log('');

  if (dryRun) {
    console.log('[DRY RUN] Would test these locales:');
    LOCALES.forEach((l, i) => console.log('  ' + (i + 1) + '. ' + l.label + ' (' + l.language + ' / ' + l.currency + ')'));
    return;
  }

  const results = [];

  for (let i = 0; i < LOCALES.length; i++) {
    const locale = LOCALES[i];
    const num = (i + 1) + '/' + LOCALES.length;
    console.log('[' + num + '] Testing: ' + locale.label + ' (' + locale.language + ' / ' + locale.currency + ')');

    const start = Date.now();
    try {
      const result = await runAudit(locale);
      const elapsed = Math.round((Date.now() - start) / 1000);

      if (result.success) {
        const verifyIcon = result.localeVerified ? 'VERIFIED' : 'WARN';
        console.log('  OK - ' + result.steps + ' steps, locale: ' + verifyIcon + ' (' + elapsed + 's)');
        if (result.warnings && result.warnings.length > 0) {
          result.warnings.forEach(w => console.log('    ' + w));
        }
      } else {
        console.log('  FAIL - ' + result.error + ' (' + elapsed + 's)');
      }
      results.push({ ...locale, ...result, elapsed });
    } catch (e) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log('  ERROR - ' + e.message + ' (' + elapsed + 's)');
      results.push({ ...locale, success: false, error: e.message, elapsed });
    }

    // Small gap between runs
    if (i < LOCALES.length - 1) {
      await sleep(2000);
    }
  }

  // Summary
  console.log('');
  console.log('=== RESULTS ===');
  console.log('');

  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  const verified = results.filter(r => r.success && r.localeVerified);
  const localeWarn = results.filter(r => r.success && !r.localeVerified);

  console.log('Passed:   ' + passed.length + '/' + results.length);
  console.log('Verified: ' + verified.length + '/' + passed.length + ' (locale + currency correct)');
  if (failed.length > 0) {
    console.log('');
    console.log('FAILED:');
    failed.forEach(f => console.log('  - ' + f.label + ' (' + f.language + '): ' + f.error));
  }
  if (localeWarn.length > 0) {
    console.log('');
    console.log('LOCALE WARNINGS:');
    localeWarn.forEach(w => {
      console.log('  - ' + w.label + ' (' + w.language + '):');
      (w.warnings || []).forEach(msg => console.log('      ' + msg));
    });
  }

  console.log('');
  console.log('Locale          | Status | Locale OK | Steps | Time');
  console.log('----------------|--------|-----------|-------|------');
  results.forEach(r => {
    const name = (r.label + '               ').substring(0, 16);
    const status = r.success ? 'OK    ' : 'FAIL  ';
    const locOk = !r.success ? '   -     ' : (r.localeVerified ? '   YES   ' : '   NO    ');
    const steps = r.success ? String(r.steps).padStart(5) : '    -';
    const time = String(r.elapsed || 0).padStart(4) + 's';
    console.log(name + '| ' + status + ' | ' + locOk + ' | ' + steps + ' | ' + time);
  });

  // Exit with error code if any failed
  if (failed.length > 0) process.exit(1);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
