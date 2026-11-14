// Vercel's catch-all function may not receive nested API routes when explicit
// functions/directories are present. Restore the routed URL before Express sees
// it, preserving the method, body, cookies and the original query parameters.
import app from '../artifacts/api-server/dist/app.mjs';

export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const group = url.searchParams.get('__pb_group');
  const path = url.searchParams.get('__pb_path');
  if (url.searchParams.getAll('__pb_group').length !== 1 || url.searchParams.getAll('__pb_path').length !== 1 || !group || !path || !/^[a-z0-9_-]+$/i.test(group) ||
      path.split('/').some(part => !part || part === '.' || part === '..' || /[\\\x00-\x1f]/.test(part))) {
    res.statusCode = 400;
    res.end();
    return;
  }
  url.searchParams.delete('__pb_group');
  url.searchParams.delete('__pb_path');
  const search = url.searchParams.toString();
  req.url = `/api/${encodeURIComponent(group)}/${path.split('/').map(encodeURIComponent).join('/')}${search ? `?${search}` : ''}`;
  return app(req, res);
}
