/**
 * Base class for booking flow capture (guided mode).
 * Uses system Chrome with a persistent profile for login state.
 * Locale is handled by URL rewriting in each flow subclass.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

export class BaseFlow {
  constructor(config) {
    this.ota = config.ota;
    this.platform = config.platform;
    this.flowType = config.flowType;
    this.viewport = config.viewport || (config.platform === 'h5'
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 });
    this.screenshots = [];
  }

  async capture(page, stepName, description) {
    try {
      await page.waitForTimeout(1500);

      // Remove sticky/fixed elements so they don't appear mid-screenshot
      await page.evaluate(function() {
        var all = document.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
          var style = window.getComputedStyle(all[i]);
          if (style.position === 'fixed' || style.position === 'sticky') {
            // Keep modals/lightboxes, only remove navbars/headers/footers/banners
            var tag = all[i].tagName.toLowerCase();
            var cls = (all[i].className || '').toString().toLowerCase();
            var role = (all[i].getAttribute('role') || '').toLowerCase();
            if (role === 'dialog' || cls.indexOf('modal') >= 0 || cls.indexOf('lightbox') >= 0) {
              continue;
            }
            all[i].style.position = 'absolute';
          }
        }
      });

      var dir = path.join(
        import.meta.dirname, '..', 'screenshots',
        this._userId || '_default', this.ota, this.platform, this.flowType
      );
      fs.mkdirSync(dir, { recursive: true });

      var stepNum = String(this.screenshots.length + 1).padStart(2, '0');
      var filename = stepNum + '_' + stepName + '.png';
      var filepath = path.join(dir, filename);

      await page.screenshot({ path: filepath, fullPage: true });

      var step = {
        step: this.screenshots.length + 1,
        name: stepName,
        description: description || '',
        filename: filename,
        filepath: filepath,
        url: page.url(),
      };
      this.screenshots.push(step);
      console.log('  [' + stepNum + '] ' + stepName + ': ' + page.url());
      return step;
    } catch (err) {
      console.error('  [capture error] ' + err.message);
    }
  }

  async run(params) {
    console.log('');
    console.log('=== Starting audit ===');
    console.log('OTA: ' + this.ota);
    console.log('Platform: ' + this.platform);
    console.log('Flow: ' + this.flowType);
    console.log('Params: ' + JSON.stringify(params));

    this._userId = params.userId || '_default';
    var userId = this._userId;
    var profileDir = path.resolve(
      import.meta.dirname, '..', 'profiles', userId, this.ota
    );
    fs.mkdirSync(profileDir, { recursive: true });
    console.log('Profile: ' + profileDir);

    var context;
    try {
      // Mark profile as cleanly exited to suppress "Chrome closed unexpectedly" popup
      var prefsPath = path.join(profileDir, 'Default', 'Preferences');
      try {
        if (fs.existsSync(prefsPath)) {
          var prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
          if (prefs.profile) prefs.profile.exit_type = 'Normal';
          if (prefs.profile) prefs.profile.exited_cleanly = true;
          fs.writeFileSync(prefsPath, JSON.stringify(prefs));
        }
      } catch (e) {}

      context = await chromium.launchPersistentContext(profileDir, {
        channel: 'chrome',
        headless: false,
        viewport: this.viewport,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-features=Translate',
          '--disable-translate',
          '--disable-session-crashed-bubble',
          '--disable-infobars',
        ],
      });
      console.log('Chrome launched with persistent profile');
    } catch (err) {
      console.error('Failed to launch Chrome: ' + err.message);
      console.error('Falling back to Playwright Chromium...');
      // Fallback: launch without persistent profile
      var browser = await chromium.launch({ headless: false });
      context = await browser.newContext({ viewport: this.viewport });
      context._fallbackBrowser = browser;
      console.log('Fallback browser launched (no login)');
    }

    var pages = context.pages();
    var page = pages.length > 0 ? pages[0] : await context.newPage();

    try {
      await this.executeSteps(page, params, context);

      var metaDir = path.join(
        import.meta.dirname, '..', 'screenshots',
        this._userId || '_default', this.ota, this.platform, this.flowType
      );
      fs.writeFileSync(
        path.join(metaDir, '_meta.json'),
        JSON.stringify({
          ota: this.ota,
          platform: this.platform,
          flowType: this.flowType,
          params: params,
          capturedAt: new Date().toISOString(),
          steps: this.screenshots,
        }, null, 2)
      );

      console.log('');
      console.log('Done! ' + this.screenshots.length + ' screenshots captured.');
      return {
        ota: this.ota,
        platform: this.platform,
        flowType: this.flowType,
        params: params,
        steps: this.screenshots,
      };
    } catch (err) {
      console.error('Flow error: ' + err.message);
      console.error(err.stack);
      throw err;
    } finally {
      await context.close();
      if (context._fallbackBrowser) {
        await context._fallbackBrowser.close();
      }
      console.log('Browser closed');
    }
  }
}
