# 10 — ভেন্ডর প্যানেল ও অ্যাডমিন নিয়ন্ত্রণ কনসোল

**তারিখ:** ২০২৬-১১-১৩ · **ধরন:** module map + API contract + permission matrix · **ভেরিফিকেশন:** `TESTED_LOCAL`

এই ধাপে কনসাইনমেন্ট ভেন্ডরের জন্য আলাদা সম্পূর্ণ প্যানেল এবং সুপার অ্যাডমিনের জন্য তার নিয়ন্ত্রণ কনসোল তৈরি হয়েছে। ভেন্ডর নিজের পণ্য, চালান, মূল্য প্রস্তাব, পেআউট, অর্ডার ও প্রোফাইল দেখতে/করতে পারে — কিন্তু অ্যাডমিন যা অনুমতি দিয়েছে ঠিক ততটুকুই, এবং প্ল্যাটফর্মের মার্জিন/লাভ/অন্য ভেন্ডরের ক্রয়মূল্য কখনো দেখতে পায় না।

## ১. দুই প্যানেল, এক ডেটা সোর্স

| স্তর | ভেন্ডর প্যানেল (`/vendor`) | অ্যাডমিন কনসোল (`/admin` → ভেন্ডর প্যানেল নিয়ন্ত্রণ) |
|---|---|---|
| কে ঢোকে | `roleSlug === 'vendor'` + প্রথম-লগইন গেট ক্লিয়ার | `super_admin` (অন্য রোল ৪০৩) |
| রুট | `GET /api/vendor/workspace`, `POST /api/vendor/{products,stock,price-proposals,payouts,profile,onboarding}` | `GET /api/admin/vendors`, `POST /api/admin/vendors` |
| গার্ড | `authenticateVendorRequest` (সেশন → রোল → গেট → Origin/CSRF) | `sessionActor` + `requireSuperAdmin` + `verifyOriginAndCsrf` |
| স্টেট | একই store পড়ে | `vendorControls` / `vendorRequests` লেখে |
| ক্লায়েন্ট ফাইল | `src/components/vendor/vendor-client.tsx`, `vendor-tabs.tsx` | `src/components/admin/vendor-control-panel.tsx` |

দুটো প্যানেলই **একই** `.data/erp-phase4b-store.json` ডকুমেন্ট ব্যবহার করে — নতুন runtime document যোগ করা হয়নি, কারণ Postgres-এর `erp_validate_runtime_documents` ঠিক ১০টি ডকুমেন্টে সীমাবদ্ধ।

## ২. মডিউল ম্যাপ

### সার্ভার (`artifacts/api-server/imported/src/lib/vendor/`)

| ফাইল | দায়িত্ব |
|---|---|
| `vendor-auth.ts` | প্রতিটি `/api/vendor/*` রুটের একক গার্ড; কখনো ক্লায়েন্ট-দেওয়া `vendorId` বিশ্বাস করে না |
| `vendor-workspace-service.ts` | ভেন্ডর-শুধু ডোমেইন লজিক: পণ্য তৈরি/সম্পাদনা, চালান, প্রস্তাব, পেআউট, প্রোফাইল অনুরোধ, ১৫-প্রশ্ন অনবোর্ডিং, রিড্যাক্টেড workspace DTO |
| `vendor-admin-service.ts` | অ্যাডমিন-শুধু ৫টি অপারেশন (তৈরি / আপডেট / অনুমতি / রিসেট / অনুরোধ সিদ্ধান্ত) + অডিট লগ |
| `vendor-control.ts` | ক্যাপাবিলিটি রেজিস্ট্রি, ডিফল্ট, নরমালাইজেশন, স্টোরেজ কী `phase4b.vendorControls` |
| `vendor-request-store.ts` | `listVendorRequests` / `appendVendorRequest` / `updateVendorRequest` / `findPendingRequest` |
| `vendor-routes.test.ts` | ৬টি `node:test` কেস — ৪০১/৪০৩/CSRF/cross-origin/ownership/capability/leak/scoping |

### রুট (`imported/app/api/`)

| রুট | মেথড | কাজ |
|---|---|---|
| `/api/vendor/workspace` | GET | পুরো প্যানেলের একক snapshot (profile, capabilities, escrow, products, orders, ledger, payouts, lots, proposals, scorecard, requests, categories, rules) |
| `/api/vendor/products` | POST | `upsert` (≤৩০ ভ্যারিয়েন্ট) ও `set_status` |
| `/api/vendor/stock` | POST | `dispatch_lot` (চালান জমা) |
| `/api/vendor/price-proposals` | POST | মূল্য প্রস্তাব |
| `/api/vendor/payouts` | POST | `{requestedAmountPoisha}` |
| `/api/vendor/profile` | POST | সবসময় **অনুরোধ** তৈরি করে, সরাসরি প্রোফাইল বদলায় না |
| `/api/vendor/onboarding` | POST | ১৫টি উত্তরের অনুরোধ |
| `/api/admin/vendors` | GET / POST | snapshot (vendors, requests, capabilityLabels, globalRules) / ৫টি অপারেশনের union |

`src/routes/imported.ts`-এ ৯টি রুটই রেজিস্টার্ড — রেজিস্ট্রেশন ছাড়া নতুন ফোল্ডার runtime-এ ৪০৪ দেয়।

### ক্লায়েন্ট

- `src/lib/vendor/vendor-types.ts` — DTO মিরর (`VendorWorkspaceDTO`, `AdminVendorControlSnapshot`, …)।
- `src/components/vendor/vendor-client.tsx` — লগইন গেট (প্রথম-লগইন পাসওয়ার্ড পরিবর্তন + TOTP এনরোলমেন্ট, নন-ভেন্ডর সেশন জোর করে লগআউট), ৮ ট্যাব নেভিগেশন (pending ব্যাজ), টোস্ট, সীমাবদ্ধতার নোট।
- `src/components/vendor/vendor-tabs.tsx` — ৮টি প্যানেল + `ProductEditor` (ভ্যারিয়েন্ট সারি, মার্জিন/কস্ট ভ্যালিডেশন)।
- `src/components/admin/vendor-control-panel.tsx` — ৩টি সাব-ট্যাব (`directory` / `permissions` / `requests`), ৪টি KPI, অনুমতি টগল, "ভেন্ডর এখন যা দেখবে" প্রিভিউ।
- `admin-erp-client.tsx` — নতুন `vendor_control` ট্যাব শুধু `isSuperAdmin`-এ দৃশ্যমান; `operational-help-modal.tsx`-এ সহায়িকা যুক্ত।

## ৩. অনুমতি ম্যাট্রিক্স

| ক্যাপাবিলিটি | ডিফল্ট | বন্ধ থাকলে |
|---|---|---|
| `canCreateProduct` | চালু | নতুন পণ্য ৪০০ |
| `canEditProduct` | চালু | নিজের পণ্য সম্পাদনা ৪০০ |
| `canChangeProductStatus` | চালু | publish/unpublish ৪০০ |
| `canSubmitConsignmentLot` | চালু | চালান জমা ৪০০ |
| `canSubmitPriceProposal` | চালু | প্রস্তাব ৪০০ |
| `canRequestPayout` | চালু | পেআউট অনুরোধ ৪০০ |
| `canEditProfile` | চালু | প্রোফাইল অনুরোধ ৪০০ |
| `canEditPayoutProfile` | চালু | পেআউট অ্যাকাউন্ট পরিবর্তনের অনুরোধ ৪০০ |
| `canSubmitOnboardingAnswers` | চালু | অনবোর্ডিং অনুরোধ ৪০০ |
| `maxActiveProducts` | `0` (সীমাহীন) | সীমা ছাড়ালে নতুন সক্রিয় পণ্য ৪০০ |

**যা কখনোই ভেন্ডর পায় না (সার্ভার-সাইডে রিড্যাক্ট, টেস্টে যাচাইকৃত):** `platformMargin*`, `estimatedNetProfit`, `internalVendorSku`, `snapSupplier*`, customer `customerPhone`/`customerName`/`streetAddress`, `payoutAccountNo` (শুধু `payoutAccountMasked`, যেখানে `•`), অন্য ভেন্ডরের ক্রয়মূল্য। ক্রস-ভেন্ডর রিসোর্সে **৪০৪**, ৪০৩ নয় — আইডি অনুমান করে তথ্য ফাঁস ঠেকাতে।

**স্ট্যাটাস:** `pending_onboarding` / `active` / `suspended` / `closing_audit` / `closed`। `suspended` হলে উপরের সব মিউটেশন ৪০০।

## ৪. অ্যাডমিন অপারেশন (সবই `.strict()` zod, কমিশন ০–৫০০০ bp, এসক্রো হোল্ড ১–৩০ দিন, ফোন `/^01[3-9]\d{8}$/`)

1. `create_vendor` — vendor + লিংকড ভেন্ডর ইউজার অ্যাকাউন্ট
2. `update_vendor` — নাম, যোগাযোগ, পেআউট, কমিশন, এসক্রো হোল্ড, স্ট্যাটাস
3. `set_capabilities` — আংশিক প্যাচ + ঐচ্ছিক `restrictionNoteBn` (ভেন্ডরের ব্যানারে দেখা যায়)
4. `reset_capabilities` — অ্যাডমিন ওভাররাইড **ও সীমাবদ্ধতার নোট** দুটোই মুছে ডিফল্টে ফেরায় (নাহলে পেআউট আবার চালু হলেও ব্যানার "পেআউট বন্ধ" দেখাত)
5. `decide_vendor_request` — `approve` / `reject` + নোট; `approve` করলে ভেন্ডরের প্রোফাইল আসলে বদলায়

প্রতিটি মিউটেশন `appendImmutableAuditLog`-এ যায় (`VENDOR_CAPABILITIES_UPDATED`, `VENDOR_CAPABILITIES_RESET`, …)।

## ৫. গার্ডের ক্রম (প্রতিটি রুটে একই)

`সেশন ৪০১ → Origin/CSRF ৪০৩ → actor ৪০১ → রোল ৪০৩ → body size ৪১৩ → zod ৪০০ → ডোমেইন ৪০০/৪০৪`

## ৬. স্থানীয় প্রমাণ (`TESTED_LOCAL`)

```
vendor-routes.test.ts                     6/6 pass
panchabindu `tsc --noEmit`                clean
api-server `tsc --noEmit`                 clean
`node ./build.mjs` + live server smoke    নিচের টেবিল
```

লাইভ সার্ভারে (local JSON sandbox, `.data/`) চালানো end-to-end দৃশ্য:

| দৃশ্য | ফল |
|---|---|
| অ্যাডমিন snapshot | `vendors: 3`, `capabilityLabels: 9`, `globalRules` উপস্থিত |
| ভেন্ডর workspace | ২০০; `payoutAccountMasked: •••••••1901`; leak grep negativo |
| CSRF ছাড়া ভেন্ডর POST | ৪০৩ |
| ভেন্ডর সেশন দিয়ে `/api/admin/vendors` | ৪০৩ |
| cross-origin POST | ৪০৩ |
| ৳১,০০০ পেআউট (সর্বনিম্ন ৳৫০০) | ৪০০ |
| `canRequestPayout: false` দেওয়ার পর পেআউট | ৪০০, "এই সুবিধাটি অ্যাডমিন বন্ধ রেখেছেন" |
| সীমাবদ্ধতার নোট | ভেন্ডরের workspace-এ সাথে সাথে দেখা যায় |
| প্রোফাইল অনুরোধ → অ্যাডমিন inbox → approve | ভেন্ডরের `businessNameBn` সত্যিই বদলায় |
| `reset_capabilities` | অনুমতি ও নোট দুটোই ফেরে |

## ৭. ইচ্ছাকৃতভাবে বাদ

- ভেন্ডর পণ্য **ডিলিট** বা ক্যাটাগরি ব্যবস্থাপনা — শুধু সুপার অ্যাডমিন।
- `adjustVariantStockWithReason` / `reviewConsignmentDispatchLot` — এরা `vendor` রোল গ্রহণ করে না, তাই ভেন্ডর রুট থেকে কখনো ডাকা হয় না।
- ভেন্ডর মিউটেশন `/api/admin/workspace`-এ রাউট করা হয়নি; `hasModulePermission`/`canAccessAdminWorkspace` দিয়ে গেট করা হয়নি।

## ৮. খোলা বিষয়

- `maxActiveProducts` সীমা শুধু নতুন সক্রিয় পণ্যে প্রয়োগ হয়; সীমা কমানো হলে পুরনো পণ্য নিজে থেকে unpublish হয় না।
- ভেন্ডর অ্যাটাচমেন্ট/ইমেজ আপলোড এখনো `/api/media`-এর সাধারণ পথেই, ভেন্ডর-নিজস্ব কোটা নেই।
- নোটিফিকেশন (SMS/ইমেইল) ভেন্ডর অনুরোধ সিদ্ধান্তের সময় পাঠানো হয় না — শুধু প্যানেলে দেখা যায়।
