import { chromium } from 'playwright';
import path from 'path';
var PROFILE_DIR = path.join(import.meta.dirname, 'profiles', 'agoda');
async function main() {
  var context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false, channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  var page = await context.newPage();
  // First reset to a known good CuCur to recover from errors
  var cookies = await context.cookies('https://www.agoda.com');
  var ver = cookies.find(function(c) { return c.name === 'agoda.version.03'; });
  if (ver) {
    var val = ver.value.replace(/CuCur=\d+/, 'CuCur=1');
    await context.addCookies([{ name: 'agoda.version.03', value: val, domain: ver.domain, path: ver.path || '/' }]);
  }
  await page.goto('https://www.agoda.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Now try sparse IDs in higher ranges
  var tryIds = [116, 117, 118, 119, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200];
  for (var i = 0; i < tryIds.length; i++) {
    var id = tryIds[i];
    try {
      cookies = await context.cookies('https://www.agoda.com');
      ver = cookies.find(function(c) { return c.name === 'agoda.version.03'; });
      if (ver) {
        val = ver.value.replace(/CuCur=\d+/, 'CuCur=' + id);
        await context.addCookies([{ name: 'agoda.version.03', value: val, domain: ver.domain, path: ver.path || '/' }]);
      }
      await page.goto('https://www.agoda.com/', { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(1500);
      var after = await context.cookies('https://www.agoda.com');
      var aVer = after.find(function(c) { return c.name === 'agoda.version.03'; });
      if (aVer) {
        var m = aVer.value.match(/CurLabel=([A-Z]{3})/i);
        if (m) console.log('  CuCur=' + id + ' -> ' + m[1]);
        else console.log('  CuCur=' + id + ' -> no label');
      }
    } catch (err) {
      console.log('  CuCur=' + id + ' -> ERROR');
      // Reset to good state
      cookies = await context.cookies('https://www.agoda.com');
      ver = cookies.find(function(c) { return c.name === 'agoda.version.03'; });
      if (ver) {
        val = ver.value.replace(/CuCur=\d+/, 'CuCur=1');
        await context.addCookies([{ name: 'agoda.version.03', value: val, domain: ver.domain, path: ver.path || '/' }]);
      }
      await page.goto('https://www.agoda.com/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
    }
  }
  await context.close();
}
main();
