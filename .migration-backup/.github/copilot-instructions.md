# GitHub Copilot Instructions — পঞ্চগড় (Panchagarh) F-Commerce

## Project Context
Panchagarh is a multi-vendor consignment e-commerce platform in Bangladesh.

## Master Documentation (Source of Truth):
- `docs/00_CUSTOM_INSTRUCTION.md`
- `docs/01_FRONTEND_MASTER_PROMPT.md`
- `docs/02_BACKEND_MASTER_PROMPT.md`
- `docs/schema.md`

## Fundamental Rules:
- Currency: BDT. Pure integer Poisha arithmetic (`1 BDT = 100 poisha`). No floats for monetary fields.
- Consignment split: `supplier_cost_poisha + supplier_profit_poisha = supplier_payable_poisha`.
- Double-entry accounting: `Total Debit = Total Credit`. All ledger rows are immutable and append-only.
- Strictly no payment gateway integrations (only COD and Manual bKash verification).
- Strictly no marketing trackers (Facebook Pixel, TikTok Pixel, Google Tag Manager).
- Strict 4-color solid palette (`src/styles/tokens.css`). Zero gradients, zero glassmorphism, no emojis in UI.
- Respect 4 RBAC roles: Super Admin, Vendor, Marketing Manager, Supply & Packaging Manager.
