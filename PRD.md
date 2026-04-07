# PRD: UX Audit Tool

**Last updated:** 2026-04-07
**Status:** In Development (v1.2 - Dashboard UX + Feedback + Sharing)

---

## 1. Problem Statement

UX audits of OTA booking flows require manually screenshotting every step (search, results, detail, checkout) across multiple competitors, platforms, and locales. This takes hours and must be repeated whenever the UI changes.

This tool automates the screenshot capture. It walks through each booking step using a real browser and saves full-page screenshots. The output is a shareable web page where teammates can view and compare flows side by side.

Built for a Product Growth Manager benchmarking global OTAs (Agoda, Bcom, Expedia, Trip) across multiple regional markets.

## 2. Goals

- Reduce OTA booking flow screenshot capture from hours to minutes
- Support hotel and flight booking flows across desktop (OL) and mobile web (H5)
- Cover 4 OTAs: Agoda, Bcom, Expedia, Trip
- Support 14 locales for multi-market UX comparison
- Produce shareable output that non-technical colleagues can browse
- Preserve logged-in state so screenshots reflect the real user experience (pricing, locale)

## 3. Features

### Implemented

- **Web dashboard** (localhost:3200) - Single-page app with a guided workflow: Session Setup > Run Audit > Results
- **Session management** - Open browser for manual OTA login; persistent Chrome profiles saved per OTA so login state carries over to audits
- **Multi-locale support** - 14 languages supported: ko-kr, ja, th, zh-cn, zh-tw, zh-hk, ru, fr, de, es, vi, id, ms, en-us. Language and currency selectors in the audit form control which locale the site loads in.
- **Automated locale setup** - Before each audit, the tool navigates to Agoda's language/currency picker and selects the target locale. Combined with URL rewriting, this ensures the site renders in the correct language and currency.
- **URL locale rewriting** - Playwright route interception rewrites all Agoda page navigation URLs to force the selected locale (replaces locale path segments, query params, and language IDs).
- **Locale-specific PAX data** - Passenger names and phone numbers vary by language setting (e.g., "Jean Dupont" for fr-fr, "Taro Yamada" for ja) for natural-looking fill-in pages.
- **Runtime-adaptive form filling** - Fill-in page fields (gender, nationality, issuing country, dates) are detected at runtime using `data-element-name` attributes and position-agnostic layout detection, rather than per-locale hardcoded selectors. Works across all supported locales.
- **Agoda hotel OL flow** - Full 6-step automation: home > search > results > hotel detail > room selection > checkout. Working end to end.
- **Agoda flight OL flow** - 7-step automation: home > search > results > flight detail > booking page > passenger info (fill-in) > checkout. Working end to end. Includes passport, nationality, issuing country, DOB, and expiry fields.
- **Full-page screenshots** - Each step captured as a full-page PNG with sticky/fixed elements repositioned to avoid overlap
- **Screenshot metadata** - Each audit saves `_meta.json` with timestamps, params, step names, and page URLs
- **Results gallery** - Horizontal card grid showing all captured steps per audit, with step numbers and names
- **Lightbox viewer** - Click any screenshot to open a zoomable lightbox with scroll-to-zoom, drag-to-pan, zoom slider, and download button
- **Zip download** - Download all screenshots for an audit as a single zip file
- **Icon-based UI toggles** - Platform (OL/H5) and Flow (Flight/Hotel/Bundle) use icon buttons instead of dropdowns
- **Conditional form fields** - Hotel fields (destination, check-in, check-out) and flight fields (departure airport, arrival airport, departure date, cabin class) toggle based on flow selection
- **Locale-aware calendar navigation** - Calendar month labels are generated in the correct language (e.g., "mai 2026" for French, "2026년 5월" for Korean) so date selection works across all locales
- **Audit status polling** - Dashboard polls server during audit runs and shows progress status
- **Audit logging** - Server-side log file (`audit.log`) with API endpoint to retrieve last 200 lines
- **Automated locale testing** - `node test-locales.js` runs the flight audit across all 12 non-English locales sequentially, verifying that screenshots were captured and that page URLs contain the correct locale and currency
- **CLI login script** - `node login.js <ota>` for terminal-based session setup
- **Language-currency auto-linking** - Selecting a language in the audit form auto-selects the matching currency (e.g. ko-kr selects KRW). Visual flash confirms the change.
- **Session status badge** - Green "Logged in" or red "Not logged in" badge visible in the Session Setup header even when collapsed.
- **Improved audit progress UI** - Run Audit button shows a spinner while running. Status bar displays current step name with animated indicator.
- **Feedback system** - Built-in feedback panel where users can report bugs, locale issues, suggestions, or questions. Each entry can optionally attach the current audit context (OTA, flow, language, currency). Entries can be resolved or deleted. Data stored in `feedback.json`.
- **ngrok sharing** - Tool can be shared with colleagues via ngrok tunnel, exposing localhost to a public URL. Feedback feature works through the tunnel.
- **Updated "How to use" guide** - Step-by-step instructions updated to reflect auto-linking, locale cookie setup, and time estimates.
- **DOB fixed to 1990-01-01** - Passenger date of birth is always 1990-01-01 to avoid accidental future dates.
- **Passport expiry container safety** - If passport expiry container is not found on the page, the fill is skipped entirely instead of falling back to page-wide search (which could overwrite DOB fields).
- **Currency re-set logic** - After navigation, if Agoda overwrites the currency cookie, the tool re-sets the cookie and reloads. Falls back to UI picker if needed.

### Planned / Not Yet Built

- **Bcom OL flows** - Hotel and flight booking flows for Bcom
- **Expedia OL flows** - Hotel and flight booking flows for Expedia
- **Trip OL flows** - Hotel and flight booking flows for Trip
- **H5 (mobile web) support** - Mobile viewport flows for all OTAs. UI toggle exists but is disabled ("coming soon")
- **Bundle booking flow** - Combined flight + hotel flow. UI toggle exists but is disabled ("coming soon")
- **Side-by-side comparison view** - Compare the same booking step across multiple OTAs
- **Figma plugin (v2)** - Auto-export screenshots into Figma for design review

### Known Issues

- **Currency cookie overwrite** - Agoda's server sometimes overwrites the CurLabel cookie value after navigation. The tool now re-sets the cookie and reloads, with a UI picker fallback, but this is not 100% reliable.
- **Passport expiry month selection** - The month combobox for passport expiry sometimes fails to select correctly.
- **CurLabel persistence varies by locale** - Some locales hold the currency cookie better than others.

## 4. Supported Locales

| Language | Code | Currency | PAX Name |
|----------|------|----------|----------|
| Korean | ko-kr | KRW | Minjun Kim |
| Japanese | ja | JPY | Taro Yamada |
| Thai | th | THB | Somchai Suksri |
| Chinese (Simplified) | zh-cn | CNY | Wei Zhang |
| Chinese (Traditional) | zh-tw | TWD | Wei Chen |
| Chinese (Hong Kong) | zh-hk | HKD | Wing Chan |
| Russian | ru | RUB | Ivan Petrov |
| French | fr | EUR | Jean Dupont |
| German | de | EUR | Hans Mueller |
| Spanish | es | EUR | Carlos Garcia |
| Vietnamese | vi | VND | Minh Nguyen |
| Indonesian | id | IDR | Budi Santoso |
| Malaysian | ms | MYR | Ahmad Ibrahim |
| English | en-us | USD | John Smith |

## 5. Adding a New Locale (Checklist)

When adding support for a new language/currency, update these files:

1. **`flows/agoda-locale-setup.js`**
   - Add the language code and Agoda numeric ID to `LANG_IDS` (e.g. `'pt-br': 20`)
   - Find the correct ID by inspecting `agoda.version.03` cookie while browsing Agoda in that language

2. **`flows/agoda-flight-ol.js`**
   - Add locale to `AGODA_LOCALES` mapping (language code to Agoda URL path segment)
   - Add locale to `AGODA_LANG_IDS` mapping
   - Add PAX data (name, phone) to the `paxByLang` object
   - Add calendar month names to `monthNamesMap` (array of 13 items, index 0 is null)
   - Add South Korea search terms in the new language to `southKoreaTerms`
   - If the date format differs (e.g. DD/MM/YYYY vs YYYY/MM/DD), verify `fillDateGroup` handles the new placeholder patterns

3. **`flows/agoda-hotel-ol.js`**
   - Add locale to `AGODA_LOCALES` mapping
   - Add locale to `AGODA_LANG_IDS` mapping
   - Add calendar month names if hotel flow uses date selection

4. **`public/index.html`**
   - Add language option to `#audit-language` dropdown
   - Add currency option to `#audit-currency` dropdown (if new currency)

5. **`public/app.js`**
   - Add language-to-currency mapping in `LANG_CURRENCY_MAP`

6. **`test-locales.js`**
   - Add the locale to the `LOCALES` array for automated testing

7. **Verify**
   - Run `node test-locales.js` and confirm the new locale passes
   - Manually check screenshots for correct language rendering and currency display
   - Check that the calendar month navigation works in the new language
   - Check that nationality/issuing country selects correctly

## 6. Out of Scope

- Native app (iOS/Android) screenshot capture
- Actual booking completion (flows stop at checkout, no payment)
- AI-powered UX analysis
- Korean local OTA competitors (Yanolja, Goodchoice, etc.)
- Multi-user / deployed server (runs locally only)

## 7. Open Questions

- ~~**Flight card interaction**: Resolved. Agoda flight cards use a two-step pattern: click card to expand, then click select button.~~
- ~~**Locale mismatch**: Resolved. Automated locale setup + URL rewriting ensures the correct language and currency are applied.~~
- **Error recovery**: If a flow fails mid-run (e.g., Chrome crashes, element not found), the audit silently fails. Should there be partial results or retry logic?
- **Multiple audits per flow**: Currently each run overwrites the previous screenshots for that OTA/platform/flow combination. Should historical runs be preserved?
- **Comparison layout**: No design exists yet for the side-by-side comparison view. How should it handle different step counts across OTAs?

## 8. Success Metrics

- A complete Agoda hotel OL audit runs in under 2 minutes with all 6 steps captured
- A complete Agoda flight OL audit runs in under 2 minutes with all 7 steps captured
- All 12 non-English locales pass the automated locale test (correct language and currency in page URLs)
- Screenshots are accurate: each step shows the correct page state without visual artifacts
- Non-technical teammates can open the web dashboard and browse results without help
