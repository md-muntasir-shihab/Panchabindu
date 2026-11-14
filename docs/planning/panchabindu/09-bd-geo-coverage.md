# 09 — বাংলাদেশ জিও কভারেজ (জেলা / উপজেলা / থানা)

**তারিখ:** 2026-11-13 · **ধরন:** ডেটা সোর্স + পুনরুৎপাদন নোট

কাস্টমার চেকআউটে এবং অ্যাডমিন স্মার্ট অর্ডার এন্ট্রিতে জেলা → উপজেলা/থানা ক্যাসকেড এখন পুরো বাংলাদেশ কভার করে, যাতে যেকোনো জেলা/থানার কাস্টমার নিজের ঠিকানা নির্বাচন করে অর্ডার করতে পারে।

## 1. যা আছে

| স্তর | সংখ্যা | সোর্স | আইডি স্কোপ |
|---|---|---|---|
| বিভাগ | 8 | bdAddresses hierarchy snapshot (MIT) | district-এ `division_id` |
| জেলা | 64 | bdAddresses snapshot (আগের nuhil dataset-এর সঙ্গে মিলিয়ে যাচাই করা) | ১–৬৪ (অপরিবর্তিত, পুরনো অর্ডার বৈধ থাকে) |
| সরকারি উপজেলা | 499 | bdAddresses snapshot (494, ২০২২ baseline) + NICAR ১২০তম সভায় ২০২৬-০৫-০৭ অনুমোদিত ৫টি | ১–৪৯৯ |
| মেট্রোপলিটন থানা | 108 | bdAddresses snapshot | ৫০০০+ |
| **ডেলিভারি ডেস্টিনেশন (মোট)** | **607** | উপরের দুটো একসাথে | — |

নতুন ৫টি উপজেলা (NICAR, ২০২৬-০৫-০৭; সূত্র: Cabinet Division / প্রথম আলো, Daily Star, bdnews24):

| id | উপজেলা | জেলা | যে উপজেলা ভেঙে হয়েছে |
|---|---|---|---|
| 495 | মোকামতলা (Mokamtola) | বগুড়া (14) | শিবগঞ্জ |
| 496 | মাতামুহুরী (Matamuhuri) | কক্সবাজার (9) | চকরিয়া |
| 497 | রুহিয়া (Ruhia) | ঠাকুরগাঁও (58) | সদর |
| 498 | ভুল্লী (Bhulli) | ঠাকুরগাঁও (58) | সদর |
| 499 | চন্দ্রগঞ্জ (Chandraganj) | লক্ষ্মীপুর (7) | সদর |

মেট্রোপলিটন থানা (১০৮টি) আলাদা `is_metropolitan_thana: true` ফ্ল্যাগ নিয়ে একই তালিকায় থাকে, কারণ সিটি এলাকার কাস্টমার উপজেলার বদলে থানার নামেই নিজের ঠিকানা দেয় (ধানমন্ডি, গুলশান, কোতোয়ালি ইত্যাদি)। ঢাকা জেলায় এখন ৫টি উপজেলা (সাভার, ধামরাই, কেরানীগঞ্জ, নবাবগঞ্জ, দোহাড়) **এবং** ৫০টি মেট্রো থানা — দুটোই নির্বাচনযোগ্য।

## 2. কোথায় ব্যবহৃত হয়

- `artifacts/panchabindu/src/components/storefront/checkout-client.tsx` — চেকআউটে জেলা → থানা, সাথে থানার নাম দিয়ে সার্চ (৫০০+ আইটেম স্ক্রল না করে)।
- `artifacts/panchabindu/src/components/storefront/account-client.tsx` — ঠিকানা বই।
- `artifacts/panchabindu/src/components/admin/admin-erp-client.tsx` — স্মার্ট অর্ডার এন্ট্রি ও অর্ডার এডিট।
- `artifacts/api-server/imported/src/lib/validators/index.ts` — সার্ভার-সাইড ভ্যালিডেশন (`evaluateAddressQuality`, `createOrderInputSchema`): জেলা-থানা মিল না থাকলে অর্ডার রিজেক্ট।
- `artifacts/api-server/imported/src/lib/db/repository.ts`, `phase3/4a/4b/5/6` — অর্ডার, কুরিয়ার ও প্রিন্ট লেবেলে জেলা/থানার নাম।

## 3. রি-জেনারেশন (হাতে কোনো জিও সারি লেখা নিষিদ্ধ)

```bash
# ১. ভেটেড স্ন্যাপশট নামান (MIT লাইসেন্স)
curl -sL https://raw.githubusercontent.com/mn-sakib/bdAddresses/main/bangladesh_address_hierarchy_2026-10-16.json -o /tmp/bd-hierarchy.json

# ২. অ্যাপ + JSON + SQL seed একসাথে জেনারেট
node scripts/src/generate-bd-geo.mjs /tmp/bd-hierarchy.json
```

স্ক্রিপ্ট একই কনটেন্ট চার জায়গায় লেখে, তাই কপিগুলো আলাদা হয়ে যেতে পারে না:

1. `artifacts/api-server/imported/src/lib/geo/bd-geocode.ts` (সার্ভার)
2. `artifacts/panchabindu/src/lib/geo/bd-geocode.ts` (ফ্রন্টএন্ড; বাইট-বাই-বাইট একই)
3. `artifacts/api-server/supabase/geo/{districts,upazilas,thanas}.json`
4. `artifacts/api-server/supabase/seed.sql` (district/upazila INSERT ব্লক)

`artifacts/api-server/imported/src/lib/geo/bd-geocode.test.ts` কপিগুলোর সমতা, ৬৪ জেলার কভারেজ, নতুন ৫ উপজেলা, পুরনো আইডি স্থিরতা এবং ঢাকার মেট্রো থানা যাচাই করে। সুইট: `pnpm --filter @workspace/scripts run test:domain`।

## 4. ডেটাবেস

- `supabase/migrations/0011_geo_thana_expansion.sql` — `upazilas.is_metropolitan_thana` কলাম + ইনডেক্স, নতুন ৫ উপজেলা, এবং থানা আইডি ৫০০০-এর নিচে না নামার গার্ড। এটি শুধু যোগ করে, কোনো বিদ্যমান আইডি বদলায় না।
- `seed.sql` পুনরায় চালালে ৬০৭টি সারি `ON CONFLICT (id) DO UPDATE` দিয়ে আপডেট হয়।
- note: `districts`/`upazilas` টেবিল বর্তমানে runtime document persistence-এ ব্যবহার হয় না (রেফারেন্স ডেটা); চেকআউটের উৎস হলো `bd-geocode.ts`।

## 5. এখনো নেই

- **ইউনিয়ন পরিষদ (৪,৫৪০)** ও **ডাকঘর/পোস্টকোড (১,৩৪৯)** — কুরিয়ার ঠিকানা ও ডাকযোগে পাঠানোর ক্ষেত্রে দরকার হলে একই স্ক্রিপ্টে যোগ করা যাবে (স্ন্যাপশটে ডেটা আছে)। এখন ঠিকানা `বাড়ি/রোড/এলাকা + ল্যান্ডমার্ক` ফিল্ডে নেওয়া হয়।
- থানা/উপজেলা অনুযায়ী আলাদা ডেলিভারি চার্জ — এখন জেলা-ভিত্তিক (`getDistrictDeliveryRates`), অ্যাডমিন override টেবিল আছে।
