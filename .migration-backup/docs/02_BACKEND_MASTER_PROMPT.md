# BACKEND MASTER PROMPT
## পঞ্চগড় (PANCHAGARH)
### Multi-Vendor Consignment F-Commerce Platform
### Admin Dashboard + Backend Architecture + Financial Control System
**বাংলাদেশ | Production-Ready | Security-First | Free/Open-Source-First**

---

# ১. ROLE & PROJECT OBJECTIVE

তুমি একজন Principal Backend Architect, Database Architect, Financial Systems Engineer, Security Engineer এবং Enterprise Admin Dashboard Designer।

তোমার দায়িত্ব হলো বাংলাদেশের Multi-Vendor Consignment F-Commerce ব্যবসা **পঞ্চগড় (Panchagarh)**-এর জন্য সম্পূর্ণ Backend System এবং Admin Dashboard তৈরি করা।

এটি শুধু একটি সাধারণ E-Commerce Backend নয়। এটি একটি পূর্ণাঙ্গ Business Operations System, যেখানে থাকবে:

- Multi-Vendor Management
- Consignment Inventory
- Product & Catalog Management
- Order Management
- Warehouse & Packaging
- Courier Management
- COD Collection
- Manual bKash Verification
- Supplier Payable
- Escrow-style Financial Ledger
- Supplier Settlement
- Fraud Prevention
- Customer Management
- Marketing Content Management
- Reports & Reconciliation
- Role-Based Access Control
- Complete Audit Trail
- Security & Backup Management

প্রধান লক্ষ্য হলো একটি নির্ভরযোগ্য, নিরাপদ, সম্প্রসারণযোগ্য এবং বাস্তব ব্যবসায় ব্যবহারযোগ্য System তৈরি করা।

**গুরুত্বপূর্ণ:** Frontend Master Prompt ইতোমধ্যে তৈরি হয়েছে। এই Backend অবশ্যই সেই Frontend-এর Design Tokens, API Contract, Product Data, Pricing Structure, Order Flow এবং Customer Experience-এর সঙ্গে সামঞ্জস্যপূর্ণ হবে।

# ২. BUSINESS MODEL — NON-NEGOTIABLE RULES

## ২.১ Multi-Vendor Consignment Model

ব্যবসাটি Consignment ভিত্তিতে পরিচালিত হবে।

- একাধিক Vendor/Supplier থাকবে।
- Supplier পণ্য সরবরাহ করবে।
- Platform পণ্য বিক্রি ও Customer Order পরিচালনা করবে।
- অগ্রিম Supplier Payment বাধ্যতামূলক নয়।
- পণ্য বিক্রি ও Collection সম্পন্ন হলে Supplier Payable তৈরি হবে।
- Supplier Settlement অনুমোদিত Finance Workflow অনুসারে হবে।

## ২.২ Financial Formula

প্রতিটি Product Variant/Supplier Offer-এর জন্য:

`Supplier Cost + Supplier Profit = Supplier Payable`

`Supplier Payable + Platform Margin = Final Sale Price`

অর্থাৎ:

`Final Sale Price = Supplier Cost + Supplier Profit + Platform Margin`

সব হিসাব BDT Paisa-তে সংরক্ষণ করতে হবে।

উদাহরণ:

| বিষয় | Amount |
|---|---:|
| Supplier Cost | ৳700 |
| Supplier Profit | ৳100 |
| Supplier Payable | ৳800 |
| Platform Margin | ৳200 |
| Final Sale Price | ৳1,000 |

এটি শুধু হিসাব বোঝানোর উদাহরণ, বাস্তব Product Pricing নয়।

### গুরুত্বপূর্ণ নিয়ম

- Supplier Cost Customer দেখতে পারবে না।
- Supplier Profit Customer দেখতে পারবে না।
- Platform Margin Customer দেখতে পারবে না।
- Internal Net Profit Public API-তে পাঠানো যাবে না।
- Vendor অন্য Vendor-এর Financial Data দেখতে পারবে না।
- Supplier Payment হওয়ার আগে সংশ্লিষ্ট Liability Ledger-এ থাকতে হবে।

Discount থাকলে কোন পক্ষ Discount-এর খরচ বহন করবে, সেটি আলাদা অনুমোদিত Pricing Rule-এ সংরক্ষণ করতে হবে। অনুমতি ছাড়া Supplier Payable কমানো যাবে না।

## ২.৩ Payment Methods

**🔴 Core**

শুধু:

1. Cash on Delivery (COD)
2. Manual bKash Payment

কোনো Payment Gateway থাকবে না।

Manual bKash Payment-এর ক্ষেত্রে:

- Configurable bKash Number
- Payment Instructions
- Sender Mobile Number
- TrxID
- Amount
- Submission Timestamp
- Verification Status
- Verified By
- Verification Time
- Rejection Reason
- Supporting Evidence (ঐচ্ছিক)

Payment নিজে থেকে Verified হবে না।

## ২.৪ Courier Methods

**🔴 Core**

- Pathao
- Steadfast
- Bangladesh Post

Pathao এবং Steadfast-এর Merchant API ব্যবহার করা যাবে যদি সংশ্লিষ্ট Merchant Account, Credentials এবং বর্তমান Official API Documentation পাওয়া যায়।

Bangladesh Post-এর জন্য কোনো API আছে বলে ধরে নেওয়া যাবে না। API যাচাই না হওয়া পর্যন্ত Manual Booking ও Tracking Workflow রাখতে হবে।

## ২.৫ Internal Roles

সর্বমোট চারটি Role:

1. Super Admin
2. Vendor / Supplier
3. Marketing Manager
4. Supply & Packaging Manager

অপ্রয়োজনীয় Fifth Role তৈরি করবে না।

---

# ৩. TECHNOLOGY ARCHITECTURE

## ৩.১ Primary Stack

- Next.js App Router — Frontend-compatible application architecture
- TypeScript — Strict Mode
- PostgreSQL — Primary Relational Database
- Supabase — Auth, PostgreSQL এবং Storage, Existing Project Compatibility অনুযায়ী
- Supabase RLS — Database-level Authorization
- Zod — Input Validation
- React Hook Form — Admin Forms
- Tailwind CSS — Frontend-compatible Design Tokens
- Open-source UI Components
- SQL Migrations — Version-controlled Schema
- Automated Database Testing

কোনো Paid-by-default SaaS বাধ্যতামূলক করা যাবে না।

## ৩.২ Architecture Principles

1. Modular Monolith দিয়ে শুরু করবে।
2. অপ্রয়োজনীয় Microservices তৈরি করবে না।
3. Business Logic Database ও Server-side Layer-এ থাকবে।
4. UI Component-এ Financial Logic রাখা যাবে না।
5. সব গুরুত্বপূর্ণ Financial Operation Transactional হবে।
6. সব গুরুত্বপূর্ণ Mutation Audit Log তৈরি করবে।
7. Data Access Layer (DAL) ব্যবহার করবে।
8. Frontend সরাসরি Privileged Database Access পাবে না।
9. Business Rule একাধিক জায়গায় Duplicate করবে না।
10. Database Constraint এবং Application Validation দুটোই ব্যবহার করবে।

## ৩.৩ Logical Architecture

```text
CUSTOMER STOREFRONT
        |
        v
PUBLIC API / SERVER ACTIONS
        |
        v
APPLICATION / BUSINESS LOGIC
        |
        +----------------------+
        |                      |
        v                      v
DATABASE ACCESS LAYER     INTEGRATION LAYER
        |                      |
        v                      +---- Pathao
    PostgreSQL                 +---- Steadfast
        |                      +---- Bangladesh Post
        |                      +---- Manual bKash
        |
        +---- RLS
        +---- Inventory
        +---- Orders
        +---- Financial Ledger
        +---- Audit Logs
        +---- Reporting

ADMIN DASHBOARD
        |
        v
AUTHENTICATION + RBAC
        |
        v
PROTECTED ADMIN API
        |
        v
BUSINESS LOGIC
        |
        v
POSTGRESQL
```

---

# ৪. DATABASE ARCHITECTURE

Database হবে System-এর Single Source of Truth।

Database Design করার আগে Existing Schema Inspect করবে। নতুন Table তৈরি করার সময় Existing Table, Data বা API ভেঙে দেওয়া যাবে না।

নিচের Table Names হলো প্রস্তাবিত Logical Schema। Existing Schema-এর সঙ্গে মিলিয়ে Final Naming নির্ধারণ করবে।

## ৪.১ Database Design Standards

- Primary Key: UUID
- Timestamp: UTC
- Display Timezone: Asia/Dhaka
- Currency: BDT
- Money: BIGINT Paisa
- Foreign Keys: বাধ্যতামূলক যেখানে সম্পর্ক রয়েছে
- Unique Constraints: প্রয়োজন অনুযায়ী
- Check Constraints: Financial ও Inventory Integrity
- Soft Delete: প্রয়োজনীয় Business Entity-তে
- Immutable Records: Ledger ও Audit Events
- Indexes: Search, Filtering, Relations এবং Reporting অনুযায়ী

JavaScript Floating-point দিয়ে Financial Calculation করা নিষিদ্ধ।

Frontend-এর সঙ্গে Money Contract:

- Database: Integer Paisa
- API: Integer Paisa String
- Currency: BDT

## ৪.২ Core Table Groups

### A. Organization & Settings

- `store_settings`
- `branding_settings`
- `business_settings`
- `system_settings`
- `delivery_settings`
- `payment_settings`
- `tax_settings`
- `print_templates`
- `notification_settings`

### B. Authentication & Access Control

- `staff_profiles`
- `role_assignments`
- `permissions`
- `role_permissions`
- `staff_sessions`
- `login_attempts`
- `mfa_settings`
- `security_events`

Authorization Data ব্যবহারকারীর Editable Profile Metadata থেকে বিশ্বাস করে নেওয়া যাবে না।

### C. Vendors & Suppliers

- `vendors`
- `vendor_contacts`
- `vendor_documents`
- `vendor_contracts`
- `vendor_bank_accounts`
- `vendor_payment_preferences`
- `vendor_status_history`
- `vendor_statements`

Vendor Profile-এ থাকবে:

- Vendor ID
- Business Name
- Contact Information
- Address
- Verification Status
- Contract Status
- Onboarding Date
- Assigned Products
- Consignment Terms
- Settlement Status

ব্যক্তিগত ও আর্থিক তথ্য Restricted Access-এ থাকবে।

### D. Product Catalog

- `categories`
- `products`
- `product_variants`
- `product_attributes`
- `product_attribute_values`
- `product_media`
- `supplier_product_offers`
- `product_price_history`
- `product_approval_history`

একটি Public Product-এর একাধিক Supplier Offer থাকতে পারবে।

`Supplier Product Offer`-এ থাকবে:

- Vendor ID
- Product Variant ID
- Supplier SKU
- Supplier Cost Paisa
- Supplier Profit Paisa
- Supplier Payable Paisa
- Final Sale Price Paisa
- Offer Status
- Approval Status

একাধিক Supplier একই Variant সরবরাহ করলে কোন Offer থেকে Stock Allocation হবে, তার জন্য Explicit Allocation Policy থাকতে হবে।

একটি Variant-এর একাধিক Offer থাকলেও Frontend-এ একটি সুসংগত Public Price এবং Availability দেখাতে হবে।

Allocation Policy অনুপস্থিত থাকলে অনুমান করে Supplier নির্বাচন করবে না।

### E. Inventory & Warehouse

- `warehouses`
- `warehouse_locations`
- `inventory_balances`
- `inventory_movements`
- `stock_reservations`
- `stock_reservation_items`
- `stock_receipts`
- `stock_receipt_items`
- `stock_adjustments`
- `stock_damage_records`
- `stock_transfer_records`
- `stock_counts`

Inventory আলাদাভাবে Track করবে:

- On Hand
- Reserved
- Available
- Damaged
- Returned
- Quarantined

Formula:

`Available Stock = On Hand Stock - Reserved Stock`

প্রতিটি Stock Change-এর জন্য Inventory Movement তৈরি করতে হবে।

কখনো সরাসরি Stock Quantity পরিবর্তন করে Movement History বাদ দেওয়া যাবে না।

### F. Customer Management

- `customers`
- `customer_addresses`
- `customer_contacts`
- `customer_consents`
- `customer_notes`
- `customer_order_history`

Customer Phone Number Normalize করে সংরক্ষণ করবে।

বাংলাদেশের Mobile Number Format Support করতে হবে।

Customer PII শুধুমাত্র প্রয়োজনীয় Role ও Business Operation-এ উপলব্ধ থাকবে।

### G. Orders

- `orders`
- `order_items`
- `order_item_price_snapshots`
- `vendor_fulfillment_groups`
- `order_status_events`
- `order_notes`
- `order_cancellations`
- `order_returns`
- `order_return_items`
- `order_refunds`

একটি Customer Order-এর মধ্যে একাধিক Vendor-এর Product থাকতে পারবে।

প্রতিটি Order Item-এ Historical Snapshot থাকবে:

- Product Name
- Variant
- SKU
- Quantity
- Final Sale Price
- Discount Allocation
- Supplier Offer Reference
- Supplier Cost Snapshot
- Supplier Profit Snapshot
- Supplier Payable Snapshot
- Platform Margin Snapshot

Historical Order-এর Financial Snapshot পরবর্তী Product Price পরিবর্তনের কারণে পরিবর্তিত হবে না।

### H. Courier & Delivery

- `courier_providers`
- `courier_accounts`
- `courier_service_areas`
- `delivery_zones`
- `delivery_rates`
- `shipments`
- `shipment_items`
- `courier_tracking_events`
- `courier_webhook_events`
- `courier_cod_collections`
- `courier_remittances`
- `courier_reconciliations`

### I. Payment & Finance

- `payment_methods`
- `payment_submissions`
- `payment_transactions`
- `payment_allocations`
- `payment_verifications`
- `refund_transactions`
- `ledger_accounts`
- `ledger_journals`
- `ledger_entries`
- `supplier_payables`
- `supplier_settlement_batches`
- `supplier_settlement_items`
- `supplier_payout_records`
- `courier_receivables`
- `bank_reconciliation_records`

### J. Content & Storefront

- `homepage_sections`
- `homepage_banners`
- `announcements`
- `static_pages`
- `faq_items`
- `navigation_items`
- `storefront_blocks`
- `seo_metadata`
- `social_links`

### K. Reviews & Support

- `product_reviews`
- `review_media`
- `review_moderation_events`
- `support_tickets`
- `support_messages`

### L. Fraud & Security

- `fraud_cases`
- `fraud_signals`
- `fraud_decisions`
- `rate_limit_events`
- `audit_logs`
- `admin_action_logs`
- `data_export_logs`

---

# ৫. ROLE-BASED ACCESS CONTROL (RBAC)

Security-এর সবচেয়ে গুরুত্বপূর্ণ অংশ হলো Role অনুযায়ী Data ও Action Restriction।

শুধু Sidebar থেকে Menu Hide করলে Security সম্পন্ন হবে না।

Server-side Authorization এবং Database RLS দুটোই থাকতে হবে।

## ৫.১ Role 01 — SUPER ADMIN

<priority>🔴 Core</priority>

Super Admin-এর ক্ষমতা:

- Complete Dashboard Access
- Vendor Management
- Product Approval
- Product Pricing Approval
- Inventory Overview
- Order Management
- Courier Settings
- COD Reconciliation
- Manual bKash Verification
- Supplier Payable
- Escrow Ledger
- Supplier Settlement
- Refund Approval
- Fraud Management
- Customer Management
- Staff Management
- Role & Permission Management
- System Settings
- Reports
- Audit Logs
- Backup Status
- Security Monitoring

Sensitive Financial Operation-এ Re-authentication ও Reason Capture বাধ্যতামূলক।

## ৫.২ Role 02 — VENDOR / SUPPLIER

<priority>🔴 Core</priority>

Vendor শুধুমাত্র নিজের Data দেখতে পারবে।

Permissions:

- Own Vendor Profile
- Own Product Offers
- Own Product Stock
- Own Consignment Receipts
- Own Sold Product Summary
- Own Return Summary
- Own Supplier Payable Statement
- Own Settlement History
- Own Payment History

Vendor যা দেখতে পারবে না:

- Other Vendors
- Platform Margin
- Other Supplier Cost
- Other Vendor Payable
- Complete Customer Database
- Internal Fraud Score
- Internal Audit Log
- Global Financial Dashboard

Customer Information শুধুমাত্র প্রয়োজনীয় Fulfillment কাজের জন্য অনুমোদিত সীমায় প্রকাশ করা যাবে।

Vendor নিজের Payable Amount দেখতে পারবে, কিন্তু নিজে Settlement Approve করতে পারবে না।

## ৫.৩ Role 03 — MARKETING MANAGER

<priority>🔴 Core</priority>

Permissions:

- Homepage Management
- Banner Management
- Announcement Management
- Category Presentation
- Product Description
- Product Media
- SEO Metadata
- Public Pricing Content View
- Featured Product Selection
- FAQ Management
- Static Page Management
- Approved Review Moderation

Restricted:

- Supplier Cost
- Supplier Profit
- Platform Margin
- Ledger
- Supplier Settlement
- Payment Verification
- Customer Sensitive Data
- Fraud Score
- Staff Permission Management

Marketing Manager Public Product Price সরাসরি পরিবর্তন করলে প্রয়োজনীয় Approval Workflow অনুসরণ করতে হবে।

## ৫.৪ Role 04 — SUPPLY & PACKAGING MANAGER

<priority>🔴 Core</priority>

Permissions:

- Order Processing
- Inventory Receiving
- Stock Movement
- Stock Adjustment (Within Permission)
- Picking
- Packing
- Shipment Preparation
- Courier Booking
- Courier Tracking
- Delivery Status Update
- Return Receiving
- Damaged Stock Recording
- Warehouse Reports

Restricted:

- Supplier Cost
- Supplier Profit
- Platform Margin
- Supplier Settlement
- Bank Details
- Financial Ledger
- Payment Verification
- Global Customer Database
- Role Management

শুধুমাত্র প্রয়োজনীয় Order-এর Customer Delivery Information দেখতে পারবে।

## ৫.৫ Permission Matrix

| Module | Super Admin | Vendor | Marketing | Supply |
|---|---|---|---|---|
| Global Dashboard | Full | Own Summary | Marketing Summary | Operations Summary |
| Vendors | Full | Own Profile | No | Assigned View |
| Products | Full | Own Offers | Content Access | Read Only |
| Pricing | Full | Own Allowed Data | Public View | No |
| Inventory | Full | Own Stock | No | Operational |
| Orders | Full | Own Relevant Lines | Aggregate | Operational |
| Courier | Full | No | No | Operational |
| Payment | Full | Own Statement | No | No |
| Ledger | Full | Own Statement | No | No |
| Settlement | Approve | Own Status | No | No |
| Fraud | Full | No | No | Limited Operational Flag |
| Content | Full | No | Full Content Access | No |
| Reviews | Full | No | Moderation | No |
| Reports | Full | Own Reports | Marketing Reports | Operations Reports |
| Staff & Security | Full | No | No | No |

**অতিরিক্ত নিয়ম:** Role Assignment, Permission Change এবং Sensitive Financial Approval-এর প্রতিটি ঘটনা Audit Log-এ সংরক্ষিত হবে।

---

# ৬. ADMIN DASHBOARD — NAVIGATION ARCHITECTURE

Admin Dashboard-এ Group-based Sidebar Navigation থাকবে।

সব Menu Role অনুযায়ী Dynamic হবে।

## GROUP 01 — OVERVIEW

- Dashboard
- Today's Orders
- Pending Actions
- Sales Summary
- Inventory Alerts
- Courier Summary
- Financial Summary
- Fraud Alerts

Role অনুযায়ী KPI Visibility পরিবর্তিত হবে।

## GROUP 02 — ORDER MANAGEMENT

- All Orders
- New Orders
- Pending Confirmation
- Confirmed Orders
- Processing
- Packed
- Dispatched
- In Transit
- Delivered
- Failed Delivery
- Cancelled
- Return Requests
- Refunded
- Manual Order Entry

Social Commerce Order-এর জন্য Manual Order Entry থাকবে।

Order Source:

- Website
- Facebook
- WhatsApp
- Phone
- Other

এটি শুধু Operational Source Classification। কোনো Marketing Tracking Pixel বা Tracking Script নয়।

## GROUP 03 — PRODUCT & CATALOG

- All Products
- Add Product
- Categories
- Subcategories
- Variants
- Product Attributes
- Supplier Offers
- Pricing Approval
- Product Media
- Product Import
- Product Export

## GROUP 04 — VENDOR & CONSIGNMENT

- All Vendors
- Add Vendor
- Vendor Verification
- Vendor Documents
- Vendor Contracts
- Vendor Product Offers
- Consignment Receiving
- Vendor Statements
- Vendor Payable
- Vendor Performance

## GROUP 05 — INVENTORY & WAREHOUSE

- Stock Overview
- Available Stock
- Reserved Stock
- Low Stock
- Out of Stock
- Damaged Stock
- Returned Stock
- Stock Receiving
- Stock Adjustment
- Stock Transfer
- Stock Count
- Warehouse Locations
- Inventory Movement History

## GROUP 06 — COURIER & DELIVERY

- Courier Providers
- Pathao
- Steadfast
- Bangladesh Post
- Create Shipment
- Bulk Shipment
- Tracking
- Delivery Exceptions
- COD Collection
- Courier Remittance
- Courier Reconciliation
- Delivery Rate Settings

## GROUP 07 — PAYMENT & FINANCE

- Payment Overview
- COD Payments
- bKash Submissions
- bKash Verification
- Payment History
- Supplier Payables
- Escrow-style Holding Ledger
- Supplier Settlements
- Refunds
- Courier Receivables
- Bank Reconciliation
- Financial Journal
- Ledger Reports

## GROUP 08 — CUSTOMER & FRAUD

- All Customers
- Customer Profile
- Order History
- Repeat Orders
- Delivery Failure History
- Risk Alerts
- Fraud Cases
- Manual Review
- Customer Restrictions

## GROUP 09 — STOREFRONT & CONTENT

- Homepage Sections
- Hero Banners
- Announcement
- Navigation
- Categories
- Static Pages
- FAQ
- SEO
- Branding
- Contact Settings
- Policy Settings

## GROUP 10 — REVIEWS & SUPPORT

- Product Reviews
- Pending Reviews
- Approved Reviews
- Rejected Reviews
- Support Tickets
- Customer Complaints

## GROUP 11 — REPORTS & ANALYTICS

- Sales Report
- Order Report
- Product Report
- Vendor Report
- Inventory Report
- Courier Report
- COD Report
- bKash Report
- Supplier Payable Report
- Settlement Report
- Return Report
- Fraud Report
- Profit & Loss Summary

Financial Reports শুধু অনুমোদিত Role দেখতে পারবে।

## GROUP 12 — TEAM & ACCESS

- Staff List
- Role Assignment
- Permission Management
- Login History
- MFA Status
- Active Sessions
- Access Logs

## GROUP 13 — SYSTEM & SECURITY

- System Settings
- API Configuration
- Courier Credentials
- Payment Settings
- Backup Status
- Audit Logs
- Security Events
- Error Logs
- Maintenance Mode
- System Health

---

# ৭. GROUP-BASED ADMIN UI SPECIFICATION

## ৭.১ Dashboard Layout

Desktop:

- Left Sidebar
- Top Header
- Breadcrumb
- Main Content
- Notification Area
- User Profile

Mobile:

- Collapsible Navigation Drawer
- Compact Topbar
- Responsive Data Tables
- Mobile-friendly Action Buttons

## ৭.২ Design Token Compatibility

Frontend Master Prompt-এর একই Design Token Architecture ব্যবহার করবে।

Shared Tokens:

- `--store-bg`
- `--store-surface`
- `--store-text`
- `--store-muted`
- `--store-accent`
- `--store-border`
- `--store-success`
- `--store-warning`
- `--store-danger`

Admin UI-তে একই Brand Identity থাকবে, তবে operational density ও data readability অনুযায়ী Layout পরিবর্তন করা যাবে।

## ৭.৩ Data Table Standard

প্রতিটি গুরুত্বপূর্ণ Table-এ:

- Search
- Pagination
- Sorting
- Column Visibility
- Filters
- Date Range
- Status Badge
- Row Selection
- Permission-aware Actions
- Empty State
- Loading State
- Error State

Bulk Action থাকবে শুধু অনুমোদিত Role-এর জন্য।

Financial বা Destructive Bulk Action-এর ক্ষেত্রে Confirmation বাধ্যতামূলক।

## ৭.৪ ⓘ Tooltip System

Financial ও Technical Terms-এর পাশে `ⓘ` Tooltip থাকবে।

উদাহরণ:

- Supplier Payable
- Platform Margin
- COD Receivable
- Escrow-style Holding
- Reconciliation
- Stock Reservation
- Available Stock
- Refund Liability
- Settlement Pending
- Fraud Risk

Tooltip-এ থাকবে:

- বাংলা ব্যাখ্যা
- English Technical Term
- Calculation Formula (যেখানে প্রযোজ্য)
- Business Impact

Tooltip Keyboard এবং Touch-friendly হবে।

---

# ৮. INVENTORY & CONSIGNMENT ENGINE

এটি Multi-Vendor Business-এর মূল অংশ।

## ৮.১ Consignment Receiving

Supply Manager যখন Supplier থেকে Product গ্রহণ করবে:

1. Vendor নির্বাচন।
2. Product নির্বাচন।
3. Variant নির্বাচন।
4. Received Quantity।
5. Warehouse নির্বাচন।
6. Condition Inspection।
7. Accepted Quantity।
8. Damaged Quantity।
9. Receiving Reference।
10. Confirmation।

Stock গ্রহণের আগে Receiving Record তৈরি হবে।

Accepted Stock এবং Damaged Stock আলাদা থাকবে।

## ৮.২ Stock Movement

প্রতিটি Movement-এর জন্য:

- Movement ID
- Product Variant
- Vendor
- Warehouse
- Quantity
- Movement Type
- Reference ID
- Created By
- Timestamp
- Reason

Movement Types:

- Stock Received
- Stock Reserved
- Reservation Released
- Order Allocated
- Order Dispatched
- Return Received
- Damaged
- Adjustment
- Transfer

## ৮.৩ Stock Reservation

Customer Order তৈরি হলে প্রয়োজন অনুযায়ী Stock Reserve করতে হবে।

Rules:

- Atomic Reservation
- No Negative Stock
- Duplicate Reservation Prevention
- Reservation Expiry
- Expired Reservation Release
- Order Cancellation Release
- Return Stock Inspection

Reservation TTL Admin-configurable হবে।

কোনো Countdown UI বাধ্যতামূলক নয়।

## ৮.৪ Concurrency Protection

একই Product-এর শেষ Stock দুই Customer একসঙ্গে Order করলে Overselling হতে পারবে না।

Database Transaction, Appropriate Row Locking বা Atomic Update ব্যবহার করবে।

Stock Balance এবং Movement Record একই Transaction-এ তৈরি হবে।

---

# ৯. ORDER MANAGEMENT ENGINE

## ৯.১ Order Structure

একটি Parent Customer Order-এর মধ্যে থাকতে পারে:

- Multiple Products
- Multiple Variants
- Multiple Vendors
- Multiple Fulfillment Groups
- Multiple Shipments

Order এবং Vendor Fulfillment Group আলাদা Entity হবে।

একজন Customer একবার Checkout করলেও Internal Fulfillment প্রয়োজন অনুযায়ী ভাগ হতে পারবে।

## ৯.২ Order Status State Machine

প্রস্তাবিত Status:

1. `placed`
2. `awaiting_payment`
3. `payment_under_review`
4. `confirmed`
5. `allocation_pending`
6. `processing`
7. `packed`
8. `ready_to_dispatch`
9. `dispatched`
10. `in_transit`
11. `partially_delivered`
12. `delivered`
13. `delivery_failed`
14. `cancellation_requested`
15. `cancelled`
16. `return_requested`
17. `return_approved`
18. `return_in_transit`
19. `returned`
20. `refund_pending`
21. `partially_refunded`
22. `refunded`
23. `closed`

Status Transition State Machine দ্বারা নিয়ন্ত্রিত হবে।

যেকোনো Status থেকে যেকোনো Status-এ সরাসরি পরিবর্তন করা যাবে না।

প্রতিটি Status Change-এ:

- Previous Status
- New Status
- Actor
- Timestamp
- Reason
- Related Event

সংরক্ষণ করতে হবে।

## ৯.৩ Payment Status আলাদা থাকবে

Order Status এবং Payment Status এক নয়।

Payment Status:

- Unpaid
- Awaiting COD
- bKash Pending
- bKash Under Review
- Paid
- Partially Paid
- Refunded
- Partially Refunded
- Payment Disputed

Courier Collection Status:

- Expected
- Collected by Courier
- Remittance Pending
- Remitted
- Reconciled
- Disputed

এই তিনটি State Group একে অপরের সঙ্গে গুলিয়ে ফেলা যাবে না।

## ৯.৪ Order Cancellation

- Customer Request
- Admin Review
- Stock Release
- Courier Cancellation
- Financial Reversal
- Cancellation Reason
- Audit Record

Courier-এ Dispatch হয়ে গেলে Cancellation-এর বদলে Return Workflow প্রয়োজন হতে পারে।

## ৯.৫ Partial Fulfillment

Multi-Vendor Order-এর একটি Shipment Delivered হলেও অন্য Shipment Pending থাকতে পারে।

সেক্ষেত্রে Parent Order ভুলভাবে Delivered দেখানো যাবে না।

প্রতিটি Shipment-এর পৃথক Delivery State থাকবে।

একাধিক Shipment-এ COD ভাগ হলে প্রতিটি Shipment-এর Collectable Amount সংরক্ষণ করবে।

সব Shipment-এর Collectable Amount এবং Prepaid Amount মিলিয়ে Order-এর মোট Payable Amount-এর সঙ্গে Reconciliation করতে হবে।

Courier-এর Split COD Support যাচাই না করে তা সমর্থিত বলে ধরে নেবে না।

---

# ১০. FINANCIAL ENGINE — ESCROW-STYLE LEDGER

<priority>🔴 CRITICAL CORE</priority>

এই System-এর Financial Engine সবচেয়ে বেশি সতর্কতার সঙ্গে তৈরি করতে হবে।

এটি সাধারণ Income/Expense Table নয়।

এখানে Supplier Payable, Platform Margin, COD Receivable, bKash Collection, Refund এবং Settlement পরস্পরের সঙ্গে সম্পর্কযুক্ত।

## ১০.১ Ledger Architecture

Double-entry bookkeeping ব্যবহার করবে।

প্রতিটি Financial Journal-এ:

`Total Debit = Total Credit`

প্রতিটি Journal-এ থাকবে:

- Journal ID
- Transaction Reference
- Transaction Type
- Currency
- Posting Date
- Created By
- Approved By (যেখানে প্রয়োজন)
- Description
- Entries

প্রতিটি Entry-তে:

- Ledger Account
- Debit Paisa
- Credit Paisa
- Related Order
- Related Vendor
- Related Shipment
- Reference

একটি Entry-তে Debit ও Credit একই সঙ্গে Positive হবে না।

## ১০.২ Ledger Account Categories

প্রাথমিক Account Structure:

**Assets**

- Cash / Bank
- Manual bKash Clearing
- Courier COD Receivable
- Other Receivables

**Liabilities**

- Supplier Holding Liability
- Supplier Payable
- Customer Refund Payable
- Courier Payable
- Other Payables

**Revenue**

- Platform Margin Revenue
- Delivery Revenue (যদি প্রযোজ্য)
- Other Approved Revenue

**Expenses**

- Courier Expense
- Operational Expense
- Refund-related Expense
- Approved Adjustment Expense

প্রকৃত Chart of Accounts, Revenue Recognition এবং Tax Treatment হিসাবরক্ষক/পেশাদার পরামর্শ অনুযায়ী Final করতে হবে।

## ১০.৩ Supplier Holding Ledger

প্রতিটি Supplier-এর জন্য পৃথক Holding Balance রাখতে হবে।

এই Balance-এ থাকবে:

- Earned Payable
- Pending Collection
- Eligible for Settlement
- On Hold
- Settled
- Adjustments
- Returns / Refund Adjustments

শুধু Order Delivered হলেই টাকা ছাড় করা যাবে না।

প্রথমে Collection Confirmation এবং প্রয়োজনীয় Reconciliation সম্পন্ন করতে হবে।

তারপর Return/Dispute Hold Policy অনুযায়ী Settlement Eligibility নির্ধারণ করতে হবে।

Hold Period এখনো নির্দিষ্ট নয়; এটি Admin-configurable হবে এবং চালুর আগে ব্যবসায়িক নীতি যাচাই করতে হবে।

**আইনি সতর্কতা:** এখানে Escrow-style Holding Ledger বলতে Internal Accounting Liability Tracking বোঝানো হচ্ছে। এটি নিজে থেকে আইনগত Escrow Account বা আলাদা ব্যাংক-সংরক্ষিত অর্থের নিশ্চয়তা নয়। প্রকৃত Escrow Arrangement দাবি করতে হলে পৃথক Banking, Legal ও Regulatory যাচাই প্রয়োজন।

## ১০.৪ Financial Transaction Lifecycle

### A. COD Order

1. Customer Order তৈরি।
2. Courier Shipment তৈরি।
3. Courier Customer-এর কাছ থেকে টাকা সংগ্রহ করে।
4. Courier Collection Status আপডেট হয়।
5. Courier Remittance তৈরি।
6. Bank/Cash Receipt যাচাই।
7. Courier Receivable Reconcile।
8. Supplier Payable Eligibility তৈরি।
9. Supplier Holding Balance Update।
10. Approved Settlement।

Courier Customer-এর কাছ থেকে টাকা নিয়েছে মানেই Platform-এর Bank Account-এ টাকা এসেছে এমন নয়।

এই দুইটি আলাদা Record হবে।

### B. Manual bKash

1. Customer TrxID Submit করে।
2. Payment Submission Pending হয়।
3. Authorized Reviewer Verification করে।
4. Amount ও TrxID যাচাই হয়।
5. Verified হলে Payment Record তৈরি।
6. Duplicate TrxID Prevention।
7. Financial Journal Posting।
8. Order Payment Status Update।

Verification ছাড়া Payment Confirmed করা যাবে না।

### C. Supplier Settlement

1. Supplier-এর Eligible Payable হিসাব।
2. Pending Return/Dispute Check।
3. Settlement Batch তৈরি।
4. Settlement Item Review।
5. Authorized Approval।
6. Manual Bank/MFS Transfer।
7. Transaction Reference Record।
8. Proof Attachment (Restricted)।
9. Final Reconciliation।
10. Ledger Settlement Entry।

কোনো Automated Bank Transfer বা Payment Gateway থাকবে না।

## ১০.৫ Maker-Checker Approval

**🔴 Core**

Sensitive Financial Operations-এ Maker-Checker Workflow থাকবে।

- Payment Verification
- Supplier Settlement
- Refund
- Financial Adjustment
- Ledger Correction
- Large Stock Write-off

যিনি Transaction তৈরি করবেন, তিনি একই Transaction নিজে Approve করতে পারবেন না।

Super Admin Emergency Override করলে:

- Re-authentication
- Mandatory Reason
- Audit Event
- Before/After State

সংরক্ষণ করতে হবে।

## ১০.৬ Immutable Ledger

Ledger Entry Edit/Delete নিষিদ্ধ।

ভুল হলে:

- Reversal Journal
- Correction Journal
- Linked Original Journal
- Reason
- Approver

তৈরি করতে হবে।

Historical Journal কখনো Overwrite করবে না।

## ১০.৭ Reconciliation

নিচের প্রতিটি Reconciliation Report থাকবে:

- COD vs Courier Remittance
- bKash Submissions vs Verified Collections
- Verified Payments vs Ledger
- Supplier Payable vs Supplier Settlement
- Ledger vs Bank/Cash Balance
- Refunds vs Original Payments

Mismatch হলে Discrepancy তৈরি হবে।

Silent Auto-Correction করা যাবে না।

---

# ১১. PAYMENT MANAGEMENT

## ১১.১ COD Management

Admin দেখতে পারবে:

- COD Orders
- Expected Collection
- Courier Collected
- Remittance Pending
- Remittance Received
- Reconciliation Status
- Disputed Amount

প্রতিটি COD Amount Order ও Shipment-এর Snapshot থেকে হিসাব হবে।

## ১১.২ Manual bKash Management

Dedicated Verification Screen থাকবে।

Columns:

- Order Reference
- Customer
- Sender Number
- TrxID
- Submitted Amount
- Expected Amount
- Submitted Time
- Verification Status
- Reviewer

Actions:

- Verify
- Reject
- Request Clarification (যদি Workflow অনুমোদিত হয়)

Duplicate TrxID শনাক্ত করতে হবে।

একটি TrxID একাধিক Order-এ Reuse করে Payment Confirm করা যাবে না।

## ১১.৩ Refund Management

Refund-এর ক্ষেত্রে:

- Original Payment Reference
- Refund Amount
- Refund Reason
- Refund Method
- Requested By
- Approved By
- Actual Execution Reference
- Refund Timestamp

Refund বাস্তবে সম্পন্ন না হওয়া পর্যন্ত `refunded` দেখানো যাবে না।

---

# ১২. COURIER INTEGRATION ENGINE

## ১২.১ Adapter Architecture

প্রতিটি Courier Provider-এর জন্য পৃথক Adapter তৈরি করবে।

Common Interface:

- Create Shipment
- Cancel Shipment
- Get Tracking
- Receive Webhook
- Get Delivery Status
- Get Collection Status
- Reconcile Remittance

প্রতিটি Provider-এর API-specific Logic Adapter-এর মধ্যে থাকবে।

Core Order Logic Courier-specific হবে না।

## ১২.২ Pathao

- Merchant Credentials
- Shipment Creation
- Tracking ID
- Delivery Events
- COD Information
- Webhook Integration

Pathao Developer API Merchant Panel থেকে সক্রিয় করতে হবে।

Official Documentation এবং Merchant Access ছাড়া কোনো Endpoint বা Payload বানিয়ে ফেলবে না।

## ১২.৩ Steadfast

- Merchant Credentials
- Order Booking
- Tracking
- Delivery Status
- COD Collection
- Return Status

API Credentials এবং Current Merchant Documentation যাচাই করে Adapter তৈরি করবে।

## ১২.৪ Bangladesh Post

প্রাথমিকভাবে Manual Workflow:

- Booking Reference
- Consignment Number
- Dispatch Date
- Destination
- Tracking URL (যদি থাকে)
- Manual Status Update
- Collection Reconciliation (যেখানে প্রযোজ্য)

Official API যাচাই না হওয়া পর্যন্ত API Integration তৈরি করবে না।

## ১২.৫ Webhook Security

- Signature Verification (Provider Support অনুযায়ী)
- Secret Validation
- Idempotency
- Replay Protection
- Duplicate Event Detection
- Timestamp Validation
- Raw Event Storage
- Processing Status
- Retry Mechanism

Webhook Processing কখনো Blind Trust করবে না।

---

# ১৩. FRAUD PREVENTION ENGINE

<priority>🔴 Core</priority>

বাংলাদেশের COD-ভিত্তিক ব্যবসায় Fake Order, Repeated Refusal, Duplicate Order এবং Return Fraud নিয়ন্ত্রণ করতে হবে।

## ১৩.১ Risk Signals

- Repeated Failed Deliveries
- Repeated Customer Refusal
- Duplicate Active Orders
- Unusual Order Velocity
- Repeated TrxID
- Repeated Phone Number Pattern
- Address Inconsistency
- Suspicious Order Frequency
- Previous Return Pattern
- Abnormal High-value COD

Sensitive Personal Attributes ব্যবহার করে Risk Score তৈরি করবে না।

## ১৩.২ Risk Classification

- Low
- Medium
- High
- Critical

প্রতিটি Classification-এর Explanation থাকতে হবে।

উদাহরণ:

`High Risk: Multiple recent failed COD deliveries`

শুধু Score-এর ভিত্তিতে স্থায়ীভাবে Customer Ban করবে না।

## ১৩.৩ Fraud Review Workflow

1. Risk Event তৈরি।
2. Risk Flag Assign।
3. Order Hold (যদি Rule অনুযায়ী প্রয়োজন হয়)।
4. Authorized Review।
5. Decision।
6. Reason।
7. Audit Log।

Possible Decision:

- Approve
- Manual Confirmation
- COD Restriction
- Reject
- Escalate

False Positive কমানোর জন্য Manual Override রাখতে হবে।

## ১৩.৪ Privacy

- প্রয়োজনের বেশি Customer History সংগ্রহ নয়।
- Sensitive Information সীমিত Access-এ থাকবে।
- Risk Score Customer-facing হবে না।
- Retention Policy Admin-configurable ও আইনগতভাবে যাচাইকৃত হবে।

---

# ১৪. CUSTOMER MANAGEMENT

Admin Customer Profile-এ দেখতে পারবে:

- Customer ID
- Name
- Phone
- Address
- Total Orders
- Delivered Orders
- Cancelled Orders
- Returned Orders
- Total Purchase Amount
- Last Order Date
- Support History
- Relevant Risk Flags

Role অনুযায়ী Sensitive Data Mask করতে হবে।

Customer Profile-এ Internal Note থাকলে সেটি Customer বা Vendor দেখতে পারবে না।

Customer Data Export Restricted Permission-এর অধীনে থাকবে।

---

# ১৫. PRODUCT & PRICING MANAGEMENT

## ১৫.১ Product Approval

Workflow:

Draft → Submitted → Reviewed → Approved → Published

Rejected Product-এর জন্য Reason দিতে হবে।

## ১৫.২ Pricing Validation

প্রতিটি Supplier Offer-এ:

- Supplier Cost
- Supplier Profit
- Supplier Payable
- Platform Margin
- Final Sale Price

নিয়ম:

`Supplier Payable = Supplier Cost + Supplier Profit`

`Platform Margin = Final Sale Price - Supplier Payable`

`Final Sale Price = Supplier Payable + Platform Margin`

Invalid Negative Margin হলে Authorized Exception ছাড়া Publish করা যাবে না।

## ১৫.৩ Price History

প্রতিটি Price Change-এর জন্য:

- Previous Price
- New Price
- Actor
- Timestamp
- Reason
- Approval Status

সংরক্ষণ করতে হবে।

Historical Order Snapshot অপরিবর্তিত থাকবে।

---

# ১৬. CONTENT & STOREFRONT MANAGEMENT

Marketing Manager Admin Dashboard থেকে Customer Storefront-এর Public Content পরিচালনা করতে পারবে।

Modules:

- Store Name
- Logo
- Favicon
- Accent Color
- Hero Banner
- Homepage Sections
- Featured Products
- Category Order
- Announcement
- Footer
- Contact Details
- WhatsApp Link
- Shipping Policy
- Return Policy
- Privacy Policy
- Terms
- FAQ
- SEO Metadata

Publish এবং Draft আলাদা থাকবে।

Content Version History থাকবে।

Marketing Manager Internal Financial Data দেখতে পারবে না।

---

# ১৭. THREE-PART A4 PRINTING SYSTEM

<priority>🔴 Core</priority>

Business Context-এ নির্ধারিত Three-Part A4 Printing Support করতে হবে।

## ১৭.১ Print Engine

- A4 Page Format
- Print Preview
- Three-part Copy Layout
- Clear Copy Separation
- Page Break Control
- Print Timestamp
- Order Reference
- Barcode / QR (যদি প্রয়োজন ও যাচাই করা হয়)
- Print History

## ১৭.২ Copy Data Isolation

প্রস্তাবিত তিনটি পৃথক Copy Template:

1. Customer Copy
2. Warehouse / Packing Copy
3. Accounts Copy

তবে এই তিনটি Copy-এর চূড়ান্ত নাম, Recipient এবং একই পাতায় নাকি পৃথক পাতায় থাকবে, তা ব্যবসায়িকভাবে যাচাই করতে হবে।

### Customer Copy

- Customer Information
- Products
- Quantity
- Final Sale Price
- Delivery Charge
- Final Total
- Payment Method

Supplier Cost বা Platform Margin থাকবে না।

### Warehouse / Packing Copy

- Order Reference
- Product
- Variant
- Quantity
- Warehouse
- Packing Instructions

অপ্রয়োজনীয় Financial Details থাকবে না।

### Accounts Copy

- Order Reference
- Sale Amount
- Supplier Payable
- Platform Margin
- Delivery Cost
- Payment Status
- Reconciliation Reference

শুধু অনুমোদিত Finance Role এটি Print করতে পারবে।

## ১৭.৩ Print Security

- Role-based Printing
- Print Audit
- Sensitive Copy Watermark
- No Public Financial Print URL
- No Cross-Role Data Leakage

---

# ১৮. REPORTING & BUSINESS INTELLIGENCE

## ১৮.১ Sales Reports

- Daily Sales
- Weekly Sales
- Monthly Sales
- Product-wise Sales
- Category-wise Sales
- Channel-wise Order Summary

## ১৮.২ Vendor Reports

- Vendor-wise Sales
- Supplier Payable
- Pending Settlement
- Settled Amount
- Return Adjustment
- Vendor Performance

## ১৮.৩ Inventory Reports

- Available Stock
- Reserved Stock
- Low Stock
- Dead Stock (নীতি নির্ধারিত হলে)
- Damaged Stock
- Stock Movement
- Stock Reconciliation

## ১৮.৪ Courier Reports

- Total Shipments
- Delivered
- Failed
- Returned
- COD Collected
- COD Remitted
- Pending Remittance
- Courier-wise Performance

## ১৮.৫ Financial Reports

- Gross Sales
- Supplier Payable
- Platform Margin
- Courier Expense
- Refunds
- Outstanding Receivables
- Outstanding Liabilities
- Settlement History
- Financial Reconciliation

Gross Sales, Revenue, Platform Margin এবং Net Profit এক জিনিস নয়।

প্রতিটি Report-এর Calculation Definition থাকতে হবে।

## ১৮.৬ Export

- CSV
- XLSX (প্রয়োজন হলে)
- PDF

Export Permission-based হবে।

PII Export করলে:

- Authorized User
- Reason
- Timestamp
- Export Scope

Audit Log-এ থাকবে।

---

# ১৯. NOTIFICATION & BACKGROUND JOBS

**🔴 Core**

Internal Notification:

- New Order
- Payment Submitted
- Payment Verification Pending
- Stock Low
- Shipment Failed
- Courier Remittance Pending
- Supplier Settlement Pending
- Fraud Alert
- Refund Pending

Notification-এর Delivery Channel Configurable হবে।

Email/SMS Provider অনুপস্থিত থাকলে Paid Service বাধ্যতামূলক করবে না।

## Background Processing

প্রয়োজন অনুযায়ী:

- Reservation Expiry
- Courier Webhook Processing
- Reconciliation Jobs
- Notification Queue
- Report Generation
- Scheduled Backup Verification

Transactional Outbox Pattern ব্যবহার করবে যেখানে Order/Payment-এর সঙ্গে External Event Delivery যুক্ত।

Retry হবে Idempotent।

Failed Job Dead-letter বা Manual Review State-এ যাবে।

Free/Open-source-compatible Worker বা Existing Hosting ব্যবহার করবে। কোনো Paid SaaS Queue বাধ্যতামূলক নয়।

---

# ২০. SECURITY ARCHITECTURE

<priority>🔴 CRITICAL CORE</priority>

Security হবে সর্বোচ্চ অগ্রাধিকার।

## ২০.১ Authentication

- Secure Admin Login
- Secure Session Management
- MFA for Super Admin
- Strong Password Policy
- Login Rate Limiting
- Session Revocation
- Failed Login Monitoring
- Password Reset Security

Staff Account Public Customer Signup দিয়ে তৈরি করা যাবে না।

Super Admin Account Creation Restricted থাকবে।

## ২০.২ Authorization

- RBAC
- Server-side Permission Checks
- Database RLS
- Resource Ownership Checks
- Vendor Isolation
- Sensitive Field Restriction
- Permission-aware API

প্রতিটি API Request-এ Authorization যাচাই করবে।

শুধু Frontend Menu Hide করে Security দাবি করা যাবে না।

## ২০.৩ Supabase Security

বর্তমান Supabase Key Architecture অনুসরণ করবে।

- Publishable Key: Public Client Context
- Secret Key: Server-only Privileged Context

`sb_secret_...` কখনো Browser Bundle, Client Component, Public Environment Variable বা Git Repository-তে যাবে না।

বর্তমান Project-এ Legacy `anon` বা `service_role` Key থাকলে Migration Compatibility যাচাই করবে।

Legacy `service_role` Browser-এ ব্যবহার করা সম্পূর্ণ নিষিদ্ধ।

Privileged Server Client ব্যবহারের আগে Application-level Authorization সম্পন্ন করতে হবে।

User Session Client এবং Privileged Service Client আলাদা রাখতে হবে।

## ২০.৪ Row Level Security

প্রতিটি Exposed Table-এ RLS পরীক্ষা করতে হবে।

Policy:

- Public Read
- Authenticated Read
- Vendor Own Data
- Staff Role-specific Access
- Super Admin Privileged Access

সব Table-এর জন্য প্রয়োজন অনুযায়ী আলাদা SELECT, INSERT, UPDATE এবং DELETE Policy থাকবে।

শুধু RLS Enable করলেই Security সম্পন্ন হয় না। Table Grants-ও সঠিকভাবে নির্ধারণ করতে হবে।

## ২০.৫ API Security

- Input Validation
- Output Validation
- Rate Limiting
- Idempotency
- CSRF Protection যেখানে প্রযোজ্য
- Secure Cookies
- CORS Restrictions
- SQL Injection Prevention
- XSS Protection
- Request Size Limits
- Safe Error Responses

## ২০.৬ File Upload Security

যেসব File Upload হতে পারে:

- Product Images
- Vendor Documents
- Payment Evidence
- Review Images
- Return Evidence

নিয়ম:

- MIME Type Validation
- File Size Limit
- Randomized Storage Name
- Access Control
- Private Bucket for Sensitive Files
- Signed URL with Short Expiry
- Image Processing
- Malware Scanning যেখানে সক্ষম

Public Bucket-এ Financial Document বা Vendor Identity Document রাখা যাবে না।

## ২০.৭ Audit Logging

নিচের প্রতিটি গুরুত্বপূর্ণ Action Log করতে হবে:

- Login Success/Failure
- Role Change
- Permission Change
- Product Price Change
- Stock Adjustment
- Order Status Change
- Payment Verification
- Refund
- Supplier Settlement
- Ledger Reversal
- Courier Configuration
- Data Export
- Security Setting Change

Log Fields:

- Actor ID
- Actor Role
- Action
- Entity Type
- Entity ID
- Timestamp
- Request ID
- Reason
- Before/After State (Sanitized)

Password, Session Token, API Secret, Full Payment Credential বা অপ্রয়োজনীয় Customer PII Log করা যাবে না।

Audit Log Append-only হবে।

## ২০.৮ Security Hardening

- HTTPS Only
- Secure Headers
- CSP
- HSTS
- Dependency Audit
- Secret Rotation
- Backup Encryption
- Database Access Restriction
- Session Expiry
- Security Event Alerts
- Least Privilege

---

# ২১. API CONTRACT — FRONTEND COMPATIBILITY

Backend API অবশ্যই Frontend Master Prompt-এর Data Contract অনুসরণ করবে।

## ২১.১ Public API

প্রস্তাবিত Routes:

```text
GET  /api/storefront/config
GET  /api/storefront/home
GET  /api/storefront/categories
GET  /api/storefront/products
GET  /api/storefront/products/[slug]
GET  /api/storefront/delivery/quote

POST /api/cart/quote
POST /api/checkout/orders

POST /api/payments/manual-bkash/submissions

GET  /api/orders/track/[secure-token]
POST /api/orders/cancellation-request
```

Public API-তে কোনো Sensitive Financial Field থাকবে না।

## ২১.২ Admin API

```text
/api/admin/dashboard

/api/admin/orders
/api/admin/orders/[id]
/api/admin/orders/[id]/status

/api/admin/products
/api/admin/categories
/api/admin/vendors

/api/admin/inventory
/api/admin/inventory/receipts
/api/admin/inventory/movements

/api/admin/couriers
/api/admin/shipments
/api/admin/remittances

/api/admin/payments
/api/admin/payments/verify

/api/admin/finance/ledger
/api/admin/finance/reconciliation
/api/admin/finance/supplier-payables
/api/admin/finance/settlements
/api/admin/finance/refunds

/api/admin/fraud
/api/admin/customers

/api/admin/content
/api/admin/reports

/api/admin/staff
/api/admin/audit
/api/admin/settings
```

এগুলো Logical API Routes। Existing Project Architecture অনুযায়ী REST Route Handler অথবা Server Actions ব্যবহার করা যাবে।

## ২১.৩ Standard Response Format

Success:

```json
{
  "success": true,
  "data": {},
  "request_id": "..."
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request could not be processed",
    "field_errors": {}
  },
  "request_id": "..."
}
```

Sensitive Internal Error Customer-কে প্রকাশ করবে না।

## ২১.৪ Idempotency

Checkout, Payment Submission, Refund, Settlement এবং Courier Booking-এর মতো গুরুত্বপূর্ণ Operation-এ Idempotency Key ব্যবহার করবে।

একই Request পুনরায় পাঠানো হলে Duplicate Financial Transaction বা Duplicate Shipment তৈরি হবে না।

## ২১.৫ Frontend Data Contract

Product API-তে:

- id
- slug
- name
- description
- images
- category
- variants
- price_paisa
- currency
- availability
- rating

Checkout API-তে:

- Customer Information
- Address
- Cart Items
- Variant IDs
- Payment Method
- Delivery Selection
- Idempotency Key

Server নিজে:

- Price Validate
- Stock Validate
- Delivery Charge Calculate
- Discount Validate
- Supplier Allocation
- Order Total Calculate

করবে।

Frontend-এর পাঠানো Total Amount বিশ্বাস করবে না।

---

# ২২. BUSINESS DATA INTEGRITY

নিচের নিয়মগুলো Database Level-এ যতটা সম্ভব Enforce করতে হবে।

1. একই Order Reference Duplicate হবে না।
2. একই Payment TrxID Reuse হবে না।
3. Negative Inventory হবে না।
4. Available Stock Reserved Stock-এর চেয়ে কম হবে না।
5. Supplier Payable ভুলভাবে Recalculate হবে না।
6. Ledger Journal Balanced হতে হবে।
7. Journal Posted হওয়ার পর Edit/Delete করা যাবে না।
8. Supplier অন্য Vendor-এর Record Access করতে পারবে না।
9. Vendor নিজের Settlement Approve করতে পারবে না।
10. Payment Verification ছাড়া Prepaid Order Paid হবে না।
11. Duplicate Webhook একই Event দুইবার Apply করবে না।
12. Parent Order-এর Shipment Amount Reconcile করতে হবে।
13. Historical Order Price Snapshot অপরিবর্তিত থাকবে।
14. Customer Order Reference দিয়ে Sensitive Data Expose করা যাবে না।
15. Refund Original Payment-এর বেশি হবে না, অনুমোদিত Adjustment ছাড়া।

Database Constraints, Unique Indexes, Foreign Keys এবং Transaction ব্যবহার করবে।

---

# ২৩. TESTING & QUALITY ASSURANCE

## ২৩.১ Database Testing

- Schema Validation
- Foreign Key Testing
- Unique Constraint Testing
- Check Constraint Testing
- Transaction Rollback
- Concurrency Testing
- Ledger Balance Testing

## ২৩.২ RLS Testing

প্রতিটি গুরুত্বপূর্ণ Table-এ পরীক্ষা করবে:

- Anonymous Access
- Authenticated Access
- Super Admin Access
- Vendor Own Data Access
- Vendor Other Data Denial
- Marketing Restricted Data Denial
- Supply Restricted Data Denial

Allowed এবং Denied দুই ধরনের Test Case থাকতে হবে।

Supabase Database Test Suite ব্যবহার করবে।

## ২৩.৩ Financial Testing

- Supplier Payable Calculation
- Platform Margin Calculation
- COD Reconciliation
- bKash Duplicate Detection
- Supplier Settlement
- Partial Refund
- Ledger Reversal
- Journal Balance

প্রতিটি Financial Test-এ Expected Debit এবং Credit মিলতে হবে।

## ২৩.৪ Order Testing

- Normal Order
- Multi-Vendor Order
- Partial Fulfillment
- Partial Delivery
- Cancellation
- Return
- Failed Delivery
- Duplicate Submission
- Stock Reservation Expiry

## ২৩.৫ Integration Testing

- Pathao Adapter
- Steadfast Adapter
- Bangladesh Post Manual Workflow
- Duplicate Webhook
- Invalid Webhook
- Courier Failure
- Retry Logic
- Remittance Reconciliation

Sandbox না থাকলে Live Customer Order দিয়ে Integration Test করবে না।

## ২৩.৬ Performance Testing

- Product Listing
- Admin Data Tables
- Search
- Inventory Query
- Ledger Query
- Reporting Query
- Concurrent Checkout

## ২৩.৭ Acceptance Criteria

- [ ] চারটি Role কার্যকর।
- [ ] Role Isolation সম্পূর্ণ।
- [ ] Vendor Data Isolation সম্পূর্ণ।
- [ ] Multi-Vendor Product Model কার্যকর।
- [ ] Inventory Movement কার্যকর।
- [ ] Stock Reservation কার্যকর।
- [ ] Multi-Vendor Order Allocation কার্যকর।
- [ ] COD Collection Tracking কার্যকর।
- [ ] Manual bKash Verification কার্যকর।
- [ ] Courier Integration Adapter কার্যকর।
- [ ] Supplier Payable কার্যকর।
- [ ] Escrow-style Holding Ledger কার্যকর।
- [ ] Double-entry Ledger Balanced।
- [ ] Supplier Settlement Approval কার্যকর।
- [ ] Refund Workflow কার্যকর।
- [ ] Fraud Review কার্যকর।
- [ ] Three-part A4 Print কার্যকর।
- [ ] Admin Group Navigation কার্যকর।
- [ ] ⓘ Tooltip কার্যকর।
- [ ] Audit Log কার্যকর।
- [ ] RLS Test Pass।
- [ ] Financial Test Pass।
- [ ] Backup & Restore Verification সম্পন্ন।
- [ ] Frontend API Contract-এর সঙ্গে সামঞ্জস্যপূর্ণ।
- [ ] কোনো নিষিদ্ধ Integration নেই।

---

# ২৪. STRICT EXCLUSIONS — NEVER IMPLEMENT

কোনো অবস্থায় নিচের বিষয়গুলো যোগ করবে না:

- Facebook Pixel
- TikTok Pixel
- Google Analytics Marketing Tracking
- Google Tag Manager Marketing Tracking
- Flash Sale Countdown
- Bundle Offer
- Combo Offer
- Payment Gateway
- Card Payment Gateway
- Automated bKash Gateway
- Paid-by-default SaaS
- Paid CRM
- Paid Analytics Platform
- Unnecessary Microservices
- Unnecessary Third-party Tracking
- Fake Courier API
- Fake Payment Verification
- Fake Order Status
- Fake Supplier Settlement
- Unbalanced Ledger
- Editable Financial Journal
- Public Supplier Cost
- Public Supplier Profit
- Public Platform Margin
- Cross-Vendor Data Access
- Unrestricted Admin Access for Other Roles
- Silent Financial Adjustment
- Unverified Legal or Accounting Claims

---

# ২৫. BACKEND EXECUTION PROTOCOL

## PHASE 00 — INSPECTION FIRST

কোনো Code বা Database পরিবর্তনের আগে:

1. Existing Repository Inspect করবে।
2. Frontend Master Prompt Inspect করবে।
3. Existing Database Schema Inspect করবে।
4. Existing API Inspect করবে।
5. Existing Authentication Inspect করবে।
6. Existing Supabase Project Inspect করবে।
7. Existing Storage Policies Inspect করবে।
8. Existing Environment Variables Inspect করবে।
9. Existing Deployment Structure Inspect করবে।
10. Existing Data ও Integration Dependencies Inspect করবে।

প্রথমে একটি Architecture Assessment তৈরি করবে।

যেখানে তথ্য অনুপস্থিত, সেখানে `VERIFY_REQUIRED` লিখবে।

কোনো Schema বা API নিজে থেকে Existing বলে দাবি করবে না।

## PHASE 01 — SYSTEM DESIGN

প্রস্তুত করবে:

- Backend Architecture
- Database ERD
- Role Permission Matrix
- API Contract
- Order State Machine
- Inventory Flow
- Financial Flow
- Ledger Account Map
- Courier Adapter Design
- Security Architecture
- Migration Plan
- Testing Strategy

এই Phase-এর পর Approval ছাড়া Database Migration করবে না।

## PHASE 02 — DATABASE FOUNDATION

- Schema
- Relationships
- Constraints
- Indexes
- RLS
- Grants
- Migrations
- Seed Data

প্রথমে Development Environment-এ পরীক্ষা করবে।

## PHASE 03 — AUTHENTICATION & RBAC

- Staff Login
- Super Admin
- Vendor
- Marketing Manager
- Supply & Packaging Manager
- Permission Middleware
- Database Policies
- Session Security
- MFA

## PHASE 04 — VENDOR & CATALOG

- Vendor Onboarding
- Product Management
- Product Approval
- Supplier Offers
- Pricing
- Product Variants
- Categories

## PHASE 05 — INVENTORY

- Warehouse
- Receiving
- Stock Movement
- Reservation
- Stock Adjustment
- Stock Reconciliation

## PHASE 06 — ORDER ENGINE

- Customer Order
- Multi-Vendor Allocation
- Order Status
- Fulfillment Groups
- Partial Delivery
- Cancellation
- Return

## PHASE 07 — PAYMENT & LEDGER

- COD
- Manual bKash
- Verification
- Double-entry Ledger
- Supplier Payable
- Holding Ledger
- Reconciliation
- Settlement
- Refund

এই Phase-এ প্রতিটি Financial Operation-এর Test সম্পন্ন করতে হবে।

## PHASE 08 — COURIER

- Pathao Adapter
- Steadfast Adapter
- Bangladesh Post Manual Workflow
- Webhooks
- Tracking
- Remittance

## PHASE 09 — FRAUD & CUSTOMER

- Risk Signals
- Fraud Cases
- Review Workflow
- Customer History
- Access Restriction

## PHASE 10 — CONTENT & PRINT

- Homepage Management
- Store Settings
- Static Pages
- SEO
- Three-part A4 Print
- Print Access Control

## PHASE 11 — REPORTING & AUDIT

- Financial Reports
- Operational Reports
- Vendor Reports
- Inventory Reports
- Audit Logs
- Export Permissions

## PHASE 12 — SECURITY & RELEASE

- Security Audit
- RLS Test
- RBAC Test
- Financial Test
- Integration Test
- Backup Test
- Restore Test
- Performance Test
- Production Configuration
- Release Readiness

---

# ২৬. SAFE DEVELOPMENT RULES

1. Existing Production Database সরাসরি পরিবর্তন করবে না।
2. Migration-এর আগে Backup Verification করবে।
3. Destructive Migration-এর আগে Explicit Approval নেবে।
4. Existing Data Drop করবে না।
5. Existing API Contract অকারণে পরিবর্তন করবে না।
6. Production Credentials Log করবে না।
7. Fake Data Production-এ ব্যবহার করবে না।
8. Real Customer Payment দিয়ে Test করবে না।
9. Real Supplier Settlement নিজে থেকে করবে না।
10. Financial Journal পরিবর্তন না করে Reversal ব্যবহার করবে।
11. Courier Booking-এর আগে প্রয়োজনীয় Authorization নিশ্চিত করবে।
12. External API Failure হলে Local Order Data নষ্ট করবে না।
13. প্রত্যেক Phase শেষে Test Report দেবে।
14. Unresolved Issue লুকাবে না।
15. অনুমানকে Verified Fact হিসেবে দেখাবে না।

# ২৭. FINAL DEFINITION OF DONE

Backend সম্পন্ন বলে ঘোষণা করা যাবে কেবল যখন:

- চারটি Role যথাযথভাবে কাজ করে।
- Customer Storefront-এর সঙ্গে API Contract সম্পূর্ণ সামঞ্জস্যপূর্ণ।
- Multi-Vendor Consignment Model কার্যকর।
- Stock এবং Order Allocation নির্ভরযোগ্য।
- COD এবং Manual bKash Reconciliation কাজ করে।
- Supplier Payable সঠিকভাবে হিসাব হয়।
- Double-entry Ledger সবসময় Balanced থাকে।
- Holding Ledger এবং Settlement আলাদা থাকে।
- Courier Tracking ও Remittance Workflow কার্যকর।
- Fraud Prevention কাজ করে।
- Three-part A4 Print প্রস্তুত।
- Sensitive Data Role অনুযায়ী সুরক্ষিত।
- RLS এবং Authorization Tests Pass করে।
- Audit Trail সম্পূর্ণ।
- Backup ও Restore যাচাই করা।
- কোনো নিষিদ্ধ Feature বা Payment Gateway নেই।
- Production Build ও Database Migration নিরাপদ।

# FINAL OPERATING INSTRUCTION

তুমি এখন Backend Master Prompt অনুযায়ী কাজ করবে।

প্রথমে Repository, Frontend Specification এবং Existing Database Inspect করবে।

তারপর Architecture Assessment ও Implementation Plan তৈরি করবে।

Approval ছাড়া Database Migration, Production Configuration বা Financial Operation করবে না।

Frontend-এর Design Token, Data Contract, Pricing Formula এবং Order Flow-এর সঙ্গে কোনো অসামঞ্জস্য তৈরি করবে না।

যেখানে ব্যবসায়িক সিদ্ধান্ত, API Credentials, Legal Requirement, Accounting Treatment অথবা External Provider Documentation অনুপস্থিত, সেখানে `VERIFY_REQUIRED` লিখবে।

**এই ধাপের Scope শুধুমাত্র BACKEND + ADMIN DASHBOARD।**

পরবর্তী কোনো Custom Instruction, Pre-Setup Instruction, MCP/Skill Installation Guide অথবা Negative Prompt এই ধাপে তৈরি করবে না।

Backend Master Prompt সম্পন্ন হলে থেমে যাবে এবং পরবর্তী ধাপের অনুমতি চাইবে।

---

# V2 — BACKEND ERP & INTEGRATION BLUEPRINT (ADDENDUM)
**Scope:** Backend services, database, APIs, RLS, integrations, Admin ERP, Vendor Portal, Finance, Payment and Operations.  
**Rule:** Existing Next.js/Supabase implementation is the source to audit. This is a target architecture, not proof that any module currently works.

## ১. System architecture — end-to-end

```text
Customer Browser ── Next.js Storefront ── Server Actions / Route Handlers
                                              │
Vendor Browser ─── /vendor Portal ────────────┤
                                              ▼
Admin Browser ──── /admin ERP ──────────── Domain Services
                                              │
                            ┌─────────────────┼──────────────────┐
                            ▼                 ▼                  ▼
                       Supabase Auth     PostgreSQL/RLS      Supabase Storage
                            │                 │                  │
                            └────────────── Audit/Outbox ───────┘
                                              │
                   ┌──────────────────────────┼─────────────────────────┐
                   ▼                          ▼                         ▼
             Payment Adapters           Courier Adapters          Notifications
        Manual / Official API*       Pathao / Steadfast /       In-app / manual
        *only when approved          Bangladesh Post            email optional
```

**Source of Truth:** PostgreSQL. Browser state, JSON demo store, localStorage, external provider dashboard and cached API response are not authoritative accounting records.

## ২. Module dependency graph

| Module | Depends on | Publishes/feeds | Main consumers |
|---|---|---|---|
| Identity & RBAC | Supabase Auth, profiles, role assignments | actor context | every protected module |
| Customer | Identity, addresses, consent | customer ID, addresses | cart, order, support |
| Vendor | Identity, vendor profile, contract | vendor ID, permissions | catalog, consignment, payout |
| Catalog | categories, vendors, media | public product DTO | storefront, order |
| Media | Storage, product approval, RLS | approved media refs | catalog, vendor/admin |
| Inventory | product variants, warehouse, movements | available/reserved qty | cart quote, order, fulfillment |
| Cart & Checkout | customer, catalog, stock, delivery quote | order draft | order/payment |
| Orders | customer, pricing snapshot, inventory | order + items + events | vendor fulfillment, courier, print |
| Fulfillment | order items, vendor allocations, warehouse QC | fulfillment groups | vendor, packaging, courier |
| Payments | order, provider config, verification evidence | verified collection/refund events | ledger, order status |
| Courier | shipment, COD expected, tracking events | collection/remittance | order, finance, support |
| Ledger | verified financial events, chart of accounts | journals/balances | admin finance, vendor statements |
| Settlement | payable, hold, returns, disputes | payout batches | vendor finance, accounts |
| Returns | order/shipment/payment/stock | refund/claim/stock reversal | finance, inventory, support |
| Fraud | customer/order history, rule config | risk flags/reasons | confirmation queue |
| Print | order/fulfillment/permission DTO | print jobs/history | admin/warehouse/customer |
| Notifications | outbox + templates | delivery logs | customer/vendor/staff |
| Reports | read models / ledger / events | KPI/export | admin |
| Audit & Backup | all sensitive operations | immutable evidence | super admin/recovery |

No module may bypass its domain service to mutate another module's financial state.

## ৩. Domain module specification

### ৩.১ Identity & Access 🔴
- Customer principal is separate from internal four roles.
- Staff roles: `super_admin`, `vendor`, `marketing_manager`, `packaging_manager`.
- Vendor identity maps to exactly one active vendor record (or approved multi-store mapping if later specified).
- Resolve `vendor_id` from verified server session/DB; never from request body/query.
- Every service function receives `ActorContext` and checks action + record scope.
- Supabase RLS is enforcement layer; API RBAC is additional layer, not replacement.
- Session revocation, rate limits, origin/CSRF checks, secure cookies, MFA for staff where supported.
- Test horizontal IDOR and vertical privilege escalation.

### ৩.২ Customer & Address 🔴
- Customer profile linked to `auth.users.id`.
- Phone verification state is explicit (`unverified`, `pending_staff_confirmation`, `verified`, `rejected`); never show fake OTP success.
- Address ownership enforced by RLS.
- Customer order reads by authenticated customer ID, not phone number alone.
- Secure tracking token is random, high entropy, revocable and returns minimal data.

### ৩.৩ Vendor & Contract 🔴
- Vendor onboarding, approval, status, contract dates, private documents.
- Vendor reads own product submissions, lots, allocations, shipments, claims, statements.
- Vendor cannot approve QC, payment, refund, payout, ledger or global order status.
- KYC and bank/MFS receiving details in private storage/fields with restricted role access and audit.
- Admin changes to vendor payout details require re-verification and maker-checker.

### ৩.৪ Catalog & Media 🔴
- Product/variant, category, SKU, price proposal, publication workflow.
- Supplier cost/profit/payable/platform margin are private columns/DTOs.
- Upload pipeline: private staging → file signature/size/dimension validation → re-encode/metadata strip → Admin approval → public catalog bucket.
- Accept JPEG/PNG/WebP only unless a separately reviewed safe format is approved.
- Storage object paths derive from server-verified actor ID; no client vendor_id trust.
- Bulk CSV: preview, mapping, validation, duplicate SKU report, dry-run, explicit commit; no silent overwrite.

### ৩.৫ Inventory & Consignment 🔴
- Stock movement is append-only (`receive`, `qc_accept`, `qc_reject`, `reserve`, `release`, `dispatch`, `return`, `damage`, `adjustment`).
- Atomic stock reservation in a transaction/RPC with row locks/conditional update.
- Never let `available = stock_on_hand - reserved` go negative.
- Consignment lot: vendor dispatch → warehouse receipt → QC → accepted/rejected quantities → stock movements.
- Vendor can submit dispatch lot and evidence; Warehouse/Admin owns QC decision.

### ৩.৬ Orders & Fulfillment 🔴
- Order is created only after authenticated customer and server-side recalculation.
- Store immutable line snapshots: SKU, title, variant, qty, unit price paisa, discount allocation, supplier payable snapshot, vendor assignment snapshot, delivery charge.
- Multi-vendor order split creates fulfillment groups; global order status and vendor-group status remain distinct.
- Order state machine and payment state machine are separate.
- Mutations require idempotency key and unique business constraints.
- Cancellation/return/reversal releases or adjusts inventory only through explicit workflow.

### ৩.৭ Payment & Verification — Hybrid, provider-neutral 🔴

#### A. Provider Registry
Create configurable `payment_methods` records with:
- `code`, `display_name_bn`, `display_name_en`
- `provider_type` (`mfs`, `bank_transfer`, `cod`)
- `enabled`, `mode` (`manual`, `official_api`, `statement_import`)
- `receiver_label`, masked receiver/account number
- instructions, min/max amount, currency
- API capability state (`not_available`, `requested`, `sandbox`, `approved`, `connected`, `tested`, `production_ready`)
- effective dates, created_by, updated_by, audit reference

Never store raw provider secrets in this table.

#### B. Provider decision gate — VERIFY_REQUIRED
Latest owner wording lists bKash, “National”, Rocket and Nagad but says “three”. Until clarified:
- bKash, Rocket, Nagad are candidate manual methods.
- “National” is a pending provider; clarify whether National Bank Transfer and identify exact bank/account/statement mechanism.
- COD remains from the prior approved specification unless explicitly removed.
- Do not enable all candidates merely because they are listed.
- No provider API/fees/free status is assumed.

#### C. Manual submission flow
1. Authenticated customer creates an order.
2. Server returns enabled provider instructions and exact payable amount.
3. Customer transfers money outside the website using the provider's own app/channel.
4. Customer submits provider, sender account/phone (masked display), TrxID/reference, amount, transaction timestamp and optional private evidence.
5. Server normalizes the reference and checks uniqueness within provider namespace (plus global duplicate review if cross-provider refs collide).
6. Submission state becomes `submitted_pending`; it is not a payment.
7. Authorized Accounts/Admin reviewer checks official merchant statement/app or approved bank statement.
8. Reviewer records outcome, provider evidence reference, amount/receiver match, timestamp and reason.
9. Maker-checker applies to high-value or exception approvals according to owner-configured threshold.
10. On approval, create one verified payment transaction and one journal posting using an idempotent DB transaction.
11. On rejection, preserve submission/audit; do not delete.
12. Customer sees status and next steps.

A screenshot is supporting evidence only. It is not sufficient by itself to confirm money received.

#### D. Automatic verification flow (conditional)
1. Provider adapter exists only for a documented, authorized official API or an approved bank statement feed.
2. Server authenticates to provider using secret manager/environment; credentials never reach browser.
3. Adapter sends reference/amount/order reference using provider's current official contract.
4. Verify response authenticity where provider supports signatures/secure transport and request authentication.
5. Validate transaction status, exact amount, currency, receiver/merchant account, reference, transaction uniqueness and finality.
6. Persist raw response securely with PII minimization and normalized result.
7. Idempotently create verified transaction + journal; duplicate event is a no-op with audit.
8. If timeout, mismatch, unknown status or API outage: remain pending/needs_review; never infer success.
9. Webhook handlers verify signature/authentication and replay protection; do not trust arbitrary callback payloads.
10. Reconcile API-confirmed transactions against official statement/settlement.

Official bKash business pages describe Merchant and Online Business services, but availability, credentials, API product, eligibility and fees must be confirmed directly for this specific business. No free automatic verification is promised. See official references in `04_TOOLING_SKILLS_GITHUB_MAP.md`.

#### E. National Bank Transfer flow (conditional)
- `National` must be identified exactly by Owner.
- If bank transfer: define bank legal name, account title, account number display policy, branch/routing (only if required), reference format, statement acquisition, reconciliation cadence and operator.
- If no official transaction query API, use controlled statement import/review or manual bank statement verification.
- Do not build scraping, online banking credential capture, screen scraping or browser automation into a bank account.
- Bank statement file uploads must be private, scanned, access-logged and retention-controlled.

#### F. Payment state model
`not_required_cod` | `awaiting_submission` | `submitted_pending` | `under_review` | `verified` | `rejected` | `needs_clarification` | `verification_failed` | `reversed` | `partially_refunded` | `refunded` | `disputed`.

Provider verification state is separate:
`not_configured` | `manual_only` | `api_requested` | `sandbox` | `approved` | `connected` | `tested` | `production_ready` | `suspended`.

Do not conflate Order Status, Payment Status, Courier Collection Status and Ledger Posting Status.

### ৩.৮ Finance & Ledger 🔴
- Currency BDT, integer paisa (`BIGINT`); use string serialization for values crossing JS/JSON if beyond safe integer range.
- Every journal balances debit = credit.
- Posted journals immutable; correction by linked reversal journal.
- Only verified collection events post payment journals.
- COD courier collected is receivable from courier until remittance reaches bank/cash and reconciles.
- Manual MFS verified collection is distinct from supplier settlement.
- Vendor payable is derived from immutable order-line snapshot and return/dispute policy.
- Holding buckets are internal liability accounting, not legal escrow.
- No auto payout, auto refund or silent journal correction.
- Settlement maker and approver must be distinct for protected operations.

### ৩.৯ Courier & Delivery 🔴
- Provider adapter pattern for Pathao, Steadfast, Bangladesh Post.
- Official API credentials/docs and account access required before live integration.
- Bangladesh Post manual booking/tracking if API cannot be verified.
- Shipment records, tracking events, COD expected, courier collected, remittance received and discrepancy are separate.
- Webhooks require signature/secret verification, timestamp/replay protection and idempotency.
- No real booking in tests or without approval.

### ৩.১০ Return, Refund, RTO & Claims 🔴
- Customer return request → eligibility/policy check → staff review → inspection/evidence → refund decision → inventory disposition → supplier/courier liability allocation → ledger reversal/adjustment.
- Refund references original payment transaction and cannot exceed refundable balance.
- If provider does not support API refund, Admin records actual manual refund reference and evidence; no fake automated refund.
- Partial return/partial refund supported only if stock, line allocation and journal math reconcile.

### ৩.১১ Fraud & Customer Support 🔴
- Explainable risk flags (duplicate phone/address, failed delivery, velocity, unusual pattern); no automatic accusation.
- Human review queue with reason, evidence, appeal/correction.
- Support tickets link to customer/order; vendor sees only relevant assigned case and redacted data.
- Rate limit order, auth, review, inquiry and tracking endpoints.

### ৩.১২ Admin Dashboard & Reports 🔴
- Today overview; Orders Grid; product/catalog; vendor/consignment; inventory; packaging; courier; payment; ledger; return/refund; fraud/support; reports; roles; print; settings/backup.
- KPIs must derive from canonical DB/read models and include formula tooltip.
- Filter/search/sort/pagination server-side for large grids.
- Mobile cards/drawers preserve all actions; high-risk actions remain confirmation-gated.

### ৩.১৩ Three-part A4 Print 🔴
- Part 1 Customer/Courier Copy: customer/order/delivery items and public prices only.
- Part 2 Packaging/Vendor Copy: assigned fulfillment items and quantities; no other vendor data.
- Part 3 Admin/Accounts Copy: authorized internal financial and reconciliation details.
- Print template fields and color settings admin-controlled; preview/version/history/reprint reason/permission.
- Browser/printer driver color capability must be communicated honestly; CSS cannot force a monochrome printer to print color.
- Test page breaks and field leakage for all three copies.

### ৩.১৪ Notifications & Jobs
- Transactional outbox pattern: domain event writes outbox row in same DB transaction.
- Worker sends in-app/email/manual deep link where configured.
- Retries use exponential backoff and idempotency; failed jobs go to dead-letter/review queue.
- No paid messaging service by default; no WhatsApp Cloud API unless Owner approves cost and privacy.
- Cron must use secret-authenticated endpoint; no public unauthenticated job trigger.

## ৪. Database logical map (additive; reconcile with existing schema)
Existing `docs/schema.md` already contains `payment_method` values including `bkash_manual`, `nagad_manual`, `rocket_manual`. Do not assume constraints, RLS or runtime code are aligned. Existing schema has legacy field names such as `*_poisha`; keep one canonical unit and naming policy after audit.

Suggested entities:
- `payment_methods`
- `payment_submissions`
- `payment_transactions`
- `payment_verifications`
- `payment_provider_events`
- `payment_allocations`
- `payment_refunds`
- `bank_statement_imports`
- `bank_statement_rows`
- `payment_reconciliation_runs`
- `payment_discrepancies`
- `payment_provider_credentials` (secret references only; encrypted vault/secret manager)
- `audit_logs`
- `outbox_events`
- `idempotency_keys`

Suggested critical constraints:
- unique `(provider_code, normalized_trx_reference)` where reference is present
- unique provider transaction ID where available
- unique idempotency key scoped to actor/operation
- check `amount_paisa > 0`
- currency fixed to BDT unless future approval
- foreign keys to customer/order/provider/actor
- status transition validation in service/RPC
- journal balance validation before posting
- no UPDATE/DELETE on posted ledger rows for app roles

Do not create a new schema if equivalent tables already exist. Compare current SQL migrations, generated types and runtime repositories first. Migration is additive and backward-compatible; production migration requires backup, dry-run, rollback plan and Owner approval.

## ৫. Target API contract (map to existing endpoints, avoid duplicates)

| Endpoint | Purpose | Authorization |
|---|---|---|
| `GET /api/payments/methods` | enabled public payment instructions | public, public-safe fields only |
| `POST /api/payments/submissions` | customer manual submission | authenticated customer + own order |
| `GET /api/account/payments` | own submissions/transactions | customer owner |
| `GET /api/account/payments/[id]` | own payment detail | customer owner |
| `GET /api/admin/payments` | review queue | finance/admin permission |
| `POST /api/admin/payments/[id]/review` | approve/reject/clarify | authorized reviewer + maker-checker |
| `POST /api/internal/payments/[provider]/verify` | official API verification | server-to-server only |
| `POST /api/webhooks/payments/[provider]` | provider callback | provider signature/auth + replay guard |
| `POST /api/admin/payments/reconcile` | statement/API reconciliation | finance permission + approval |
| `POST /api/admin/refunds` | refund request/record | maker-checker |
| `GET /api/admin/payments/reconciliation` | mismatch/report | finance/admin |

Existing `/api/payments/manual-bkash/submissions` must be inspected. Preserve it or migrate with a versioned compatibility plan; do not silently break clients.

## ৬. Existing repository mapping — uploaded ZIP snapshot

Known code paths in the ZIP:
- `app/api/orders/route.ts`
- `app/api/payments/manual-bkash/submissions/route.ts`
- `app/api/admin/workspace/route.ts`
- `app/api/webhooks/courier/route.ts`
- `src/lib/db/repository.ts`
- `src/lib/db/product-sync.ts`
- `src/lib/admin/phase4a-service.ts`
- `src/lib/admin/phase4b-service.ts`
- `src/lib/admin/phase4c-service.ts`
- `src/lib/admin/phase5-service.ts`
- `src/lib/admin/phase6-service.ts`
- `src/lib/admin/phase7-service.ts`
- `src/components/admin/admin-erp-client.tsx`
- `src/components/admin/product-studio-panel.tsx`
- `src/components/admin/phase7-portal-panel.tsx`
- `src/components/admin/print-engine-panel.tsx`
- `docs/finance/ledger-design.md`
- `docs/api/api-contract.md`

This is ZIP inventory, not a guarantee of current working behavior. Re-open each file and test before modifying.

## ৭. GitHub integration / repository policy
- Existing repository stays the single application repository unless Owner approves monorepo.
- Use Git branches for isolated phase work; if Git metadata is absent, initialize only after backup and explicit approval.
- Never import an entire starter/template app over existing source.
- Dependencies are installed through package manager with lockfile; no copied `node_modules`.
- External repositories are references or targeted package sources, not wholesale code imports.
- Before adding any library: license, release activity, open vulnerabilities, Next 15/React 19 compatibility, bundle/runtime cost, transitive dependency and maintenance review.
- Use GitHub Actions only if repository is actually hosted on GitHub and Owner approves workflow secrets. CI must never expose secrets.
- PR/check gates: lint, typecheck, unit tests, DB/RLS tests, E2E, build, migration review.

## ৮. Testing matrix
- Auth/RBAC: anonymous, customer, vendor A/B, marketing, packaging, super admin.
- RLS: cross-customer, cross-vendor, staff field leakage.
- Payments: duplicate TrxID, amount mismatch, wrong receiver, wrong provider, timeout, duplicate webhook, replay, API unavailable, manual fallback, partial refund, reversal.
- Ledger: debit=credit, immutable posted journal, no double posting, COD receivable vs remittance.
- Orders/inventory: concurrent checkout no oversell, cancellation release, multi-vendor split.
- Media: malicious file signature, oversize, SVG/HTML, staging isolation, orphan cleanup.
- Print: 3 copy leakage and A4 pagination.
- Responsive: 360, 390, 768, 1024, 1440.
- Provider sandbox only; never use real customer money in tests.

## ৯. Backend Execution Protocol
Phase A: Read-only inventory and architecture mapping.  
Phase B: Identity/RLS test remediation plan.  
Phase C: Schema/migration plan, local only.  
Phase D: payment/provider registry and manual verification hardening.  
Phase E: official API feasibility checks and sandbox adapter (only after Owner approval).  
Phase F: orders/inventory/consignment integration.  
Phase G: finance/reconciliation/settlement.  
Phase H: courier/returns/print/notifications.  
Phase I: Admin/vendor/customer E2E and security QA.  
Phase J: deployment readiness; production only after explicit approval.

Every phase must stop and report. No phase auto-continues.
