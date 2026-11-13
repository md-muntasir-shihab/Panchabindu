// Root-level Vercel entry for the vendor overview endpoint.
import app from "../artifacts/api-server/dist/app.mjs";

export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  req.url = req.url?.replace(/^\/api\/vendor-overview(?:\.mjs)?/, '/api/vendor/overview') ?? '/api/vendor/overview';
  return app(req, res);
}
