/**
 * Agoda automated language & currency setup.
 *
 * Agoda stores locale in the cookie `agoda.version.03`. The format varies:
 *   Fresh:    CookieId=<uuid>&DLang=en-us&CurLabel=KRW
 *   Legacy:   CookieId=<uuid>&DLang=fr-fr&CurLabel=EUR&CuLang=2&CuCur=1
 *
 * When CuCur is present, Agoda uses it to determine the actual currency
 * (ignoring CurLabel). The safest approach is to delete the old cookie
 * and let Agoda regenerate a fresh one, then modify DLang and CurLabel.
 *
 * CuCur numeric IDs (discovered empirically):
 *   EUR=1, GBP=2, HKD=3, MYR=4, SGD=5, THB=6, USD=7, NZD=8, AUD=9,
 *   JPY=11, ZAR=12, CAD=13, AED=14, CNY=15, PHP=18, CHF=19, DKK=20,
 *   SEK=21, CZK=22, PLN=23, BRL=24, IDR=25, KRW=26, INR=27, TWD=28,
 *   VND=78
 */

var LANG_IDS = {
  'ko-kr': 9, 'en-us': 1, 'zh-cn': 2, 'zh-tw': 3,
  'zh-hk': 4, 'ja-jp': 6, 'th-th': 5, 'vi-vn': 18, 'ms-my': 19,
  'id-id': 16, 'de-de': 7, 'fr-fr': 8, 'es-es': 10, 'ru-ru': 14,
};

var CURRENCY_IDS = {
  'EUR': 1,  'GBP': 2,  'HKD': 3,  'MYR': 4,  'SGD': 5,  'THB': 6,
  'USD': 7,  'NZD': 8,  'AUD': 9,  'JPY': 11, 'ZAR': 12, 'CAD': 13,
  'AED': 14, 'CNY': 15, 'PHP': 18, 'CHF': 19, 'IDR': 25, 'KRW': 26,
  'INR': 27, 'TWD': 28, 'VND': 78, 'RUB': 29,
};

export async function setAgodaLocale(page, locale, currency, dismissPopups) {
  try {
    console.log('    Target: ' + locale + ' / ' + currency);
    var langId = LANG_IDS[locale] || 1;
    var curId = CURRENCY_IDS[currency] || null;
    var context = page.context();

    // Strategy: delete the version cookie entirely, then create a clean one.
    // This avoids the CuCur override issue from old cookies.
    var cookies = await context.cookies('https://www.agoda.com');
    var versionCookie = cookies.find(function(c) { return c.name === 'agoda.version.03'; });

    if (versionCookie) {
      console.log('    Old cookie: ' + versionCookie.value);

      // Extract the CookieId to preserve session identity
      var cookieIdMatch = versionCookie.value.match(/CookieId=([^&]+)/);
      var cookieId = cookieIdMatch ? cookieIdMatch[1] : 'ux-audit-tool';

      // Delete the old cookie by setting it expired
      await context.addCookies([{
        name: 'agoda.version.03',
        value: '',
        domain: versionCookie.domain || '.agoda.com',
        path: versionCookie.path || '/',
        expires: 0,
      }]);
    }

    // Build a clean cookie with only the fields we need
    var cookieId = (versionCookie && versionCookie.value.match(/CookieId=([^&]+)/))
      ? versionCookie.value.match(/CookieId=([^&]+)/)[1]
      : 'ux-audit-tool';

    // If we know the CuCur ID, include it; otherwise use the simple format
    var newVal = 'CookieId=' + cookieId + '&DLang=' + locale + '&CurLabel=' + currency;
    if (curId !== null) {
      newVal += '&CuLang=' + langId + '&CuCur=' + curId;
    }

    await context.addCookies([{
      name: 'agoda.version.03',
      value: newVal,
      domain: '.agoda.com',
      path: '/',
    }]);
    console.log('    New cookie: ' + newVal);

    // Navigate to verify
    await page.goto('https://www.agoda.com/' + locale + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    if (dismissPopups) await dismissPopups(page);

    // Verify
    var finalUrl = page.url();
    var langOk = finalUrl.indexOf('/' + locale) >= 0;
    console.log('    Final URL: ' + finalUrl.substring(0, 100));
    console.log('    Language match: ' + (langOk ? 'YES' : 'NO'));

    // Check the cookie after navigation
    var checkCookies = await context.cookies('https://www.agoda.com');
    var checkVer = checkCookies.find(function(c) { return c.name === 'agoda.version.03'; });
    if (checkVer) {
      var hasLang = checkVer.value.indexOf('DLang=' + locale) >= 0;
      var hasCur = checkVer.value.indexOf('CurLabel=' + currency) >= 0;
      console.log('    Cookie after nav: ' + checkVer.value);
      console.log('    DLang=' + (hasLang ? 'OK' : 'MISMATCH') + ', CurLabel=' + (hasCur ? 'OK' : 'MISMATCH'));

      // If currency still doesn't match, try one more time with a fresh delete+set+reload
      if (!hasCur) {
        console.log('    Currency mismatch. Retrying with fresh cookie...');

        // Delete again
        await context.addCookies([{
          name: 'agoda.version.03',
          value: '',
          domain: '.agoda.com',
          path: '/',
          expires: 0,
        }]);

        // Set the simple format (no CuCur/CuLang at all)
        var simpleVal = 'CookieId=' + cookieId + '&DLang=' + locale + '&CurLabel=' + currency;
        await context.addCookies([{
          name: 'agoda.version.03',
          value: simpleVal,
          domain: '.agoda.com',
          path: '/',
        }]);

        await page.goto('https://www.agoda.com/' + locale + '/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        if (dismissPopups) await dismissPopups(page);

        var recheck = await context.cookies('https://www.agoda.com');
        var recheckVer = recheck.find(function(c) { return c.name === 'agoda.version.03'; });
        if (recheckVer) {
          var hasCur2 = recheckVer.value.indexOf('CurLabel=' + currency) >= 0;
          console.log('    Retry cookie: ' + recheckVer.value);
          console.log('    Retry CurLabel=' + (hasCur2 ? 'OK' : 'STILL_MISMATCH'));
        }
      }
    }

    console.log('    Locale setup complete');

  } catch (err) {
    console.log('    [!] Locale setup error: ' + err.message.substring(0, 80));
    console.log('    Continuing with URL rewriting as fallback...');
  }
}
