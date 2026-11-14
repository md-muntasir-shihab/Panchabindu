// Explicit Vercel entry for the admin workspace endpoint.
import app from "../../artifacts/api-server/dist/app.mjs";

export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  return app(req, res);
}
