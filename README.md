# Panchabindu

## Imported workspace preview / ইম্পোর্ট করা প্রজেক্টের প্রিভিউ

Requirements: Node.js 22 or newer and pnpm 10.34.9. From the repository root:

```sh
npx --yes pnpm@10.34.9 install --frozen-lockfile
npm run dev
```

The preview listens on `0.0.0.0` and uses `PORT` from the environment (default `3000`). Open the platform's preview URL. The root `dev` command starts the frontend **and** API on one port, so the browser uses same-origin `/api` requests.

**This is an isolated, disposable demo:** it uses temporary sample data, blocks server-side outbound integrations and database access, and discards changes when stopped. It does not read `.env` or real `.data` and does not connect to Supabase. Do not use it for real customer orders, payments, production data, deployment, or admin setup. Admin passwords are random and are not provided by this preview.

Google AI Studio's environment and its package-manager behavior can differ. If it runs `npm install` automatically, configure its install command to use the pnpm command above; this pnpm workspace cannot be installed with npm. If preview still fails, share the platform's error log without secrets. This command has not been verified inside Google AI Studio itself.

বাংলায়: উপরের কমান্ড দুটি রিপোজিটরির মূল ফোল্ডারে চালান। এটি সাময়িক নমুনা ডেটার প্রিভিউ, বাস্তব স্টোর বা Supabase নয়। বন্ধ করলে ডেমো পরিবর্তন মুছে যাবে।
