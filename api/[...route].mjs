// Vercel invokes the Express application as a serverless function; do not listen
// on a port here. The existing adapter must receive the original raw body for
// webhook signatures and multipart uploads.
import app from '../artifacts/api-server/dist/app.mjs';

// Bound the invocation: a stuck write must surface as a 504 instead of an endless spinner.
export const config = { api: { bodyParser: false }, maxDuration: 60 };

export default function handler(req, res) {
  // The public metadata routes are rewritten to this function by vercel.json.
  if (req.url?.startsWith('/api/__metadata/')) {
    req.url = req.url.replace('/api/__metadata/', '/');
  }
  return app(req, res);
}
