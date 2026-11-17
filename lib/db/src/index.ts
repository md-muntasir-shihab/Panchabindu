import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let pool: pg.Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;

try {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set");
  }
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
} catch {
  console.warn("[AI Studio] Database not connected — using mock");
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: { data?: unknown }) => d?.data ?? {},
    update: async (d: { data?: unknown }) => d?.data ?? {},
    delete: async () => ({}),
  };
  pool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
  } as unknown as pg.Pool;
  db = new Proxy(
    {},
    {
      get: (_, prop) =>
        prop === "query" ? new Proxy({}, { get: () => noOp }) : async () => [],
    },
  ) as unknown as ReturnType<typeof drizzle<typeof schema>>;
}

export { pool, db };
export * from "./schema";
