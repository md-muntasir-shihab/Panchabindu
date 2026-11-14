// Give the page loader its own function so catch-all rewrite parameters cannot
// collide with the requested page or checkout query string.
import app from '../artifacts/api-server/dist/app.mjs';
export const config = { api: { bodyParser: false } };
export default function handler(req, res) { return app(req, res); }
