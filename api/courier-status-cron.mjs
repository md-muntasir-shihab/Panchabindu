// Root-level Vercel entry for the scheduled courier status poller.
import app from "../artifacts/api-server/dist/app.mjs";

export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  req.url = req.url?.replace(/^\/api\/courier-status-cron(?:\.mjs)?/, '/api/cron/courier-status') ?? '/api/cron/courier-status';
  return app(req, res);
}
