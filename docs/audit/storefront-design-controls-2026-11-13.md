# Storefront design and Admin controls — November 13, 2026

The latest user request authorizes a more professional storefront and a review/fix of its Admin controls. This implementation extends the existing project after backend commit `6457547`; it does not replace the application. No new execution phases or code comments were added.

## Design changes

The existing warm neutral/forest palette remains the default. The storefront now uses a cleaner editorial hero with a working call to action and explicit banner controls, clearer section spacing, category image tiles sourced from real catalog items, ordered collection sections, refined product cards, a quieter footer and responsive header controls. Logo/name rendering is shared between header and footer. Long names and uploaded logos have bounded mobile dimensions. Missing product imagery uses a local neutral placeholder instead of a random external photograph. Motion reduction and visible keyboard focus are supported.

## Control coverage

Open **Admin → Super Admin Control Center → Store design & content**. The editor supports Bangla and English independently and publishes only after Save store changes. A link opens the saved storefront in a new tab.

| Storefront area | Admin control |
| --- | --- |
| Identity | Store names, taglines, uploaded logo or image URL, name/tagline visibility, bounded logo size |
| Browser/search identity | Favicon, home SEO titles/descriptions, social preview image; server page titles and manifest inherit the saved brand |
| Theme | Accessible dark accent colour used by storefront actions, highlights and theme tokens |
| Header | Editable ordered main menu, announcement visibility/text, support phone visibility |
| Hero | Multiple banners, bilingual copy, image/upload, badge, CTA label/link and manual slide selection |
| Home layout | Section enabled state, numeric order and bilingual titles; hero, service strip, categories, catalog, coupon banner, new arrivals and best sellers consume them |
| Catalog presentation | Collection heading/subtitle, product/category data through the existing Product Studio/category editors; no initial hardcoded BDT 8,000 price ceiling |
| Services | Editable highlights shared by homepage, product detail and contact page; no separate hardcoded seven-day-return/QC promises |
| Contact | Phone, email, WhatsApp, social links; existing Contact/About editor controls story, address and hours |
| Footer | Logo/name, bilingual story, ordered links, social links, copyright templates `{year}`/`{brand}`, bottom note, editable policy pages |
| Commercial controls | Existing catalog, stock/QC, shipping/free-delivery, active coupon and manual bKash editors remain authoritative |
| Maintenance | Existing maintenance switch plus bilingual maintenance messages |

Functional UI labels remain in the translation system. Application layout code, arbitrary scripts/HTML/CSS, security invariants and provider capabilities are not free-form marketing fields. Existing business prose containing a previous brand is editable in its corresponding content editor; historical order descriptions remain preserved.

## Persistence and validation

`update_storefront_content` is registered in the existing permission map and request schema. The service independently requires a cleared Super Admin, validates bounded structured content, strips unknown fields, writes settings and audit within the existing request transaction, and preserves financial/provider configuration. Script/protocol-relative/control-character URLs are rejected; duplicate section/link identifiers and light accents with insufficient white-text contrast are rejected. A promotional banner requires an active, unexpired saved coupon; this does not create a coupon or change its eligibility rules.

Logo/hero/social uploads use `/api/admin/brand-media`, protected by session, role, first-login, CSRF, origin, rate and streaming-size checks. JPEG/PNG/WebP inputs are decoded and re-encoded by the existing validated image processor. The server generates object paths in `public-catalog-media`, audits the upload and returns a URL for the draft. Saving publishes the content change. No configured Storage means an explicit unavailable response; the existing image-URL option remains available. An uploaded object can remain unused if a draft is discarded; this work does not implement orphan-asset collection.

The current PostgreSQL JSONB compatibility adapter persists the new settings without a new relational migration. It retains the limitations documented in the backend delivery. Public settings are constructed through an allowlist and the structured storefront schema; internal settings do not become public through this editor.

## Verification

| Check | Result |
| --- | --- |
| Application/tooling/PostgreSQL tests | 168/168 pass, including four new content/permission/persistence/metadata tests |
| TypeScript | Final check exit 0 |
| ESLint | Final full check exit 0; zero errors and four inherited image warnings |
| Production build | Final exit 0, guard enabled, no production credentials |
| HTTP | 21/21 pass, including persisted branding/menu/metadata/manifest, disabled hero, anonymous upload denial and failed-CSRF rejection |
| Browser/real device/physical upload | Not verified; environment startup blocker and no live Storage operations |

Evidence: `/tmp/panchagarh-backend-checks-c1pCrP/summary.json` and test logs (168 pass; a script variable-name lint error in that snapshot was subsequently fixed), `/tmp/storefront-final-lint.log`, `/tmp/storefront-final-tsc.log`, `/tmp/storefront-build-summary.json` (workspace `/tmp/panchagarh-storefront-build-0Z3DYs`), `/tmp/panchagarh-http-smoke-dZXgpu/summary.json`. Final lint and TypeScript were rerun after the variable correction and header sizing adjustments. All fixture writes are isolated; no source business data, real credentials or production services were used.

Browser visual/responsive acceptance is blocked: native Chromium exits during startup with `process_singleton_posix.cc:297`, `socket() failed: Operation not permitted`. A real mobile/desktop browser and actual configured Storage still require acceptance. No screenshot or live upload success is claimed.

No production migration, deployment, courier/payment action or GitHub push was performed. The connection previously reported no push permission. Delivery consists of a local commit and applicable Git patches.
