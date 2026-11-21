import { Router, type RequestHandler } from 'express';
import { createHash } from 'node:crypto';
import { probeRuntimePersistence, usesPostgresPersistence } from '../../imported/src/lib/db/runtime-persistence';

/**
 * Unauthenticated, read-only deployment diagnostics.
 *
 * GET  /api/diagnostics            -> runtime + database reachability (no writes, no secrets)
 * POST /api/diagnostics            -> how many bytes of the request body actually arrived
 *
 * The POST probe exists because a serverless platform can drop or pre-consume a request body;
 * checkout, login and registration are the flows that depend on it, so this measures it directly.
 */
const diagnostics = Router();

const readOnly: RequestHandler = async (_req, res) => {
  const started = performance.now();
  const persistence = await probeRuntimePersistence();
  res.setHeader('cache-control', 'no-store');
  res.status(200).json({
    ok: persistence.error === null,
    generatedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      nodeEnv: process.env.NODE_ENV ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      region: process.env.VERCEL_REGION ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      coldStart: Math.round(process.uptime() * 1000) < 5_000,
      uptimeMs: Math.round(process.uptime() * 1000),
    },
    configuration: {
      persistenceMode: usesPostgresPersistence() ? 'postgres' : 'json',
      persistenceEnvVar: process.env.PANCHABINDU_PERSISTENCE ?? process.env.PANCHAGARH_PERSISTENCE ?? null,
      appUrlConfigured: Boolean(process.env.APP_URL?.trim()),
      corsOriginsConfigured: Boolean(process.env.CORS_ALLOWED_ORIGINS?.trim()),
      sandboxAuthEnabled: /^(1|true|yes)$/i.test(
        (process.env.PANCHABINDU_ENABLE_SANDBOX_AUTH ?? process.env.PANCHAGARH_ENABLE_SANDBOX_AUTH ?? '').trim(),
      ),
    },
    database: persistence,
    requestBodyContract: 'buffered-with-15s-watchdog',
    elapsedMs: Math.round(performance.now() - started),
  });
};

const bodyProbe: RequestHandler = (req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const declared = Number(req.headers['content-length']);
    res.setHeader('cache-control', 'no-store');
    res.status(200).json({
      ok: declared > 0 ? body.length === declared : body.length > 0,
      receivedBytes: body.length,
      declaredBytes: Number.isFinite(declared) ? declared : null,
      contentType: req.headers['content-type'] ?? null,
      sha256: createHash('sha256').update(body).digest('hex'),
      hints: body.length === 0 && declared > 0
        ? 'The platform delivered the headers but no body bytes. POST /api/orders, login and registration cannot work until this is fixed.'
        : 'The request body reached the function.',
    });
  });
  req.on('error', () => {
    if (!res.headersSent) res.status(400).json({ ok: false, error: 'BODY_STREAM_ERROR' });
  });
};

diagnostics.get('/', readOnly);
diagnostics.post('/', bodyProbe);

export default diagnostics;
