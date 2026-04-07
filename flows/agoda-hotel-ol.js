/**
 * Agoda — OL (desktop web) — Hotel booking flow (automated)
 *
 * Steps:
 *   1. Home page
 *   2. Search for destination
 *   3. Search results
 *   4. Hotel detail (opens in new tab)
 *   5. Room selection
 *   6. Checkout
 */

import { BaseFlow } from './base.js';
import { setAgodaLocale } from './agoda-locale-setup.js';

var AGODA_LOCALES = {
  'ko-kr': 'ko-kr', 'en-us': 'en-us', 'zh-cn': 'zh-cn', 'zh-tw': 'zh-tw',
  'zh-hk': 'zh-hk', 'ja': 'ja-jp', 'th': 'th-th', 'vi': 'vi-vn',
  'ms': 'ms-my', 'id': 'id-id', 'de': 'de-de', 'fr': 'fr-fr',
  'es': 'es-es', 'ru': 'ru-ru',
};

var AGODA_LANG_IDS = {
  'ko-kr': 9, 'en-us': 1, 'zh-cn': 2, 'zh-tw': 3,
  'zh-hk': 4, 'ja-jp': 6, 'th-th': 5, 'vi-vn': 18, 'ms-my': 19,
  'id-id': 16, 'de-de': 7, 'fr-fr': 8, 'es-es': 10, 'ru-ru': 14,
};

export class AgodaHotelOL extends BaseFlow {
  constructor() {
    super({
      ota: 'agoda',
      platform: 'ol',
      flowType: 'hotel',
    });
  }

  /**
   * Dismiss popups, overlays, cookie banners, etc.
   */
  async dismissPopups(page) {
    var selectors = [
      // Cookie consent
      '[data-selenium="cookie-consent-accept"]',
      'button[data-element-name="cookie-consent-accept"]',
      // Generic close buttons
      '[data-selenium="close-button"]',
      'button[aria-label="Close"]',
      'button[aria-label="close"]',
      // App download / promo popups
      '[class*="close-button"]',
      '[class*="CloseButton"]',
      '[class*="dismiss"]',
      // "Got it" / "OK" / "No thanks" buttons on overlays
      'button[data-selenium="dismiss"]',
      // Notification permission popup
      '[class*="notification"] button[class*="close"]',
    ];

    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = page.locator(selectors[i]).first();
        if (await el.isVisible({ timeout: 300 })) {
          await el.click();
          await page.waitForTimeout(300);
        }
      } catch (e) {
        // Not present, move on
      }
    }

    // Also remove fixed overlays and Chrome's translate bar via JS
    await page.evaluate(function() {
      // Remove the audit banner if present
      var banner = document.getElementById('ux-audit-banner');
      if (banner) banner.remove();

      // Remove Google Translate bar
      var translateBar = document.querySelector('.goog-te-banner-frame, #goog-gt-tt, .skiptranslate');
      if (translateBar) translateBar.remove();

      // Restore body position if translate bar shifted it
      document.body.style.top = '';
      document.body.style.position = '';

      // Remove common overlay elements
      document.querySelectorAll('[class*="overlay"], [class*="modal"], [class*="popup"]').forEach(function(el) {
        var style = window.getComputedStyle(el);
        if (style.position === 'fixed' && parseInt(style.zIndex) > 1000) {
          el.remove();
        }
      });
    });
  }

  /**
   * Set up locale URL rewriting for all navigation requests.
   */
  async setupLocaleRewriting(context, locale, langId) {
    var allLocales = Object.values(AGODA_LOCALES);

    await context.route('**/*', function(route) {
      var request = route.request();
      if (request.resourceType() !== 'document') {
        return route.continue();
      }
      var url = request.url();
      if (url.indexOf('agoda.com') === -1) {
        return route.continue();
      }

      var original = url;

      // Replace any existing locale in URL path segments
      for (var i = 0; i < allLocales.length; i++) {
        if (allLocales[i] === locale) continue;
        url = url.split('/' + allLocales[i] + '/').join('/' + locale + '/');
      }

      // Replace locale params with regex
      url = url.replace(/locale=[a-z]{2}-[a-z]{2}/g, 'locale=' + locale);
      url = url.replace(/htmlLanguage=[a-z]{2}-[a-z]{2}/g, 'htmlLanguage=' + locale);
      url = url.replace(/cultureInfoName=[a-z]{2}-[a-z]{2}/g, 'cultureInfoName=' + locale);
      url = url.replace(/languageId=\d+/g, 'languageId=' + langId);
      url = url.replace(/realLanguageId=\d+/g, 'realLanguageId=' + langId);

      if (url !== original) {
        console.log('  [rewrite] ' + url.substring(0, 120));
      }
      return route.continue({ url: url });
    });
  }

  async executeSteps(page, params, context) {
    var language = params.language || 'ko-kr';
    var currency = params.currency || 'KRW';
    var destination = params.destination || 'Seoul';
    var checkIn = params.checkIn || '';
    var checkOut = params.checkOut || '';
    var locale = AGODA_LOCALES[language] || language;
    var langId = AGODA_LANG_IDS[locale] || 9;

    console.log('  Locale: ' + locale + ', langId: ' + langId);
    console.log('  Destination: ' + destination);

    // Set up locale rewriting
    await this.setupLocaleRewriting(context, locale, langId);
    console.log('  URL rewriting ready');

    // ========== PRE-STEP: Set language & currency on Agoda ==========
    console.log('');
    console.log('  --- Pre-step: Setting language & currency ---');
    var self = this;
    await setAgodaLocale(page, locale, currency, function(p) { return self.dismissPopups(p); });

    // ========== STEP 1: HOME PAGE ==========
    console.log('');
    console.log('  --- Step 1: Home page ---');
    var startUrl = 'https://www.agoda.com/' + locale + '/?currency=' + currency;
    await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await this.dismissPopups(page);
    await this.capture(page, 'home', 'Home page');

    // ========== STEP 2: SEARCH ==========
    console.log('');
    console.log('  --- Step 2: Search for ' + destination + ' ---');

    // Dump visible inputs on the page so we can see what selectors to use
    var inputInfo = await page.evaluate(function() {
      var inputs = document.querySelectorAll('input[type="text"], input:not([type]), input[type="search"]');
      var results = [];
      for (var i = 0; i < Math.min(inputs.length, 10); i++) {
        var el = inputs[i];
        var rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          results.push({
            tag: el.tagName,
            id: el.id,
            name: el.name,
            placeholder: el.placeholder,
            dataSelenium: el.getAttribute('data-selenium'),
            dataElementName: el.getAttribute('data-element-name'),
            className: el.className.substring(0, 80),
            ariaLabel: el.getAttribute('aria-label'),
          });
        }
      }
      return results;
    });
    console.log('  Visible text inputs:');
    for (var ii = 0; ii < inputInfo.length; ii++) {
      console.log('    ' + JSON.stringify(inputInfo[ii]));
    }

    // Try multiple selectors to find the search input
    var searchSelectors = [
      'input[data-selenium="textInput"]',
      'input[data-element-name="search-box-destination"]',
      'input[aria-label*="destination"]',
      'input[aria-label*="Destination"]',
      'input[placeholder*="destination"]',
      'input[placeholder*="city"]',
      'input[placeholder*="hotel"]',
      'input[placeholder*="숙소"]',
      'input[placeholder*="목적지"]',
      'input[placeholder*="도시"]',
      '#SearchBoxContainer input[type="text"]',
      'input[class*="SearchBox"]',
      'input[class*="searchbox"]',
    ];

    var searchInput = null;
    for (var si = 0; si < searchSelectors.length; si++) {
      var candidate = page.locator(searchSelectors[si]).first();
      try {
        if (await candidate.isVisible({ timeout: 500 })) {
          searchInput = candidate;
          console.log('  Found search input with: ' + searchSelectors[si]);
          break;
        }
      } catch (e) {}
    }

    if (!searchInput) {
      console.log('  [!] Could not find search input. Trying keyboard approach...');
      // Try clicking the search box area and typing
      var searchArea = page.locator('[class*="SearchBox"], [class*="searchbox"], [id*="SearchBox"], [id*="searchbox"]').first();
      if (await searchArea.isVisible({ timeout: 2000 })) {
        await searchArea.click();
        await page.waitForTimeout(1000);
        await page.keyboard.type(destination, { delay: 100 });
      } else {
        console.log('  [!] Could not find any search area. Skipping to step 3 via URL.');
      }
    } else {
      await searchInput.click();
      await page.waitForTimeout(500);
      await searchInput.fill('');
      await page.waitForTimeout(300);
      await page.keyboard.type(destination, { delay: 100 });
    }

    await page.waitForTimeout(2000);

    // Pick first suggestion from autosuggest dropdown
    var suggestSelectors = [
      '[data-selenium="autosuggest-item"]',
      '[data-element-name="autosuggest-item"]',
      '[class*="AutoSuggest"] li',
      '[class*="autosuggest"] li',
      '[class*="Suggestion"] li',
      '[role="listbox"] [role="option"]',
      '[class*="SearchSuggestion"]',
    ];

    var picked = false;
    for (var ssi = 0; ssi < suggestSelectors.length; ssi++) {
      var sug = page.locator(suggestSelectors[ssi]).first();
      try {
        if (await sug.isVisible({ timeout: 1000 })) {
          await sug.click();
          console.log('  Picked suggestion with: ' + suggestSelectors[ssi]);
          picked = true;
          break;
        }
      } catch (e) {}
    }

    if (!picked) {
      console.log('  [!] No suggestion found. Pressing Enter.');
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(1000);

    // Set dates if provided
    if (checkIn) {
      await this.setDates(page, checkIn, checkOut);
    }

    // Click search button
    var btnSelectors = [
      '[data-selenium="searchButton"]',
      '[data-element-name="search-button"]',
      'button[type="submit"]',
      'button[class*="searchButton"]',
      'button[class*="SearchButton"]',
    ];

    for (var bi = 0; bi < btnSelectors.length; bi++) {
      var btn = page.locator(btnSelectors[bi]).first();
      try {
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click();
          console.log('  Clicked search button with: ' + btnSelectors[bi]);
          break;
        }
      } catch (e) {}
    }

    // Wait for search results to load
    await page.waitForTimeout(6000);
    await this.dismissPopups(page);

    // ========== STEP 3: SEARCH RESULTS ==========
    console.log('');
    console.log('  --- Step 3: Search results ---');

    // The search results page may have opened in a new tab
    var allPages = context.pages();
    var resultsPage = page;
    if (allPages.length > 1) {
      // Use the last opened tab
      resultsPage = allPages[allPages.length - 1];
      if (resultsPage !== page) {
        console.log('  Search results in new tab');
        await resultsPage.waitForLoadState('domcontentloaded');
        page = resultsPage;
      }
    }

    // Dump property card info for debugging
    var cardInfo = await page.evaluate(function() {
      // Look for any element that looks like a hotel listing
      var selectors = [
        '[data-selenium="hotel-item"]',
        '[data-element-name="property-card"]',
        '[class*="PropertyCard"]',
        '[class*="property-card"]',
        'a[href*="/hotel/"]',
        'ol > li a[href*="/"]',
      ];
      var found = {};
      for (var i = 0; i < selectors.length; i++) {
        var els = document.querySelectorAll(selectors[i]);
        if (els.length > 0) {
          found[selectors[i]] = els.length;
        }
      }
      return found;
    });
    console.log('  Property card selectors found: ' + JSON.stringify(cardInfo));

    await page.waitForTimeout(2000);
    await this.dismissPopups(page);
    await this.capture(page, 'search-results', 'Search results for ' + destination);

    // ========== STEP 4: HOTEL DETAIL ==========
    console.log('');
    console.log('  --- Step 4: Hotel detail ---');

    // Find the first clickable hotel link using dynamic detection
    var hotelLinkSelectors = [
      '[data-selenium="hotel-item"] a',
      '[data-element-name="property-card"] a',
      '[class*="PropertyCard"] a[href*="/hotel/"]',
      '[class*="property-card"] a[href*="/hotel/"]',
      'a[href*="/hotel/"][href*="agoda"]',
    ];

    var hotelLink = null;
    for (var hli = 0; hli < hotelLinkSelectors.length; hli++) {
      var hl = page.locator(hotelLinkSelectors[hli]).first();
      try {
        if (await hl.isVisible({ timeout: 1000 })) {
          hotelLink = hl;
          console.log('  Found hotel link with: ' + hotelLinkSelectors[hli]);
          break;
        }
      } catch (e) {}
    }

    // Fallback: find any link that goes to a hotel page
    if (!hotelLink) {
      console.log('  Trying fallback: any hotel link');
      var fallbackLink = page.locator('a[href*="/hotel/"]').first();
      if (await fallbackLink.isVisible({ timeout: 2000 })) {
        hotelLink = fallbackLink;
        console.log('  Found fallback hotel link');
      }
    }

    if (!hotelLink) {
      console.log('  [!] Could not find any hotel link. Skipping to end.');
    } else {
      // Listen for new tab before clicking
      var newTabPromise = context.waitForEvent('page');
      await hotelLink.click();

      var detailPage = null;
      try {
        detailPage = await Promise.race([
          newTabPromise,
          new Promise(function(resolve) { setTimeout(function() { resolve(null); }, 5000); }),
        ]);
      } catch (e) {}

      if (detailPage) {
        console.log('  Hotel detail opened in new tab');
        await detailPage.waitForLoadState('domcontentloaded');
        await detailPage.waitForTimeout(4000);

        // Close all other tabs to prevent confusion later
        var otherPages = context.pages();
        for (var cp = 0; cp < otherPages.length; cp++) {
          if (otherPages[cp] !== detailPage) {
            try { await otherPages[cp].close(); } catch (e) {}
          }
        }
        console.log('  Closed other tabs. Only hotel detail tab remains.');

        await this.dismissPopups(detailPage);
        await this.capture(detailPage, 'hotel-detail', 'Hotel detail page');
        page = detailPage;
      } else {
        await page.waitForTimeout(4000);
        await this.dismissPopups(page);
        await this.capture(page, 'hotel-detail', 'Hotel detail page');
      }
    }

    // ========== STEP 5: ROOM LIST ==========
    console.log('');
    console.log('  --- Step 5: Room list ---');

    // Scroll down to find the room list section
    var roomSectionSelectors = [
      '#roomSection',
      '[data-selenium="RoomSection"]',
      '[id*="RoomSection"]',
      '[id*="roomSection"]',
      '[class*="RoomList"]',
      '[class*="room-list"]',
      '[class*="RoomGrid"]',
      '[data-element-name="room-section"]',
      '#room-section',
    ];

    var foundRoomSection = false;
    for (var ri = 0; ri < roomSectionSelectors.length; ri++) {
      var rs = page.locator(roomSectionSelectors[ri]).first();
      try {
        if (await rs.isVisible({ timeout: 1000 })) {
          await rs.scrollIntoViewIfNeeded();
          console.log('  Found room section with: ' + roomSectionSelectors[ri]);
          foundRoomSection = true;
          break;
        }
      } catch (e) {}
    }

    if (!foundRoomSection) {
      console.log('  Room section not found by selector, scrolling down...');
      for (var scrollStep = 0; scrollStep < 10; scrollStep++) {
        await page.evaluate(function(step) {
          window.scrollTo(0, (step + 1) * window.innerHeight);
        }, scrollStep);
        await page.waitForTimeout(800);
      }
    }

    await page.waitForTimeout(2000);
    await this.dismissPopups(page);
    await this.capture(page, 'room-list', 'Room list');

    // ========== STEP 6: SELECT ROOM -> FILL-IN PAGE ==========
    console.log('');
    console.log('  --- Step 6: Select room -> Fill-in page ---');

    // Scroll back to room section
    await page.evaluate(function() {
      var selectors = ['#roomSection', '[id*="RoomSection"]', '[id*="roomSection"]',
        '[class*="RoomList"]', '[class*="RoomGrid"]'];
      for (var i = 0; i < selectors.length; i++) {
        var el = document.querySelector(selectors[i]);
        if (el) { el.scrollIntoView({ block: 'start' }); return; }
      }
      window.scrollTo(0, document.body.scrollHeight * 0.4);
    });
    await page.waitForTimeout(2000);

    // We know from logs the button is: data-element-name="mob-room-tile-book-now"
    // Use Playwright locator (not page.evaluate click) so navigation is tracked
    var bookBtnSelectors = [
      '[data-element-name="mob-room-tile-book-now"]',
      'button[data-selenium*="BookButton"]',
      'button[data-selenium*="bookButton"]',
      'button[data-element-name*="book"]',
    ];

    var bookBtn = null;
    for (var bbs = 0; bbs < bookBtnSelectors.length; bbs++) {
      var bb = page.locator(bookBtnSelectors[bbs]).first();
      try {
        await bb.scrollIntoViewIfNeeded({ timeout: 2000 });
        if (await bb.isVisible({ timeout: 1000 })) {
          bookBtn = bb;
          console.log('  Found book button with: ' + bookBtnSelectors[bbs]);
          break;
        }
      } catch (e) {}
    }

    // Fallback: broader Korean text search
    if (!bookBtn) {
      var fallbackSelectors = [
        'button:has-text("예약하기")',
        'button:has-text("예약")',
        'button:has-text("Book")',
      ];
      for (var fbs = 0; fbs < fallbackSelectors.length; fbs++) {
        var fb = page.locator(fallbackSelectors[fbs]).first();
        try {
          if (await fb.isVisible({ timeout: 1000 })) {
            bookBtn = fb;
            console.log('  Found book button with fallback: ' + fallbackSelectors[fbs]);
            break;
          }
        } catch (e) {}
      }
    }

    if (bookBtn) {
      // Record current URL and tab count before clicking
      var urlBefore = page.url();
      var tabCountBefore = context.pages().length;
      console.log('  Tabs before click: ' + tabCountBefore);
      console.log('  URL before click: ' + urlBefore.substring(0, 80));

      // Set up new tab listener BEFORE clicking
      var newPagePromise = context.waitForEvent('page', { timeout: 8000 }).catch(function() { return null; });

      await bookBtn.click();
      console.log('  Clicked book button');

      // Wait for either new tab or URL change
      var newPage = await newPagePromise;

      if (newPage) {
        console.log('  New tab opened after book click');
        await newPage.waitForLoadState('domcontentloaded');
        await newPage.waitForTimeout(3000);

        // Check: is this a booking/fill-in page or a duplicate hotel page?
        var newUrl = newPage.url();
        console.log('  New tab URL: ' + newUrl.substring(0, 100));

        // If current page navigated (URL changed), that's our fill-in page
        var currentUrl = page.url();
        if (currentUrl !== urlBefore) {
          console.log('  Original tab navigated to: ' + currentUrl.substring(0, 100));
          // Original tab changed -> that's the fill-in page, close the new tab
          try { await newPage.close(); } catch (e) {}
          console.log('  Using original tab (navigated)');
        } else {
          // Original tab didn't change -> the new tab is the fill-in page
          // Close the old tab
          try { await page.close(); } catch (e) {}
          page = newPage;
          console.log('  Using new tab');
        }
      } else {
        // No new tab -> page navigated in place
        console.log('  No new tab, waiting for navigation...');
        await page.waitForTimeout(5000);
        console.log('  Current URL: ' + page.url().substring(0, 100));
      }

      await page.waitForTimeout(2000);
      await this.dismissPopups(page);
      await this.capture(page, 'fill-in', 'Fill-in page (guest info)');
    } else {
      console.log('  [!] Could not find book button. Check audit.log for debug info.');
      // Dump what we can see for debugging
      var debugBtns = await page.evaluate(function() {
        var els = document.querySelectorAll('[data-element-name*="book"], [data-element-name*="room"]');
        var r = [];
        for (var i = 0; i < Math.min(els.length, 20); i++) {
          r.push({ den: els[i].getAttribute('data-element-name'), text: (els[i].textContent || '').trim().substring(0, 50) });
        }
        return r;
      });
      console.log('  Debug - elements with book/room in data-element-name:');
      for (var db = 0; db < debugBtns.length; db++) {
        console.log('    ' + JSON.stringify(debugBtns[db]));
      }
      await this.capture(page, 'fill-in', 'Fill-in page (button not found)');
    }

    // ========== STEP 7: FILL CONTACT INFO & PROCEED TO CHECKOUT ==========
    console.log('');
    console.log('  --- Step 7: Fill contact info -> Checkout ---');

    // Fill in dummy contact information on the fill-in page
    await page.evaluate(function() { window.scrollTo(0, 0); });
    await page.waitForTimeout(1000);

    // Dump form fields for debugging
    var formFields = await page.evaluate(function() {
      var inputs = document.querySelectorAll('input, select');
      var results = [];
      for (var i = 0; i < inputs.length; i++) {
        var el = inputs[i];
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        results.push({
          tag: el.tagName,
          type: el.type || '',
          name: el.name || '',
          id: el.id || '',
          placeholder: el.placeholder || '',
          ds: el.getAttribute('data-selenium') || '',
          den: el.getAttribute('data-element-name') || '',
          value: el.value || '',
          top: Math.round(rect.top),
        });
      }
      return results;
    });
    console.log('  Form fields found (' + formFields.length + '):');
    for (var ff = 0; ff < formFields.length; ff++) {
      console.log('    ' + JSON.stringify(formFields[ff]));
    }

    // Fill first name
    var firstNameSelectors = [
      'input[data-selenium="firstName"]',
      'input[data-element-name="first-name"]',
      'input[name*="firstName"]',
      'input[name*="first_name"]',
      'input[name*="FirstName"]',
      'input[id*="firstName"]',
      'input[id*="FirstName"]',
      'input[placeholder*="이름"]',
      'input[placeholder*="First"]',
      'input[placeholder*="first"]',
      'input[autocomplete="given-name"]',
    ];

    for (var fn = 0; fn < firstNameSelectors.length; fn++) {
      var fnInput = page.locator(firstNameSelectors[fn]).first();
      try {
        if (await fnInput.isVisible({ timeout: 500 })) {
          await fnInput.click();
          await fnInput.fill('Minjun');
          console.log('  Filled first name with: ' + firstNameSelectors[fn]);
          break;
        }
      } catch (e) {}
    }

    // Fill last name
    var lastNameSelectors = [
      'input[data-selenium="lastName"]',
      'input[data-element-name="last-name"]',
      'input[name*="lastName"]',
      'input[name*="last_name"]',
      'input[name*="LastName"]',
      'input[id*="lastName"]',
      'input[id*="LastName"]',
      'input[placeholder*="성"]',
      'input[placeholder*="Last"]',
      'input[placeholder*="last"]',
      'input[autocomplete="family-name"]',
    ];

    for (var ln = 0; ln < lastNameSelectors.length; ln++) {
      var lnInput = page.locator(lastNameSelectors[ln]).first();
      try {
        if (await lnInput.isVisible({ timeout: 500 })) {
          await lnInput.click();
          await lnInput.fill('Kim');
          console.log('  Filled last name with: ' + lastNameSelectors[ln]);
          break;
        }
      } catch (e) {}
    }

    // Fill email
    var emailSelectors = [
      'input[data-selenium="email"]',
      'input[data-element-name="email"]',
      'input[type="email"]',
      'input[name*="email"]',
      'input[name*="Email"]',
      'input[id*="email"]',
      'input[placeholder*="이메일"]',
      'input[placeholder*="email"]',
      'input[placeholder*="Email"]',
      'input[autocomplete="email"]',
    ];

    for (var em = 0; em < emailSelectors.length; em++) {
      var emInput = page.locator(emailSelectors[em]).first();
      try {
        if (await emInput.isVisible({ timeout: 500 })) {
          await emInput.click();
          await emInput.fill('minjun.kim@example.com');
          console.log('  Filled email with: ' + emailSelectors[em]);
          break;
        }
      } catch (e) {}
    }

    // Fill phone number
    var phoneSelectors = [
      'input[data-selenium="phone"]',
      'input[data-selenium="phoneNumber"]',
      'input[data-element-name="phone"]',
      'input[data-element-name="phone-number"]',
      'input[type="tel"]',
      'input[name*="phone"]',
      'input[name*="Phone"]',
      'input[name*="mobile"]',
      'input[id*="phone"]',
      'input[id*="Phone"]',
      'input[placeholder*="전화"]',
      'input[placeholder*="휴대"]',
      'input[placeholder*="phone"]',
      'input[placeholder*="Phone"]',
      'input[autocomplete="tel"]',
    ];

    for (var ph = 0; ph < phoneSelectors.length; ph++) {
      var phInput = page.locator(phoneSelectors[ph]).first();
      try {
        if (await phInput.isVisible({ timeout: 500 })) {
          await phInput.click();
          await phInput.fill('01012345678');
          console.log('  Filled phone with: ' + phoneSelectors[ph]);
          break;
        }
      } catch (e) {}
    }

    // Fill confirm email if present
    var confirmEmailSelectors = [
      'input[data-selenium="confirmEmail"]',
      'input[data-element-name="confirm-email"]',
      'input[name*="confirmEmail"]',
      'input[name*="confirm_email"]',
      'input[name*="reEmail"]',
      'input[placeholder*="확인"]',
      'input[placeholder*="confirm"]',
      'input[placeholder*="Confirm"]',
      'input[placeholder*="Re-enter"]',
    ];

    for (var ce = 0; ce < confirmEmailSelectors.length; ce++) {
      var ceInput = page.locator(confirmEmailSelectors[ce]).first();
      try {
        if (await ceInput.isVisible({ timeout: 500 })) {
          await ceInput.click();
          await ceInput.fill('minjun.kim@example.com');
          console.log('  Filled confirm email with: ' + confirmEmailSelectors[ce]);
          break;
        }
      } catch (e) {}
    }

    await page.waitForTimeout(1000);

    // Check only T&C / consent checkboxes (not special requests)
    console.log('  Checking consent checkboxes...');
    var checkedCount = await page.evaluate(function() {
      var count = 0;
      // Only check consent-related checkboxes
      var checkboxes = document.querySelectorAll('input[type="checkbox"]');
      for (var i = 0; i < checkboxes.length; i++) {
        var name = checkboxes[i].name || '';
        // Only check consent checkboxes, skip special requests
        if (name.indexOf('consent') >= 0 || name.indexOf('Consent') >= 0 ||
            name.indexOf('agree') >= 0 || name.indexOf('Agree') >= 0 ||
            name.indexOf('terms') >= 0 || name.indexOf('Terms') >= 0) {
          if (!checkboxes[i].checked) {
            checkboxes[i].click();
            count++;
          }
        }
      }
      return count;
    });
    console.log('  Checked ' + checkedCount + ' consent checkbox(es)');

    await page.waitForTimeout(1000);
    console.log('  Contact info filled, T&C accepted');

    // Now click the proceed/checkout/payment button
    var checkoutBtnSelectors = [
      'button[data-selenium*="proceed"]',
      'button[data-selenium*="Proceed"]',
      'button[data-element-name*="proceed"]',
      'button[data-element-name*="payment"]',
      'button[data-element-name*="checkout"]',
      'button[data-selenium*="checkout"]',
      'button[data-selenium*="submit"]',
      'button:has-text("결제 단계로")',
      'button:has-text("결제")',
      'button:has-text("진행")',
      'button:has-text("다음")',
      'button:has-text("예약")',
      'button:has-text("Proceed")',
      'button:has-text("Continue")',
      'button:has-text("Checkout")',
      'button:has-text("Pay")',
      'button:has-text("Book")',
      'input[type="submit"]',
    ];

    // Also dump all visible buttons for debugging
    var allBtns = await page.evaluate(function() {
      var btns = document.querySelectorAll('button, input[type="submit"]');
      var r = [];
      for (var i = 0; i < btns.length; i++) {
        var el = btns[i];
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        var text = (el.textContent || el.value || '').trim().replace(/\s+/g, ' ').substring(0, 80);
        if (text.length > 0) {
          r.push({
            text: text,
            ds: el.getAttribute('data-selenium') || '',
            den: el.getAttribute('data-element-name') || '',
            top: Math.round(rect.top),
          });
        }
      }
      return r;
    });
    console.log('  All visible buttons:');
    for (var ab = 0; ab < allBtns.length; ab++) {
      console.log('    ' + JSON.stringify(allBtns[ab]));
    }

    var checkoutBtn = null;
    for (var cbs = 0; cbs < checkoutBtnSelectors.length; cbs++) {
      var cb = page.locator(checkoutBtnSelectors[cbs]).first();
      try {
        if (await cb.isVisible({ timeout: 500 })) {
          checkoutBtn = cb;
          console.log('  Found checkout button with: ' + checkoutBtnSelectors[cbs]);
          break;
        }
      } catch (e) {}
    }

    if (checkoutBtn) {
      var urlBeforeCheckout = page.url();
      var newPagePromise2 = context.waitForEvent('page', { timeout: 8000 }).catch(function() { return null; });

      await checkoutBtn.click();
      console.log('  Clicked checkout button');

      var newPage2 = await newPagePromise2;
      if (newPage2) {
        console.log('  Checkout opened in new tab');
        await newPage2.waitForLoadState('domcontentloaded');
        try { await page.close(); } catch (e) {}
        page = newPage2;
      } else {
        // Wait for navigation in same tab
        await page.waitForTimeout(5000);
        var urlAfterCheckout = page.url();
        console.log('  URL after checkout click: ' + urlAfterCheckout.substring(0, 100));
      }

      await page.waitForTimeout(2000);
      await this.dismissPopups(page);

      // Handle Agoda error modal on payment page (anti-bot detection)
      // Look for "새로고침하기" (Refresh) or similar error modal buttons
      var dismissedError = await page.evaluate(function() {
        // Find buttons with refresh/retry text
        var buttons = document.querySelectorAll('button, a');
        for (var i = 0; i < buttons.length; i++) {
          var text = (buttons[i].textContent || '').trim();
          if (text.indexOf('새로고침') >= 0 || text.indexOf('다시 시도') >= 0 ||
              text.indexOf('Refresh') >= 0 || text.indexOf('Try again') >= 0 ||
              text.indexOf('Retry') >= 0) {
            buttons[i].click();
            return 'clicked: ' + text;
          }
        }
        // Also try closing via X button on modal
        var closeButtons = document.querySelectorAll('[class*="modal"] button[class*="close"], [class*="Modal"] button[class*="close"], [class*="dialog"] button[class*="close"]');
        for (var j = 0; j < closeButtons.length; j++) {
          closeButtons[j].click();
          return 'closed modal';
        }
        return null;
      });

      if (dismissedError) {
        console.log('  Dismissed error modal: ' + dismissedError);
        await page.waitForTimeout(5000);
        await this.dismissPopups(page);
      }

      await this.capture(page, 'checkout', 'Checkout / payment page');
    } else {
      console.log('  [!] Could not find checkout button. Capturing current page.');
      await this.capture(page, 'checkout', 'Checkout (button not found)');
    }

    console.log('');
    console.log('  All steps complete!');

    // Close all pages to signal completion
    var allPages = context.pages();
    for (var i = 0; i < allPages.length; i++) {
      try { await allPages[i].close(); } catch (e) {}
    }
  }

  async setDates(page, checkIn, checkOut) {
    try {
      // Click the date input to open calendar
      var dateInput = page.locator('[data-selenium="datePickerMonthDateInput"], [data-element-name="check-in-box"]').first();
      if (await dateInput.isVisible({ timeout: 2000 })) {
        await dateInput.click();
        await page.waitForTimeout(1000);

        // Try to select dates by data attribute
        var checkInEl = page.locator('[data-selenium="calendar-day-' + checkIn + '"]').first();
        if (await checkInEl.isVisible({ timeout: 2000 })) {
          await checkInEl.click();
          await page.waitForTimeout(500);
        }
        if (checkOut) {
          var checkOutEl = page.locator('[data-selenium="calendar-day-' + checkOut + '"]').first();
          if (await checkOutEl.isVisible({ timeout: 2000 })) {
            await checkOutEl.click();
          }
        }
      }
    } catch (e) {
      console.log('  [!] Could not set dates: ' + e.message);
    }
  }
}
