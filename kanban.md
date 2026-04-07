# Kanban

## Todo

### Localization (P0 - audit may fail)
- [ ] Origin/destination input selectors only cover ko-kr + en-us placeholders. Other locales rely on `data-selenium` fallback. Add locale placeholder texts or verify `data-selenium` always exists.
- [ ] Date title verification hardcoded to Korean "가는 날". Non-Korean locales may miss the retry logic when date selection fails.
- [ ] Search button selectors only cover ko-kr + en-us text. Other locales rely on `data-element-name` fallback.

### Localization (P1 - audit runs but data may be wrong)
- [ ] Cabin class labels only have Korean + English. Missing locale labels: fr "Economique", de "Economy", es "Economica", ja "エコノミー", etc.
- [ ] DOB/expiry month names may not match for Russian (genitive case), Thai, Vietnamese, Malay, Indonesian display formats
- [ ] Phone country code dropdown not auto-selected. If Agoda defaults to wrong country code per locale, the phone number may be invalid.

### Localization (P2 - cosmetic)
- [ ] Hotel flow (agoda-hotel-ol.js) has no PAX name localization

### Features
- [ ] Build Bcom hotel OL flow (Priority: Medium)
- [ ] Build Expedia hotel OL flow (Priority: Medium)
- [ ] Build Trip hotel OL flow (Priority: Medium)
- [ ] Build Bcom flight OL flow (Priority: Low)
- [ ] Build Expedia flight OL flow (Priority: Low)
- [ ] Build Trip flight OL flow (Priority: Low)
- [ ] Add H5 (mobile web) viewport support (Priority: Medium)
- [ ] Build bundle booking flow (Priority: Low)
- [ ] Add side-by-side comparison view (Priority: Medium)
- [ ] Add error recovery and partial results for failed audits (Priority: Low)
- [ ] Preserve historical audit runs instead of overwriting (Priority: Low)

## In Progress

## Done
- [x] Add zh-hk and ru-ru locale support (locale map, lang IDs, UI dropdowns, PAX data, month names, South Korea terms)
- [x] Fix North Korea selected instead of South Korea (fr, de, es, vi, ru). Use specific terms: "Corée du Sud", "South Korea", etc.
- [x] Fix calendar month navigation hardcoded Korean. Now locale-aware (e.g. "mai 2026" for fr-fr)
- [x] Add locale-specific PAX names (Jean Dupont for fr-fr, Taro Yamada for ja, etc.)
- [x] Fix fill-in page: passport number, issuing country, nationality, passport expiry using data-element-name selectors
- [x] Remove keyboard.type() for combobox selection (caused field corruption). Use scroll-and-click approach.
- [x] Fix DOB year overwrite by passport expiry (container scoping)
- [x] Fix French date field order (position-agnostic month detection)
- [x] Add language/currency selectors to UI and pass to flow
- [x] Fix URL locale rewriting (was only replacing en-us, now replaces any locale)
- [x] Dashboard UI redesign (workflow steps, collapsible panels, guide drawer)
- [x] Fix Agoda flight OL flow Step 4: flight card selection
- [x] Set up project (Express server, Playwright, web dashboard)
- [x] Build BaseFlow class with full-page screenshot capture
- [x] Build Agoda hotel OL flow (6 steps, end to end)
- [x] Build Agoda flight OL flow Steps 1-3 (search, date selection, results)
- [x] Implement session management (login via persistent Chrome profiles)
- [x] Implement language/currency setup via browser
- [x] Build results gallery with step cards
- [x] Build lightbox viewer (zoom, pan, download)
- [x] Add zip download for audit screenshots
- [x] Replace dropdowns with icon toggles (Platform, Flow)
- [x] Add conditional form fields (hotel vs flight inputs)
- [x] Add audit status polling and progress display
- [x] Add server-side audit logging
- [x] Write PRD synced to current build
