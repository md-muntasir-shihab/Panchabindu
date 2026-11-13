// Serverless entry point. Vercel invokes the exported Express app directly,
// so unlike index.ts this must not call app.listen() or require PORT.
import app from "./app";

export default app;
