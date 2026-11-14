# Functional inventory — partial inspection

This is not a claim that every page or button was audited.

- Storefront: account, order history, checkout session, saved-address UI and order API inspected; latest owned order details now surfaced on the account and prefilled at checkout.
- Admin: authentication, workspace CSRF/session restoration, user creation/reset, vendor control, onboarding and closure status paths inspected.
- Vendor: workspace, profile/onboarding requests, product/stock/price/payout authorization, admin capabilities and vendor routes inspected.
- Persistence: JSONB runtime transaction schema and production adapter contract inspected; no relational backfill performed.
- Integrations: scheduled courier endpoint inspected and fails closed. Other providers and live journeys are not comprehensively audited.
- 13-group admin architecture, other storefront interactions, accessibility, real RLS and every route are not fully audited.
