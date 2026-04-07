/**
 * Login — opens system Chrome to log in to an OTA.
 *
 * Usage: node login.js <ota>
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
  console.log('Usage: node login.js <ota>');
  console.log('Available OTAs: ' + Object.keys(OTA_URLS).join(', '));
  process.exit(1);
}

var profileDir = path.resolve(import.meta.dirname, 'profiles', ota);
fs.mkdirSync(profileDir, { recursive: true });

console.log('');
console.log('Opening ' + ota + ' in Chrome...');
console.log('Please log in to your account.');
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
  rl.question('Press ENTER when logged in... ', resolve);
});
rl.close();

await context.close();
console.log('Login saved!');
