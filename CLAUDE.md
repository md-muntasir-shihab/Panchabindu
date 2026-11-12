# Project: পঞ্চগড় (PANCHAGARH) — Multi-Vendor Consignment F-Commerce

## 1. Overview
পঞ্চগড় (Panchagarh) হলো একটি Bangladesh-centric Multi-Vendor Consignment F-Commerce প্ল্যাটফর্ম।
- Business Model: Supplier কনসাইনমেন্ট ভিত্তিতে পণ্য সরবরাহ করে; পণ্য ডেলিভারি ও কালেকশনের পর Supplier Payable তৈরি হয়।
- Payment: শুধুমাত্র Cash on Delivery (COD) এবং Manual bKash (কোনো automated payment gateway নেই)।
- Courier: Pathao, Steadfast এবং Bangladesh Post (ম্যানুয়াল)।
- Roles (সর্বমোট ৪টি): Super Admin, Vendor/Supplier, Marketing Manager, Supply & Packaging Manager।
- Accounting: Double-entry balanced ledger ও internal liability tracking (Paisa-based integer math)।
- Design Lock: ৪টি সলিড কালার (`--color-bg`, `--color-surface`, `--color-border`, `--color-ink`, `--color-muted`)। জিরো-গ্রেডিয়েন্ট, জিরো-গ্লাস মরফিজম, নো-ইমোজি।

---

## 2. Mandatory Master Files (Source of Truth)
যেকোনো AI (Claude Code, Cursor, Windsurf, Copilot, Cline ইত্যাদি) কোড করার সময় বাধ্যতামূলকভাবে নিচের তিনটি ফাইল রেফারেন্স করবে:
1. `docs/00_CUSTOM_INSTRUCTION.md` — Pre-Setup Instructions, MCP/Skill Governance, Execution Protocol, ও Negative Prompt।
2. `docs/01_FRONTEND_MASTER_PROMPT.md` — Customer Storefront, UI Tokens, Responsive Layout, ও Order Tracking।
3. `docs/02_BACKEND_MASTER_PROMPT.md` — Admin Dashboard, Multi-Vendor Architecture, Financial Engine, ও Double-Entry Ledger।
4. `docs/schema.md` — Database Schema Single Source of Truth।

---

## 3. Strict Operating Rules (Controlled Autonomy)
- **Inspect → Plan → Approve → Build → Test → Report:**
  কোনো consequential action (নতুন ডিপেনডেন্সি, ডাটাবেস মাইগ্রেশন, স্কিমা পরিবর্তন, বাল্ক ডাটা এডিট) ব্যবহারকারীর স্পষ্ট অনুমতি ছাড়া নেওয়া যাবে না।
- **Never Assume Missing Specs:**
  কোনো রিকোয়ারমেন্ট অনুপস্থিত বা দ্ব্যর্থক হলে `VERIFY_REQUIRED` লিখবে। অনুমান করে ডাটাবেস ফিল্ড বা বিজনেস রুলস বানাবে না।
- **No Mock Fallbacks in Production:**
  কোনো ইন্টিগ্রেশনের ক্রেডেনশিয়াল না থাকলে স্পষ্টভাবে "Not Connected — Setup Guide" দেখাবে, ভুয়া সাফল্য দেখাবে না।

---

## 4. Financial & Data Integrity Rules (Non-Negotiable)
- **Pure Integer Poisha Math:**
  ডাটাবেস, API, ও স্টেট-এ টাকার হিসাব সবসময় পূর্ণসংখ্যায় পয়সায় (`1 BDT = 100 Poisha`)। কোনো ফ্লোটিং-পয়েন্ট (`float`, `double`) মান ব্যবহার করা সম্পূর্ণ নিষিদ্ধ।
- **3-Tier Pricing Formula:**
  - `Supplier Cost + Supplier Profit = Supplier Payable`
  - `Supplier Payable + Platform Margin = Final Sale Price`
- **Field-Level Role Isolation:**
  - Customer-facing স্টোরফ্রন্টে কখনো Supplier Cost, Supplier Profit, Platform Margin বা Vendor ID প্রকাশ পাবে না।
  - ভেন্ডর কখনো অন্য ভেন্ডরের ডাটা দেখতে পারবে না (RLS দিয়ে enforce)।
  - মার্কেটিং ম্যানেজার কখনো Supplier Cost বা Net Profit পাবে না।
- **Immutable Ledger:**
  - `vendor_ledger`, `courier_remittance_ledger`, এবং `audit_logs` কঠোরভাবে **Append-only**।
  - কখনো `UPDATE` বা `DELETE` চালানো যাবে না; সংশোধনের জন্য বিপরীতমুখী Reversal Entry দিতে হবে।
  - প্রতিটি জার্নালে `Total Debit = Total Credit` হতে হবে।

---

## 5. Negative Prompt (Strictly Forbidden)
1. **মার্কেটিং ট্র্যাকিং নিষিদ্ধ:**
   Facebook Pixel, TikTok Pixel, Google Analytics Marketing, Google Tag Manager কোনো অবস্থায় যুক্ত করা যাবে না।
2. **পেমেন্ট গেটওয়ে নিষিদ্ধ:**
   কোনো Credit/Debit Card গেটওয়ে, অটোমেটেড bKash Gateway SDK বা থার্ড-পার্টি গেটওয়ে যুক্ত করা যাবে না (শুধু COD ও Manual bKash)।
3. **পেইড সার্ভিস নিষিদ্ধ:**
   কোনো পেইড SaaS, পেইড CRM, বা সাবস্ক্রিপশন টুল বাধ্যতামূলক করা যাবে না (Free/Open-Source-First)।
4. **সিকিউরিটি লক:**
   কখনো সোর্স কোড বা ব্রাউজার বান্ডেলে কোনো সিক্রেট কি রাখা যাবে না।
5. **ডিজাইন লক:**
   কোনো Gradient, Glassmorphism, ভারী শ্যাডো, বা ডেকোরেটিভ ইমোজি UI-তে ব্যবহার করা যাবে না।
