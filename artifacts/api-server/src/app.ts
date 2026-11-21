import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { importedRouter } from "./routes/imported";
import diagnosticsRouter from "./routes/diagnostics";

const app: Express = express();
app.disable("x-powered-by");

const allowedOrigins = new Set(
  [
    process.env.APP_URL,
    ...(process.env.CORS_ALLOWED_ORIGINS || "").split(","),
  ]
    .map((origin) => origin?.trim())
    .filter((origin): origin is string => Boolean(origin))
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean),
);

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.set("trust proxy", 1);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, false);
      return callback(null, allowedOrigins.has(origin));
    },
    credentials: true,
  }),
);
app.use("/api/diagnostics", diagnosticsRouter);
app.use(importedRouter);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api", router);

export default app;
