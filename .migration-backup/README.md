# পঞ্চগড় (PANCHAGARH) — Multi-Vendor Consignment F-Commerce Platform

বাংলাদেশের মাল্টি-ভেন্ডর কনসাইনমেন্ট এফ-কমার্স ও মিনি-ইআরপি প্ল্যাটফর্ম (**পঞ্চগড় / Panchagarh**)।  
**Operating Principle:** Free/Open-Source-First · Security-First · Exact Integer Poisha Accounting · Strict 4-Role RBAC · Approval-Controlled Execution.

---

## ১. প্রজেক্ট সংক্ষিপ্ত পরিচিতি (Project Overview)

- **Business Model:** কনসাইনমেন্ট মডেল (Consignment Model) — ভেন্ডর/সাপ্লায়ার পণ্য সরবরাহ করে; অর্ডার ডেলিভারি, কুরিয়ার ক্যাশ রেমিট্যান্স এবং হোল্ড পিরিয়ড উত্তীর্ণ হওয়ার পর Supplier Payable পরিপক্ব (Mature) হয়।
- **Customer Payment Methods:** শুধুমাত্র **Cash on Delivery (COD)** এবং **Manual bKash (`bkash_manual`)**। কোনো থার্ড-পার্টি পেমেন্ট গেটওয়ে SDK সংযুক্ত নেই।
- **Courier Integrations:** **Pathao**, **Steadfast** এবং **Bangladesh Post (`bd_post`)** (সঙ্গে In-house/Manual dispatch)। ক্রেডেনশিয়াল না থাকলে সৎভাবে `NOT_CONNECTED` স্ট্যাটাস দেখায়।
- **Internal Staff Roles (4-Role Strict Lock):**
  1. `super_admin` — সম্পূর্ণ সিস্টেম ও মার্জিন নিয়ন্ত্রণ
  2. `vendor` — নিজস্ব প্রোডাক্ট, অর্ডার লাইন (PII Masked) ও লেজার পোর্টাল
  3. `marketing_manager` — অর্ডার কনফার্মেশন, প্রমো ক্যাম্পেইন ও কাস্টমার মেসেজিং (কেনা দাম ও নেট প্রফিট গোপন)
  4. `packaging_manager` — পিকলিস্ট, থ্রি-পার্ট A4 প্রিন্ট ও কুরিয়ার বুকিং (কেনা দাম ও নেট প্রফিট গোপন)
- **Accounting Engine:** ১০০% ইন্টেজার পয়সা (`1 BDT = 100 Poisha`) এবং Immutable Append-Only Double-Entry Ledger।

---

## ২. ডকুমেন্টেশন ইনডেক্স (`/docs` Master & Architecture Deliverables)

| নথি (Document) | পাথ (Path) | উদ্দেশ্য (Purpose) |
|---|---|---|
| Custom Instruction | [`docs/00_CUSTOM_INSTRUCTION.md`](docs/00_CUSTOM_INSTRUCTION.md) | গভার্নেন্স, প্রি-সেটআপ, MCP পলিসি, এক্সিকিউশন প্রটোকল ও নেগেটিভ প্রম্পট |
| Frontend Master Prompt | [`docs/01_FRONTEND_MASTER_PROMPT.md`](docs/01_FRONTEND_MASTER_PROMPT.md) | কাস্টমার স্টোরফ্রন্ট স্পেসিফিকেশন ও ডিজাইন টোকেন নিয়ম |
| Backend Master Prompt | [`docs/02_BACKEND_MASTER_PROMPT.md`](docs/02_BACKEND_MASTER_PROMPT.md) | অ্যাডমিন ইআরপি, ডাটাবেস, ফিন্যান্স ও সিকিউরিটি স্পেসিফিকেশন |
| Canonical Database Schema | [`docs/schema.md`](docs/schema.md) | PostgreSQL / Supabase স্কিমা ও RLS পলিসি |
| Initial Assessment (Phase 00) | [`docs/architecture/initial-assessment.md`](docs/architecture/initial-assessment.md) | রিপোজিটরি অডিট, কমপ্লায়েন্স ম্যাট্রিক্স ও রিস্ক অ্যাসেসমেন্ট |
| System Architecture (Phase 01) | [`docs/architecture/system-architecture.md`](docs/architecture/system-architecture.md) | আর্কিটেকচার ডায়াগ্রাম, ট্রাস্ট বাউন্ডারি ও মডিউল ম্যাপ |
| Database ERD | [`docs/database/erd.md`](docs/database/erd.md) | ২৫টি টেবিলের এনটিটি রিলেশনশিপ ডায়াগ্রাম ও ইনভ্যারিয়েন্ট |
| Migration Log | [`docs/database/migration-log.md`](docs/database/migration-log.md) | ডাটাবেস মাইগ্রেশন হিস্ট্রি ও রোলব্যাক গাইড |
| API Contract | [`docs/api/api-contract.md`](docs/api/api-contract.md) | স্টোরফ্রন্ট ও অ্যাডমিন এপিআই এন্ডপয়েন্ট এবং Zod ভ্যালিডেশন |
| Security Model | [`docs/security/security-model.md`](docs/security/security-model.md) | ৪-রোল RBAC ম্যাট্রিক্স, PII মাস্কিং, 2FA ও ডিটিও স্যানিটাইজার |
| Ledger Design | [`docs/finance/ledger-design.md`](docs/finance/ledger-design.md) | ডাবল-এন্ট্রি লেজার, হোল্ডিং লায়াবিলিটি ও রিটার্ন ফল্ট ম্যাট্রিক্স |
| Courier Integration | [`docs/integrations/courier.md`](docs/integrations/courier.md) | Pathao, Steadfast ও BD Post অ্যাডাপ্টার ও ওয়েবহুক ভেরিফিকেশন |
| Backup & Restore Runbook | [`docs/runbooks/backup-restore.md`](docs/runbooks/backup-restore.md) | ডাটাবেস ব্যাকআপ, রিস্টোর ও রিকনসিলিয়েশন রানবুক |
| Deployment Runbook | [`docs/runbooks/deployment.md`](docs/runbooks/deployment.md) | প্রি-ডিপ্লয় চেকলিস্ট, এনভায়রনমেন্ট ভেরিয়েবল ও রোলব্যাক গাইড |
| Decision Log | [`docs/decisions/decision-log.md`](docs/decisions/decision-log.md) | আর্কিটেকচারাল ডিসিশন রেকর্ড (ADR-001 থেকে ADR-006) |
| QA Test Report | [`docs/qa/test-report.md`](docs/qa/test-report.md) | ৪৭টি অটোমেটেড ইউনিট ও ইন্টিগ্রেশন টেস্ট রিপোর্ট |

---

## ৩. লোকাল সেটআপ ও রান গাইড (Local Setup & Run)

### পূর্বশর্ত (Prerequisites)
- **Node.js:** v20+ বা v22+
- **npm:** v10+

### ইনস্টলেশন ও ডেভেলপমেন্ট সার্ভার চালু করা
```bash
# ১. ডিপেন্ডেন্সি ইনস্টল করুন
npm install

# ২. এনভায়রনমেন্ট ভেরিয়েবল ফাইল কপি করুন (কখনোই আসল চাবি গিটে কমিট করবেন না)
cp .env.example .env.local

# ৩. লোকাল ডেভেলপমেন্ট সার্ভার চালু করুন (Port 3000)
npm run dev
```

ব্রাউজারে ভিজিট করুন:
- **Customer Storefront:** `http://localhost:3000`
- **Admin ERP & Role Switcher:** `http://localhost:3000/admin`
- **Order Tracking:** `http://localhost:3000/track`

---

## ৪. টেস্ট, লিন্ট ও বিল্ড কমান্ড (Verification Commands)

```bash
# সম্পূর্ণ ইউনিট ও ইন্টিগ্রেশন টেস্ট স্যুট রান করুন (১০টি টেস্ট ফাইল, ৪৭টি টেস্ট কেস)
npx --yes tsx --test --test-concurrency=1 \
  src/lib/money.test.ts \
  src/lib/validators.test.ts \
  src/lib/db/repository.test.ts \
  src/lib/db/product-sync.test.ts \
  src/lib/admin/phase4a.test.ts \
  src/lib/admin/phase4b.test.ts \
  src/lib/admin/phase4c.test.ts \
  src/lib/admin/phase5.test.ts \
  src/lib/admin/phase6.test.ts \
  src/lib/admin/phase7.test.ts

# ইএসলিন্ট ও টাইপ চেক
npm run lint

# প্রোডাকশন বিল্ড যাচাই
npm run build
```
