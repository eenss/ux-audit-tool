/**
 * Set language/currency — opens Chrome with your saved profile
 * so you can change language and currency on the OTA site.
 *
 * Usage: node set-locale.js <ota>
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

var OTA_URLS = {
  agoda: 'https://www.agoda.com',
  bcom: 'https://www.booking.com',
  expedia: 'https://www.expedia.com',
  trip: 'https://www.trip.com',
};

var ota = process.argv[2] ? process.argv[2].toLowerCase() : null;

if (!ota || !OTA_URLS[ota]) {
  console.log('Usage: node set-locale.js <ota>');
  console.log('Available OTAs: ' + Object.keys(OTA_URLS).join(', '));
  process.exit(1);
}

var profileDir = path.resolve(import.meta.dirname, 'profiles', ota);
if (!fs.existsSync(path.join(profileDir, 'Default'))) {
  console.log('No profile found for ' + ota + '. Run login first: node login.js ' + ota);
  process.exit(1);
}

console.log('');
console.log('Opening ' + ota + ' in Chrome...');
console.log('Change the language and currency to your preference.');
console.log('When done, come back here and press ENTER.');
console.log('');

var context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chrome',
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
});

var pages = context.pages();
var page = pages.length > 0 ? pages[0] : await context.newPage();
await page.goto(OTA_URLS[ota]);

var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await new Promise(function(resolve) {
  rl.question('Press ENTER when done... ', resolve);
});
rl.close();

await context.close();
console.log('Language/currency settings saved!');
