import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

// Use a completely fresh temp profile
var FRESH_PROFILE = path.join(os.tmpdir(), 'agoda-lang-test-' + Date.now());

async function main() {
  console.log('Discovering Agoda DLang support...\n');
  console.log('Using fresh profile: ' + FRESH_PROFILE);

  var context = await chromium.launchPersistentContext(FRESH_PROFILE, {
    headless: false, channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });

  var page = await context.newPage();

  // First visit to get a fresh cookie
  await page.goto('https://www.agoda.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  var initCookies = await context.cookies('https://www.agoda.com');
  var initVer = initCookies.find(function(c) { return c.name === 'agoda.version.03'; });
  console.log('  Initial cookie: ' + (initVer ? initVer.value : 'none'));
  console.log('  Initial URL: ' + page.url() + '\n');

  var testLangs = [
    'en-us', 'ko-kr', 'ja-jp', 'zh-cn', 'zh-tw', 'zh-hk',
    'th-th', 'fr-fr', 'de-de', 'es-es', 'ru-ru', 'vi-vn',
    'id-id', 'ms-my',
  ];

  for (var i = 0; i < testLangs.length; i++) {
    var lang = testLangs[i];
    try {
      var cookies = await context.cookies('https://www.agoda.com');
      var ver = cookies.find(function(c) { return c.name === 'agoda.version.03'; });
      var cookieId = 'test';
      if (ver) {
        var m = ver.value.match(/CookieId=([^&]+)/);
        if (m) cookieId = m[1];
      }

      // Set cookie with DLang only (no CuLang)
      await context.addCookies([{
        name: 'agoda.version.03',
        value: 'CookieId=' + cookieId + '&DLang=' + lang + '&CurLabel=USD',
        domain: '.agoda.com',
        path: '/',
      }]);

      await page.goto('https://www.agoda.com/' + lang + '/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);

      var url = page.url();
      var langMatch = url.match(/\/([a-z]{2}-[a-z]{2})\//);
      var urlLang = langMatch ? langMatch[1] : 'unknown';

      var afterCookies = await context.cookies('https://www.agoda.com');
      var afterVer = afterCookies.find(function(c) { return c.name === 'agoda.version.03'; });
      var dLang = 'unknown';
      var cuLang = '?';
      if (afterVer) {
        var dMatch = afterVer.value.match(/DLang=([a-z]{2}-[a-z]{2})/i);
        if (dMatch) dLang = dMatch[1];
        var clMatch = afterVer.value.match(/CuLang=(\d+)/);
        if (clMatch) cuLang = clMatch[1];
      }

      var ok = urlLang === lang ? 'OK' : 'MISS';
      console.log('  ' + lang + ' -> URL: ' + urlLang + ', DLang: ' + dLang + ', CuLang: ' + cuLang + ' [' + ok + ']');
    } catch (err) {
      console.log('  ' + lang + ' -> ERROR: ' + err.message.substring(0, 60));
    }
  }

  await context.close();
}

main();
