/**
 * Agoda — OL (desktop web) — Flight booking flow (automated)
 *
 * Steps:
 *   1. Home page (flights tab)
 *   2. Search for flights
 *   3. Search results
 *   4. Flight detail (expanded card)
 *   5. Select flight -> Booking page
 *   6. Fill-in (passenger info)
 *   7. Checkout / payment
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

export class AgodaFlightOL extends BaseFlow {
  constructor() {
    super({
      ota: 'agoda',
      platform: 'ol',
      flowType: 'flight',
    });
  }

  async dismissPopups(page) {
    var selectors = [
      '[data-selenium="cookie-consent-accept"]',
      'button[data-element-name="cookie-consent-accept"]',
      '[data-selenium="close-button"]',
      'button[aria-label="Close"]',
      'button[aria-label="close"]',
      '[class*="close-button"]',
      '[class*="CloseButton"]',
      '[class*="dismiss"]',
      'button[data-selenium="dismiss"]',
      '[class*="notification"] button[class*="close"]',
    ];

    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = page.locator(selectors[i]).first();
        if (await el.isVisible({ timeout: 300 })) {
          await el.click();
          await page.waitForTimeout(300);
        }
      } catch (e) {}
    }

    await page.evaluate(function() {
      var banner = document.getElementById('ux-audit-banner');
      if (banner) banner.remove();
      var translateBar = document.querySelector('.goog-te-banner-frame, #goog-gt-tt, .skiptranslate');
      if (translateBar) translateBar.remove();
      document.body.style.top = '';
      document.body.style.position = '';
      document.querySelectorAll('[class*="overlay"], [class*="modal"], [class*="popup"]').forEach(function(el) {
        var style = window.getComputedStyle(el);
        if (style.position === 'fixed' && parseInt(style.zIndex) > 1000) {
          el.remove();
        }
      });
    });
  }

  async setupLocaleRewriting(context, locale, langId) {
    // All known locale codes that might appear in URLs
    var allLocales = Object.values(AGODA_LOCALES);
    var allLangIds = Object.values(AGODA_LANG_IDS);

    await context.route('**/*', function(route) {
      var request = route.request();
      if (request.resourceType() !== 'document') return route.continue();
      var url = request.url();
      if (url.indexOf('agoda.com') === -1) return route.continue();

      var original = url;

      // Replace any existing locale in URL path segments (e.g. /ko-kr/ -> /fr-fr/)
      for (var i = 0; i < allLocales.length; i++) {
        if (allLocales[i] === locale) continue;
        url = url.split('/' + allLocales[i] + '/').join('/' + locale + '/');
      }

      // Replace locale= / htmlLanguage= / cultureInfoName= params with regex
      url = url.replace(/locale=[a-z]{2}-[a-z]{2}/g, 'locale=' + locale);
      url = url.replace(/htmlLanguage=[a-z]{2}-[a-z]{2}/g, 'htmlLanguage=' + locale);
      url = url.replace(/cultureInfoName=[a-z]{2}-[a-z]{2}/g, 'cultureInfoName=' + locale);

      // Replace languageId= and realLanguageId= params
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
    var origin = params.origin || 'ICN';
    var destination = params.destination || 'NRT';
    var locale = AGODA_LOCALES[language] || language;
    var langId = AGODA_LANG_IDS[locale] || 9;

    console.log('  Locale: ' + locale + ', langId: ' + langId);
    console.log('  Route: ' + origin + ' -> ' + destination);

    await this.setupLocaleRewriting(context, locale, langId);
    console.log('  URL rewriting ready');

    // ========== PRE-STEP: Set language & currency on Agoda ==========
    console.log('');
    console.log('  --- Pre-step: Setting language & currency ---');
    var self = this;
    await setAgodaLocale(page, locale, currency, function(p) { return self.dismissPopups(p); });

    // ========== STEP 1: FLIGHTS HOME ==========
    console.log('');
    console.log('  --- Step 1: Flights home ---');
    var startUrl = 'https://www.agoda.com/' + locale + '/flights?currency=' + currency;
    await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await this.dismissPopups(page);
    await this.capture(page, 'home', 'Flights home page');

    // ========== STEP 2: SEARCH ==========
    console.log('');
    console.log('  --- Step 2: Search for flights ---');

    // Fill origin
    var originSelectors = [
      'input[data-selenium="flight-origin-search-input"]',
      'input[id="flight-origin-search-input"]',
      'input[placeholder*="출발"]',
      'input[placeholder*="출발지"]',
      'input[aria-label*="출발"]',
      'input[placeholder*="Origin"]',
      'input[placeholder*="From"]',
    ];

    for (var oi = 0; oi < originSelectors.length; oi++) {
      var oInput = page.locator(originSelectors[oi]).first();
      try {
        if (await oInput.isVisible({ timeout: 500 })) {
          await oInput.click();
          await oInput.fill('');
          await page.keyboard.type(origin, { delay: 80 });
          console.log('  Filled origin with: ' + originSelectors[oi]);
          break;
        }
      } catch (e) {}
    }

    await page.waitForTimeout(1500);

    // Pick first suggestion
    var suggestSelectors = [
      '[role="listbox"] [role="option"]',
      '[data-selenium="autosuggest-item"]',
      '[data-element-name="autosuggest-item"]',
      '[class*="AutoSuggest"] li',
      '[class*="autosuggest"] li',
      '[class*="Suggestion"]',
    ];

    for (var si = 0; si < suggestSelectors.length; si++) {
      var sug = page.locator(suggestSelectors[si]).first();
      try {
        if (await sug.isVisible({ timeout: 1000 })) {
          await sug.click();
          console.log('  Picked origin suggestion with: ' + suggestSelectors[si]);
          break;
        }
      } catch (e) {}
    }

    await page.waitForTimeout(1000);

    // Fill destination
    var destSelectors = [
      'input[data-selenium="flight-destination-search-input"]',
      'input[id="flight-destination-search-input"]',
      'input[placeholder*="도착"]',
      'input[placeholder*="도착지"]',
      'input[aria-label*="도착"]',
      'input[placeholder*="Destination"]',
      'input[placeholder*="To"]',
    ];

    for (var di = 0; di < destSelectors.length; di++) {
      var dInput = page.locator(destSelectors[di]).first();
      try {
        if (await dInput.isVisible({ timeout: 500 })) {
          await dInput.click();
          await dInput.fill('');
          await page.keyboard.type(destination, { delay: 80 });
          console.log('  Filled destination with: ' + destSelectors[di]);
          break;
        }
      } catch (e) {}
    }

    await page.waitForTimeout(1500);

    // Pick destination suggestion
    for (var dsi = 0; dsi < suggestSelectors.length; dsi++) {
      var dsug = page.locator(suggestSelectors[dsi]).first();
      try {
        if (await dsug.isVisible({ timeout: 1000 })) {
          await dsug.click();
          console.log('  Picked destination suggestion with: ' + suggestSelectors[dsi]);
          break;
        }
      } catch (e) {}
    }

    await page.waitForTimeout(1000);

    // ---- Select departure date ----
    console.log('  Selecting departure date...');
    var departureDate = params.departureDate || '';
    if (!departureDate) {
      var d = new Date();
      d.setMonth(d.getMonth() + 1);
      departureDate = d.toISOString().split('T')[0];
    }
    var dateParts = departureDate.split('-');
    var targetDay = parseInt(dateParts[2]);
    var targetMonth = parseInt(dateParts[1]);
    var targetYear = parseInt(dateParts[0]);

    // Build locale-aware month labels that match Agoda's calendar header format
    // e.g. Korean: "2026년 5월", French: "mai 2026", English: "May 2026"
    var monthNamesMap = {
      'ko-kr': [null, '1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
      'en-us': [null, 'January','February','March','April','May','June','July','August','September','October','November','December'],
      'fr-fr': [null, 'janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
      'de-de': [null, 'Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
      'es-es': [null, 'enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],
      'ja-jp': [null, '1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
      'zh-cn': [null, '1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
      'zh-tw': [null, '1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
      'zh-hk': [null, '1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
      'ru-ru': [null, 'январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'],
      'th-th': [null, 'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'],
      'vi-vn': [null, 'Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'],
      'ms-my': [null, 'Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember'],
      'id-id': [null, 'Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'],
    };
    var localeMonths = monthNamesMap[locale] || monthNamesMap['en-us'];
    var monthName = localeMonths[targetMonth];

    // Build multiple possible labels the calendar might show
    // Korean: "2026년 5월", Western: "mai 2026" or "May 2026"
    var targetMonthLabels = [];
    if (locale === 'ko-kr') {
      targetMonthLabels.push(targetYear + '년 ' + targetMonth + '월');
    } else if (locale === 'ja-jp' || locale === 'zh-cn' || locale === 'zh-tw' || locale === 'zh-hk') {
      targetMonthLabels.push(targetYear + '年' + targetMonth + '月');
      targetMonthLabels.push(targetYear + '年 ' + targetMonth + '月');
    } else {
      targetMonthLabels.push(monthName + ' ' + targetYear);
      // Capitalize first letter variant
      targetMonthLabels.push(monthName.charAt(0).toUpperCase() + monthName.slice(1) + ' ' + targetYear);
    }
    // Also add the number-only fallback: "5 2026" or "2026 5"
    targetMonthLabels.push(String(targetMonth));

    console.log('  Target: ' + departureDate + ', month labels: ' + JSON.stringify(targetMonthLabels));

    // Click the "가는 날" date field to open calendar
    try {
      await page.locator('[data-selenium="flight-date-selector"]').first().click();
      console.log('  Clicked date field');
    } catch (e) {
      try {
        await page.locator('[data-element-name="flight-departure"]').first().click();
        console.log('  Clicked date field (fallback)');
      } catch (e2) {
        console.log('  [!] Could not click date field');
      }
    }

    // Wait for calendar popup
    try {
      await page.locator('[data-selenium="range-picker-date"]').waitFor({ state: 'visible', timeout: 3000 });
      console.log('  Calendar popup visible');
    } catch (e) {
      console.log('  Calendar not visible, retrying...');
      try {
        await page.locator('[data-element-name="flight-departure"]').first().click();
        await page.waitForTimeout(1500);
      } catch (e2) {}
    }

    await page.waitForTimeout(500);

    // Navigate to target month if needed
    // Use data-selenium="calendar-next-month-button" for next arrow
    for (var mi = 0; mi < 6; mi++) {
      var hasMonth = await page.evaluate(function(labels) {
        var cal = document.querySelector('[data-selenium="range-picker-date"]');
        if (!cal) return false;
        var text = cal.textContent || '';
        for (var i = 0; i < labels.length - 1; i++) { // skip the last fallback (number-only)
          if (text.indexOf(labels[i]) >= 0) return true;
        }
        return false;
      }, targetMonthLabels);

      if (hasMonth) {
        console.log('  Target month visible');
        break;
      }

      try {
        await page.locator('[data-selenium="calendar-next-month-button"]').click();
        console.log('  Clicked next month');
        await page.waitForTimeout(400);
      } catch (e) {
        console.log('  No next month button');
        break;
      }
    }

    await page.waitForTimeout(300);

    // Click the target day
    // DOM structure:
    //   .DayPicker-Month > .DayPicker-Caption (has month header)
    //   .DayPicker-Month > .DayPicker-Body > .DayPicker-Week > .PriceSurgePicker-Day__container
    //     > .PriceSurgePicker-Day__circle > SPAN.PriceSurgePicker-Day__label (has day number)
    // We click the __container div (the actual clickable cell).
    // Two months shown side by side — pick the one matching targetMonthLabel.
    var dayResult = await page.evaluate(function(info) {
      var cal = document.querySelector('[data-selenium="range-picker-date"]');
      if (!cal) return { clicked: false, reason: 'no calendar element' };

      // Find the correct month section using locale-aware labels
      var months = cal.querySelectorAll('.DayPicker-Month');
      var targetSection = null;
      for (var m = 0; m < months.length; m++) {
        var caption = months[m].querySelector('.DayPicker-Caption');
        if (!caption) continue;
        var capText = caption.textContent || '';
        for (var li = 0; li < info.monthLabels.length - 1; li++) {
          if (capText.indexOf(info.monthLabels[li]) >= 0) {
            targetSection = months[m];
            break;
          }
        }
        if (targetSection) break;
      }

      var scope = targetSection || cal;

      // Find day containers by class
      var containers = scope.querySelectorAll('[class*="PriceSurgePicker-Day__container"]');
      for (var i = 0; i < containers.length; i++) {
        var label = containers[i].querySelector('[class*="PriceSurgePicker-Day__label"]');
        if (!label) continue;
        var text = (label.textContent || '').trim();
        if (text !== String(info.day)) continue;
        var cls = (containers[i].className || '').toString();
        if (cls.indexOf('disabled') >= 0 || cls.indexOf('outside') >= 0) continue;
        containers[i].click();
        return { clicked: true, method: 'container', text: text, monthFound: !!targetSection };
      }

      // Fallback: find any span with PriceSurgePicker-Day__label and matching text
      var labels = scope.querySelectorAll('[class*="PriceSurgePicker-Day__label"]');
      for (var j = 0; j < labels.length; j++) {
        if ((labels[j].textContent || '').trim() === String(info.day)) {
          // Click the grandparent (container)
          var gp = labels[j].parentElement && labels[j].parentElement.parentElement;
          if (gp) {
            gp.click();
            return { clicked: true, method: 'label-grandparent', text: String(info.day) };
          }
          labels[j].click();
          return { clicked: true, method: 'label-direct', text: String(info.day) };
        }
      }

      return { clicked: false, reason: 'day not found', containers: containers.length, labels: labels.length, months: months.length };
    }, { day: targetDay, monthLabels: targetMonthLabels });

    console.log('  Day click result: ' + JSON.stringify(dayResult));

    // Verify date was selected
    await page.waitForTimeout(800);
    var dateTitle = await page.evaluate(function() {
      var el = document.querySelector('[data-selenium="date-selector-title"]');
      return el ? el.textContent.trim() : '';
    });
    console.log('  Date selector title: "' + dateTitle + '"');

    // If still showing "가는 날", try Playwright click as fallback
    if (dateTitle.indexOf('가는 날') >= 0 || dateTitle === '') {
      console.log('  Date not set yet, trying Playwright locator...');
      try {
        // Find day labels inside the calendar and click via Playwright
        var dayLabels = page.locator('[data-selenium="range-picker-date"] [class*="PriceSurgePicker-Day__label"]');
        var count = await dayLabels.count();
        console.log('  Found ' + count + ' day labels via Playwright');
        for (var dli = 0; dli < count; dli++) {
          var labelText = await dayLabels.nth(dli).textContent();
          if (labelText.trim() === String(targetDay)) {
            // Click the container (grandparent)
            try {
              await dayLabels.nth(dli).locator('xpath=../..').click();
              console.log('  Clicked day ' + targetDay + ' container via Playwright');
            } catch (e) {
              await dayLabels.nth(dli).click();
              console.log('  Clicked day ' + targetDay + ' label directly via Playwright');
            }
            break;
          }
        }
      } catch (e) {
        console.log('  Playwright fallback failed: ' + e.message.substring(0, 80));
      }

      await page.waitForTimeout(800);
      dateTitle = await page.evaluate(function() {
        var el = document.querySelector('[data-selenium="date-selector-title"]');
        return el ? el.textContent.trim() : '';
      });
      console.log('  Date selector title after retry: "' + dateTitle + '"');
    }

    await page.waitForTimeout(500);

    // ---- Select cabin class ----
    var cabinClass = params.cabinClass || 'economy';
    var cabinLabels = {
      'economy': ['이코노미', 'Economy'],
      'premium': ['프리미엄 이코노미', 'Premium Economy'],
      'business': ['비즈니스', 'Business'],
      'first': ['퍼스트', 'First'],
    };
    var targetLabels = cabinLabels[cabinClass] || cabinLabels['economy'];
    console.log('  Cabin class: ' + cabinClass + ' (' + targetLabels.join('/') + ')');

    if (cabinClass !== 'economy') {
      // Open cabin class dropdown
      try {
        var cabinDropdown = page.locator('[data-element-name="flight-cabin-class"]').first();
        if (await cabinDropdown.isVisible({ timeout: 2000 })) {
          await cabinDropdown.click();
          console.log('  Opened cabin class dropdown');
          await page.waitForTimeout(1000);

          // Try clicking the target option using text match
          var cabinSelected = false;
          for (var cl = 0; cl < targetLabels.length; cl++) {
            try {
              // Try Playwright text locator broadly
              var opt = page.locator('text="' + targetLabels[cl] + '"').first();
              if (await opt.isVisible({ timeout: 1000 })) {
                await opt.click();
                console.log('  Selected cabin class: ' + targetLabels[cl]);
                cabinSelected = true;
                break;
              }
            } catch (e) {}
          }

          if (!cabinSelected) {
            // Fallback: find and click by text content in DOM
            var fallbackResult = await page.evaluate(function(labels) {
              var all = document.querySelectorAll('div, span, button, a, li, label');
              for (var i = 0; i < all.length; i++) {
                var rect = all[i].getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                if (rect.top < 0 || rect.top > window.innerHeight) continue;
                var text = (all[i].textContent || '').trim();
                // Match exact or very close (avoid matching parent containers)
                if (text.length > 30) continue;
                for (var j = 0; j < labels.length; j++) {
                  if (text === labels[j] || text.indexOf(labels[j]) === 0) {
                    all[i].click();
                    return { clicked: true, text: text, tag: all[i].tagName };
                  }
                }
              }
              return { clicked: false };
            }, targetLabels);
            console.log('  Cabin class fallback: ' + JSON.stringify(fallbackResult));
          }

          await page.waitForTimeout(500);
        }
      } catch (e) {
        console.log('  [!] Could not select cabin class: ' + e.message.substring(0, 60));
      }
    }

    // Click search button
    var searchBtnSelectors = [
      '[data-element-name="flight-olsb-search-button"]',
      '[data-element-name="flight-search"]',
      '[data-selenium="searchButton"]',
      '[data-element-name="search-button"]',
      'button:has-text("검색하기")',
      'button:has-text("항공권 검색")',
      'button:has-text("Search")',
      'button[type="submit"]',
    ];

    for (var sbi = 0; sbi < searchBtnSelectors.length; sbi++) {
      var sbtn = page.locator(searchBtnSelectors[sbi]).first();
      try {
        if (await sbtn.isVisible({ timeout: 1000 })) {
          await sbtn.click();
          console.log('  Clicked search button with: ' + searchBtnSelectors[sbi]);
          break;
        }
      } catch (e) {}
    }

    // Wait for results to load
    await page.waitForTimeout(10000);
    await this.dismissPopups(page);

    // ========== STEP 3: SEARCH RESULTS ==========
    console.log('');
    console.log('  --- Step 3: Flight search results ---');

    // Check for new tab
    var allPages = context.pages();
    if (allPages.length > 1) {
      var resultsPage = allPages[allPages.length - 1];
      if (resultsPage !== page) {
        console.log('  Search results in new tab');
        await resultsPage.waitForLoadState('domcontentloaded');
        for (var cp = 0; cp < allPages.length; cp++) {
          if (allPages[cp] !== resultsPage) {
            try { await allPages[cp].close(); } catch (e) {}
          }
        }
        page = resultsPage;
      }
    }

    await page.waitForTimeout(3000);
    await this.dismissPopups(page);

    await this.capture(page, 'search-results', 'Flight search results');

    // ========== STEP 4: SELECT FLIGHT ==========
    console.log('');
    console.log('  --- Step 4: Select flight ---');

    // Scroll down so flight cards are in view
    await page.evaluate(function() { window.scrollBy(0, 300); });
    await page.waitForTimeout(2000);

    var urlBeforeSelect = page.url();

    // Agoda flight cards use a two-step pattern:
    //   1. Click the card to expand it (reveals fare details)
    //   2. Click the "선택하기" button (data-element-name="flight-detail-select-button")
    // Fallbacks handle direct links or other card structures.

    // Step 4a: Click the first flight card to expand it
    var cardSelectors = [
      '[class*="GridItem__GridItemStyled"]',
      '[class*="Cardstyled__CardStyled"]',
      '[class*="FlightCard"]',
      '[class*="ResultCard"]',
    ];

    for (var ce = 0; ce < cardSelectors.length; ce++) {
      try {
        var card = page.locator(cardSelectors[ce]).first();
        if (await card.isVisible({ timeout: 2000 })) {
          await card.click();
          console.log('  Clicked flight card: ' + cardSelectors[ce]);
          break;
        }
      } catch (e) {}
    }

    // Wait for expansion animation
    await page.waitForTimeout(2000);
    await this.dismissPopups(page);
    await this.capture(page, 'flight-detail', 'Expanded flight detail on search results');

    // ========== STEP 5: SELECT FLIGHT -> BOOKING PAGE ==========
    console.log('');
    console.log('  --- Step 5: Select flight -> booking page ---');

    // Click the select button that appears in the expanded panel
    var selectSelectors = [
      '[data-element-name="flight-detail-select-button"]',
      'button:has-text("선택")',
      'a:has-text("선택")',
      'button:has-text("Select")',
      'a:has-text("Select")',
      'button:has-text("예약")',
      'button:has-text("View Deal")',
      'button:has-text("Book")',
      '[data-element-name*="select"]',
      '[data-selenium*="select"]',
    ];

    for (var ss = 0; ss < selectSelectors.length; ss++) {
      try {
        var selBtn = page.locator(selectSelectors[ss]).first();
        if (await selBtn.isVisible({ timeout: 1000 })) {
          var newPagePromise = context.waitForEvent('page', { timeout: 5000 }).catch(function() { return null; });
          await selBtn.click();
          console.log('  Clicked select button: ' + selectSelectors[ss]);
          var newPage = await newPagePromise;
          if (newPage) {
            await newPage.waitForLoadState('domcontentloaded');
            try { await page.close(); } catch (e) {}
            page = newPage;
          }
          break;
        }
      } catch (e) {}
    }

    await page.waitForTimeout(3000);

    // Handle new tab if opened
    var allPagesAfterSelect = context.pages();
    if (allPagesAfterSelect.length > 1) {
      var newestPage = allPagesAfterSelect[allPagesAfterSelect.length - 1];
      if (newestPage !== page) {
        console.log('  Flight detail opened in new tab');
        await newestPage.waitForLoadState('domcontentloaded');
        for (var tp = 0; tp < allPagesAfterSelect.length; tp++) {
          if (allPagesAfterSelect[tp] !== newestPage) {
            try { await allPagesAfterSelect[tp].close(); } catch (e) {}
          }
        }
        page = newestPage;
      }
    }

    console.log('  URL after flight select: ' + page.url().substring(0, 120));

    var currentUrl = page.url();
    console.log('  Current URL after flight select: ' + currentUrl.substring(0, 100));

    await page.waitForTimeout(2000);
    await this.dismissPopups(page);
    await this.capture(page, 'booking', 'Booking page after flight selection');

    // ========== STEP 6: FILL-IN (PASSENGER INFO) ==========
    console.log('');
    console.log('  --- Step 6: Fill-in (passenger info) ---');
    await page.waitForTimeout(2000);
    console.log('  Current URL: ' + page.url().substring(0, 100));

    // ---- Runtime-adaptive PAX data ----
    // Name and phone vary by language setting to look natural for the locale.
    var paxByLang = {
      'ko-kr': { firstName: 'Minjun', lastName: 'Kim', phone: '01012345678' },
      'en-us': { firstName: 'John', lastName: 'Smith', phone: '2125551234' },
      'fr-fr': { firstName: 'Jean', lastName: 'Dupont', phone: '0612345678' },
      'de-de': { firstName: 'Hans', lastName: 'Mueller', phone: '01711234567' },
      'es-es': { firstName: 'Carlos', lastName: 'Garcia', phone: '612345678' },
      'ja':    { firstName: 'Taro', lastName: 'Yamada', phone: '09012345678' },
      'zh-cn': { firstName: 'Wei', lastName: 'Zhang', phone: '13812345678' },
      'zh-tw': { firstName: 'Wei', lastName: 'Chen', phone: '0912345678' },
      'zh-hk': { firstName: 'Wing', lastName: 'Chan', phone: '91234567' },
      'ru':    { firstName: 'Ivan', lastName: 'Petrov', phone: '9161234567' },
      'th':    { firstName: 'Somchai', lastName: 'Suksri', phone: '0812345678' },
      'vi':    { firstName: 'Minh', lastName: 'Nguyen', phone: '0912345678' },
      'ms':    { firstName: 'Ahmad', lastName: 'Ibrahim', phone: '0121234567' },
      'id':    { firstName: 'Budi', lastName: 'Santoso', phone: '08123456789' },
    };
    var langPax = paxByLang[language] || paxByLang['en-us'];
    var pax = {
      firstName: langPax.firstName,
      lastName: langPax.lastName,
      email: langPax.firstName.toLowerCase() + '.' + langPax.lastName.toLowerCase() + '@example.com',
      phone: langPax.phone,
      birthYear: '1990',
      birthMonth: '01',
      birthDay: '01',
      gender: 'male',
      nationality: 'KR',
      passportNumber: 'M12345678',
      passportExpYear: '2030',
      passportExpMonth: '06',
      passportExpDay: '15',
    };
    console.log('  PAX: ' + pax.firstName + ' ' + pax.lastName);

    // Debug: log all data-element-name attributes on the page for debugging
    var pageDataElements = await page.evaluate(function() {
      var els = document.querySelectorAll('[data-element-name]');
      var names = [];
      for (var i = 0; i < els.length; i++) {
        var n = els[i].getAttribute('data-element-name');
        if (n && (n.indexOf('passenger') >= 0 || n.indexOf('pax') >= 0 ||
            n.indexOf('birth') >= 0 || n.indexOf('expir') >= 0 ||
            n.indexOf('passport') >= 0 || n.indexOf('national') >= 0 ||
            n.indexOf('gender') >= 0 || n.indexOf('issuing') >= 0 ||
            n.indexOf('contact') >= 0 || n.indexOf('name') >= 0)) {
          names.push(n);
        }
      }
      return names;
    });
    console.log('  Page data-element-names: ' + JSON.stringify(pageDataElements));

    // Helper: fill first matching visible input
    async function fillField(pg, selectors, value, label) {
      for (var i = 0; i < selectors.length; i++) {
        try {
          var input = pg.locator(selectors[i]).first();
          if (await input.isVisible({ timeout: 500 })) {
            await input.click();
            await input.fill(value);
            console.log('  Filled ' + label + ' with: ' + selectors[i]);
            return true;
          }
        } catch (e) {}
      }
      return false;
    }

    // Helper: select dropdown option by value or visible text
    async function selectOption(pg, selectors, value, textOptions, label) {
      for (var i = 0; i < selectors.length; i++) {
        try {
          var sel = pg.locator(selectors[i]).first();
          if (await sel.isVisible({ timeout: 500 })) {
            // Try by value first
            try {
              await sel.selectOption({ value: value });
              console.log('  Selected ' + label + ' by value: ' + value);
              return true;
            } catch (e) {}
            // Try by label text
            if (textOptions) {
              for (var t = 0; t < textOptions.length; t++) {
                try {
                  await sel.selectOption({ label: textOptions[t] });
                  console.log('  Selected ' + label + ' by label: ' + textOptions[t]);
                  return true;
                } catch (e) {}
              }
            }
          }
        } catch (e) {}
      }
      return false;
    }

    // ---- Contact info ----
    await fillField(page, [
      'input[data-element-name*="contact-first-name"]',
      'input[data-element-name*="first-name"]',
      'input[name*="contactFirstName"]',
      'input[name*="firstName"]', 'input[name*="FirstName"]',
      'input[id*="contactFirstName"]',
      'input[placeholder*="이름"]', 'input[placeholder*="First"]',
      'input[autocomplete="given-name"]',
    ], pax.firstName, 'contact first name');

    await fillField(page, [
      'input[data-element-name*="contact-last-name"]',
      'input[data-element-name*="last-name"]',
      'input[name*="contactLastName"]',
      'input[name*="lastName"]', 'input[name*="LastName"]',
      'input[id*="contactLastName"]',
      'input[placeholder*="성"]', 'input[placeholder*="Last"]',
      'input[autocomplete="family-name"]',
    ], pax.lastName, 'contact last name');

    await fillField(page, [
      'input[data-element-name*="contact-email"]',
      'input[data-element-name*="email"]',
      'input[type="email"]',
      'input[name*="email"]', 'input[name*="Email"]',
      'input[placeholder*="이메일"]', 'input[placeholder*="email"]',
    ], pax.email, 'email');

    await fillField(page, [
      'input[data-element-name*="phone"]',
      'input[name*="contactPhoneNumber"]',
      'input[type="tel"]',
      'input[name*="phone"]', 'input[name*="Phone"]',
      'input[placeholder*="전화"]', 'input[placeholder*="phone"]',
    ], pax.phone, 'phone');

    // ---- Passenger (PAX) info ----
    // PAX first name (separate from contact)
    await fillField(page, [
      'input[data-element-name*="pax-first-name"]',
      'input[data-element-name*="passenger-first-name"]',
      'input[name*="paxFirstName"]', 'input[name*="paxfirstname"]',
      'input[name*="travelerFirstName"]', 'input[name*="travelerGivenName"]',
      'input[name*="passenger"][name*="irst"]',
      'input[id*="paxFirstName"]', 'input[id*="pax-first-name"]',
    ], pax.firstName, 'PAX first name');

    // PAX last name
    await fillField(page, [
      'input[data-element-name*="pax-last-name"]',
      'input[data-element-name*="passenger-last-name"]',
      'input[name*="paxLastName"]', 'input[name*="paxlastname"]',
      'input[name*="travelerLastName"]', 'input[name*="travelerFamilyName"]',
      'input[name*="passenger"][name*="ast"]',
      'input[id*="paxLastName"]', 'input[id*="pax-last-name"]',
    ], pax.lastName, 'PAX last name');

    // Gender - runtime adaptive: read the first radio/option from the page
    // For "male", click the first gender option (male/homme/남성/男 etc.)
    var genderSelected = false;

    // Try native select first
    genderSelected = await selectOption(page, [
      'select[data-element-name*="gender"]',
      'select[name*="gender"]', 'select[name*="Gender"]',
    ], pax.gender, null, 'gender');

    if (!genderSelected) {
      // Find the gender section and click the first option (which is always male)
      var genderContainer = page.locator('[data-element-name="passenger-gender-input"]').first();
      try {
        if (await genderContainer.isVisible({ timeout: 1000 })) {
          // Click the first radio/label in the gender container
          var firstRadio = genderContainer.locator('label, [role="radio"]').first();
          if (await firstRadio.isVisible({ timeout: 500 })) {
            await firstRadio.click();
            var gText = await firstRadio.textContent();
            console.log('  Selected gender (first option): ' + (gText || '').trim());
            genderSelected = true;
          }
        }
      } catch (e) {}
    }

    // Fallback: find any radio group that looks like gender
    if (!genderSelected) {
      var genderResult = await page.evaluate(function() {
        // Look for a fieldset or container with exactly 2 radio inputs
        var radios = document.querySelectorAll('input[type="radio"]');
        var groups = {};
        for (var i = 0; i < radios.length; i++) {
          var name = radios[i].name || '';
          if (!groups[name]) groups[name] = [];
          groups[name].push(radios[i]);
        }
        // Find a group with exactly 2 options (male/female)
        for (var key in groups) {
          if (groups[key].length === 2) {
            var label = groups[key][0].closest('label') || document.querySelector('label[for="' + groups[key][0].id + '"]');
            if (label) {
              label.click();
              return { clicked: true, text: (label.textContent || '').trim() };
            } else {
              groups[key][0].click();
              return { clicked: true, text: 'radio' };
            }
          }
        }
        return { clicked: false };
      });
      if (genderResult.clicked) {
        console.log('  Selected gender by radio group: ' + genderResult.text);
        genderSelected = true;
      }
    }

    // Helper: fill a date group (year input, month combobox, day input)
    // Layout varies by locale: ko/en = YYYY/MM/DD, fr/de = DD/MM/YYYY
    // We use ONLY scoped selectors (no unscoped fallbacks) to prevent cross-contamination.
    async function fillDateGroup(pg, containerDens, year, month, day, label) {
      // Try multiple possible container data-element-names
      if (typeof containerDens === 'string') containerDens = [containerDens];
      var prefix = '';
      for (var ci = 0; ci < containerDens.length; ci++) {
        var exists = await pg.locator('[data-element-name="' + containerDens[ci] + '"]').count();
        if (exists > 0) {
          prefix = '[data-element-name="' + containerDens[ci] + '"] ';
          console.log('  ' + label + ' container: ' + containerDens[ci]);
          break;
        }
      }
      if (!prefix) {
        console.log('  [!] ' + label + ' container not found, skipping to avoid overwriting other fields');
        return;
      }

      // Year input - multi-locale placeholders
      await fillField(pg, [
        prefix + 'input[placeholder*="YYYY"]',
        prefix + 'input[placeholder*="AAAA"]',
        prefix + 'input[placeholder*="년"]',
      ], year, label + ' year');

      // Day input - multi-locale placeholders
      await fillField(pg, [
        prefix + 'input[placeholder*="DD"]',
        prefix + 'input[placeholder*="JJ"]',
        prefix + 'input[placeholder*="일"]',
      ], day, label + ' day');

      // Month combobox - find it on the same row as the inputs (position-agnostic)
      var monthResult = await pg.evaluate(function(pfx) {
        var scope = document;
        if (pfx) {
          var den = pfx.match(/data-element-name="([^"]+)"/);
          if (den) {
            var el = document.querySelector('[data-element-name="' + den[1] + '"]');
            if (el) scope = el;
          }
        }

        // Find the two text inputs (year and day)
        var inputs = scope.querySelectorAll('input[type="text"], input:not([type])');
        var dateInputs = [];
        for (var i = 0; i < inputs.length; i++) {
          var ph = (inputs[i].placeholder || '').toLowerCase();
          if (ph.indexOf('yyyy') >= 0 || ph.indexOf('aaaa') >= 0 || ph.indexOf('년') >= 0 ||
              ph.indexOf('dd') >= 0 || ph.indexOf('jj') >= 0 || ph.indexOf('일') >= 0) {
            dateInputs.push(inputs[i]);
          }
        }
        if (dateInputs.length < 1) return { found: false, reason: 'no date inputs found' };

        // Get the row position and left/right bounds from inputs
        var refRect = dateInputs[0].getBoundingClientRect();
        var leftBound = Infinity, rightBound = -Infinity;
        for (var j = 0; j < dateInputs.length; j++) {
          var r = dateInputs[j].getBoundingClientRect();
          leftBound = Math.min(leftBound, r.left);
          rightBound = Math.max(rightBound, r.right);
        }

        // Find any button/combobox on the same row that's NOT one of the text inputs
        var buttons = scope.querySelectorAll('button[role="combobox"], button, div[role="combobox"]');
        for (var k = 0; k < buttons.length; k++) {
          var bRect = buttons[k].getBoundingClientRect();
          if (bRect.width === 0 || bRect.height === 0) continue;
          if (Math.abs(bRect.top - refRect.top) > 30) continue;
          // Must be within the horizontal bounds of the date group
          if (bRect.left >= leftBound - 20 && bRect.right <= rightBound + 20) {
            // Make sure it's not overlapping a text input
            var isInput = false;
            for (var m = 0; m < dateInputs.length; m++) {
              var ir = dateInputs[m].getBoundingClientRect();
              if (Math.abs(bRect.left - ir.left) < 5) { isInput = true; break; }
            }
            if (!isInput) {
              return { found: true, text: (buttons[k].textContent || '').trim().substring(0, 20) };
            }
          }
        }
        return { found: false, reason: 'no month button found on same row' };
      }, prefix);

      console.log('  ' + label + ' month scan: ' + JSON.stringify(monthResult));

      if (monthResult.found) {
        // Click the month combobox via Playwright
        var monthComboClicked = false;
        try {
          var monthBtn = pg.locator(prefix + 'button[role="combobox"]').first();
          if (await monthBtn.isVisible({ timeout: 500 })) {
            await monthBtn.click();
            monthComboClicked = true;
          }
        } catch (e) {}

        // Fallback: use evaluate to click by position
        if (!monthComboClicked) {
          await pg.evaluate(function(pfx) {
            var scope = document;
            if (pfx) {
              var den = pfx.match(/data-element-name="([^"]+)"/);
              if (den) {
                var el = document.querySelector('[data-element-name="' + den[1] + '"]');
                if (el) scope = el;
              }
            }
            var inputs = scope.querySelectorAll('input[type="text"], input:not([type])');
            var dateInputs = [];
            for (var i = 0; i < inputs.length; i++) {
              var ph = (inputs[i].placeholder || '').toLowerCase();
              if (ph.indexOf('yyyy') >= 0 || ph.indexOf('aaaa') >= 0 || ph.indexOf('년') >= 0 ||
                  ph.indexOf('dd') >= 0 || ph.indexOf('jj') >= 0 || ph.indexOf('일') >= 0) {
                dateInputs.push(inputs[i]);
              }
            }
            if (dateInputs.length < 1) return;
            var refRect = dateInputs[0].getBoundingClientRect();
            var leftBound = Infinity, rightBound = -Infinity;
            for (var j = 0; j < dateInputs.length; j++) {
              var r = dateInputs[j].getBoundingClientRect();
              leftBound = Math.min(leftBound, r.left);
              rightBound = Math.max(rightBound, r.right);
            }
            var buttons = scope.querySelectorAll('button, div[role="combobox"]');
            for (var k = 0; k < buttons.length; k++) {
              var bRect = buttons[k].getBoundingClientRect();
              if (bRect.width === 0 || bRect.height === 0) continue;
              if (Math.abs(bRect.top - refRect.top) > 30) continue;
              if (bRect.left >= leftBound - 20 && bRect.right <= rightBound + 20) {
                var isInput = false;
                for (var m = 0; m < dateInputs.length; m++) {
                  var ir = dateInputs[m].getBoundingClientRect();
                  if (Math.abs(bRect.left - ir.left) < 5) { isInput = true; break; }
                }
                if (!isInput) { buttons[k].click(); break; }
              }
            }
          }, prefix);
        }

        await pg.waitForTimeout(800);

        // Select the month from the dropdown - multi-locale month names
        var monthNames = {
          '01': ['1월', 'January', 'Janvier', 'Jan', 'Januar', 'Enero', '01', '1'],
          '02': ['2월', 'February', 'Février', 'Feb', 'Februar', 'Febrero', '02', '2'],
          '03': ['3월', 'March', 'Mars', 'Mar', 'März', 'Marzo', '03', '3'],
          '04': ['4월', 'April', 'Avril', 'Apr', 'Abril', '04', '4'],
          '05': ['5월', 'May', 'Mai', 'Mayo', '05', '5'],
          '06': ['6월', 'June', 'Juin', 'Jun', 'Juni', 'Junio', '06', '6'],
          '07': ['7월', 'July', 'Juillet', 'Jul', 'Juli', 'Julio', '07', '7'],
          '08': ['8월', 'August', 'Août', 'Aug', 'Agosto', '08', '8'],
          '09': ['9월', 'September', 'Septembre', 'Sep', 'Septiembre', '09', '9'],
          '10': ['10월', 'October', 'Octobre', 'Oct', 'Oktober', 'Octubre', '10'],
          '11': ['11월', 'November', 'Novembre', 'Nov', 'Noviembre', '11'],
          '12': ['12월', 'December', 'Décembre', 'Dec', 'Dezember', 'Diciembre', '12'],
        };
        var targets = monthNames[month] || [month];
        var monthSelected = false;

        for (var mt = 0; mt < targets.length; mt++) {
          try {
            var mOpt = pg.locator('[role="listbox"] li:has-text("' + targets[mt] + '")').first();
            if (await mOpt.isVisible({ timeout: 300 })) {
              await pg.evaluate(function(text) {
                var items = document.querySelectorAll('[role="listbox"] li');
                for (var i = 0; i < items.length; i++) {
                  if ((items[i].textContent || '').trim().indexOf(text) >= 0) {
                    items[i].scrollIntoView({ block: 'center' });
                    break;
                  }
                }
              }, targets[mt]);
              await pg.waitForTimeout(200);
              await mOpt.click();
              console.log('  Selected ' + label + ' month: ' + targets[mt]);
              monthSelected = true;
              break;
            }
          } catch (e) {}
        }

        if (!monthSelected) {
          for (var mt2 = 0; mt2 < targets.length; mt2++) {
            try {
              var mOpt2 = pg.locator('text="' + targets[mt2] + '"').first();
              if (await mOpt2.isVisible({ timeout: 300 })) {
                await mOpt2.click();
                console.log('  Selected ' + label + ' month (text): ' + targets[mt2]);
                monthSelected = true;
                break;
              }
            } catch (e) {}
          }
        }

        if (!monthSelected) {
          await pg.keyboard.press('Escape');
          console.log('  [!] Could not select ' + label + ' month');
        }
      }
    }

    // Date of birth
    await fillDateGroup(page, [
      'passenger-date-of-birth-input',
      'passenger-dob-input',
      'date-of-birth-input',
    ], pax.birthYear, pax.birthMonth, pax.birthDay, 'DOB');


    // Reusable: open an Agoda combobox, scroll to find a matching LI, click it
    // searchTexts = array of text to look for in the LI items (tries each until match)
    async function selectComboboxItem(pg, containerDen, searchTexts, fieldLabel) {
      var selected = false;

      await pg.evaluate(function(den) {
        var el = document.querySelector('[data-element-name="' + den + '"]');
        if (el) el.scrollIntoView({ block: 'center' });
      }, containerDen);
      await pg.waitForTimeout(500);

      try {
        var combo = pg.locator('[data-element-name="' + containerDen + '"] [role="combobox"]').first();
        if (!(await combo.isVisible({ timeout: 1500 }))) {
          combo = pg.locator('[data-element-name="' + containerDen + '"] button').first();
        }
        if (await combo.isVisible({ timeout: 1000 })) {
          await combo.click();
          console.log('  Opened ' + fieldLabel + ' combobox');
          await pg.waitForTimeout(1000);

          for (var s = 0; s < searchTexts.length && !selected; s++) {
            var searchText = searchTexts[s];

            // Scroll matching LI into view via DOM
            await pg.evaluate(function(text) {
              var listbox = document.querySelector('[role="listbox"]');
              var items = (listbox || document).querySelectorAll('li');
              for (var i = 0; i < items.length; i++) {
                if ((items[i].textContent || '').indexOf(text) >= 0) {
                  items[i].scrollIntoView({ block: 'center' });
                  break;
                }
              }
            }, searchText);
            await pg.waitForTimeout(300);

            // Click with Playwright
            try {
              var li = pg.locator('[role="listbox"] li:has-text("' + searchText + '")').first();
              if (await li.isVisible({ timeout: 500 })) {
                await li.click();
                console.log('  Selected ' + fieldLabel + ': ' + searchText);
                selected = true;
              }
            } catch (e) {}

            // Fallback: click radio inside the LI
            if (!selected) {
              try {
                var radio = pg.locator('[role="listbox"] li:has-text("' + searchText + '") input').first();
                if (await radio.isVisible({ timeout: 300 })) {
                  await radio.click();
                  console.log('  Selected ' + fieldLabel + ': ' + searchText + ' (radio)');
                  selected = true;
                }
              } catch (e) {}
            }
          }

          if (!selected) {
            await pg.keyboard.press('Escape');
            console.log('  [!] Could not select ' + fieldLabel);
          }
        } else {
          console.log('  [!] ' + fieldLabel + ' combobox not visible');
        }
      } catch (e) {
        console.log('  [!] ' + fieldLabel + ' error: ' + e.message.substring(0, 80));
      }
      return selected;
    }

    // Nationality - scroll to Korea and click (works in any language)
    // Agoda lists countries with both local name and country code,
    // so "Korea" or "KR" partial match works across locales.
    // Search terms ordered most-specific first to avoid matching North Korea
    var southKoreaTerms = [
      'Corée du Sud', 'South Korea', 'Korea, Republic', 'Republic of Korea',
      'Corea del Sur', 'Südkorea', 'Hàn Quốc', '대한민국', '韩国', '韓国',
      'เกาหลีใต้', 'Korea Selatan', 'Южная Корея', '한국',
    ];
    await selectComboboxItem(page, 'passenger-nationality-input', southKoreaTerms, 'nationality');

    // ---- Passport fields (using data-element-name selectors) ----

    // Passport number - use data-element-name
    await fillField(page, [
      '[data-element-name="passenger-passport-number-input"] input',
      'input[name*="passportNumber"]', 'input[name*="PassportNumber"]',
      'input[id*="passportNumber"]', 'input[id*="PassportNumber"]',
    ], pax.passportNumber, 'passport number');

    // Issuing country - use selectComboboxItem (no keyboard.type!)
    await selectComboboxItem(page, 'passenger-passport-issue-country-input', southKoreaTerms, 'issuing country');

    // Passport expiry - use data-element-name container
    var expiryDen = 'passenger-passport-expiry-input';
    await fillDateGroup(page, [expiryDen], pax.passportExpYear, pax.passportExpMonth, pax.passportExpDay, 'passport expiry');

    // Verify DOB wasn't accidentally overwritten
    var dobCheck = await page.evaluate(function() {
      var dobContainer = document.querySelector('[data-element-name="passenger-date-of-birth-input"]');
      if (!dobContainer) return 'no DOB container';
      var inputs = dobContainer.querySelectorAll('input');
      var values = [];
      for (var i = 0; i < inputs.length; i++) {
        values.push(inputs[i].value || inputs[i].placeholder);
      }
      return values.join(', ');
    });
    console.log('  DOB values after expiry fill: ' + dobCheck);

    // Consent checkboxes
    await page.evaluate(function() {
      var checkboxes = document.querySelectorAll('input[type="checkbox"]');
      for (var i = 0; i < checkboxes.length; i++) {
        var name = checkboxes[i].name || '';
        if (name.indexOf('consent') >= 0 || name.indexOf('Consent') >= 0 ||
            name.indexOf('agree') >= 0 || name.indexOf('terms') >= 0) {
          if (!checkboxes[i].checked) checkboxes[i].click();
        }
      }
    });

    await page.waitForTimeout(1000);
    await this.dismissPopups(page);
    await this.capture(page, 'fill-in', 'Passenger info / fill-in page');

    // ========== STEP 7: CHECKOUT ==========
    console.log('');
    console.log('  --- Step 7: Checkout ---');

    var checkoutBtnSelectors = [
      'button[data-element-name*="proceed"]',
      'button[data-element-name*="payment"]',
      'button[data-element-name*="checkout"]',
      'button[data-selenium*="proceed"]',
      'button[data-selenium*="checkout"]',
      'button:has-text("결제 단계")',
      'button:has-text("결제")',
      'button:has-text("다음")',
      'button:has-text("진행")',
      'button:has-text("예약")',
      'button:has-text("Proceed")',
      'button:has-text("Continue")',
      'button:has-text("Pay")',
      'button:has-text("Book")',
      'input[type="submit"]',
    ];

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
      var newPagePromise2 = context.waitForEvent('page', { timeout: 8000 }).catch(function() { return null; });
      await checkoutBtn.click();
      console.log('  Clicked checkout button');

      var newPage2 = await newPagePromise2;
      if (newPage2) {
        await newPage2.waitForLoadState('domcontentloaded');
        try { await page.close(); } catch (e) {}
        page = newPage2;
      } else {
        await page.waitForTimeout(5000);
      }
    }

    await page.waitForTimeout(2000);
    await this.dismissPopups(page);

    // Handle error modal (anti-bot)
    var dismissedError = await page.evaluate(function() {
      var buttons = document.querySelectorAll('button, a');
      for (var i = 0; i < buttons.length; i++) {
        var text = (buttons[i].textContent || '').trim();
        if (text.indexOf('새로고침') >= 0 || text.indexOf('다시 시도') >= 0 ||
            text.indexOf('Refresh') >= 0 || text.indexOf('Try again') >= 0) {
          buttons[i].click();
          return 'clicked: ' + text;
        }
      }
      return null;
    });

    if (dismissedError) {
      console.log('  Dismissed error modal: ' + dismissedError);
      await page.waitForTimeout(5000);
      await this.dismissPopups(page);
    }

    await this.capture(page, 'checkout', 'Checkout / payment page');

    console.log('');
    console.log('  All steps complete!');

    var allPages2 = context.pages();
    for (var i = 0; i < allPages2.length; i++) {
      try { await allPages2[i].close(); } catch (e) {}
    }
  }
}
