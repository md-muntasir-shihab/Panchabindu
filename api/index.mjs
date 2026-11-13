// Vercel serverless function: serves the Express API (/api/*, sitemap.xml,
// manifest.webmanifest). The bundle is produced by `pnpm run build:vercel`.
export { default } from "../artifacts/api-server/dist/vercel.mjs";
