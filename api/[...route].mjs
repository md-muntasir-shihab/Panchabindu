// Vercel invokes the Express application as a serverless function; do not listen
// on a port here. The existing adapter must receive the original raw body for
// webhook signatures and multipart uploads.
import app from '../artifacts/api-server/dist/app.mjs';

export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  // The public metadata routes are rewritten to this function by vercel.json.
  if (req.url?.startsWith('/api/__metadata/')) {
    req.url = req.url.replace('/api/__metadata/', '/');
  }
  return app(req, res);
}
