import { registerHooks, createRequire } from 'node:module';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    const candidate = specifier.startsWith('@/') ? path.join(root, specifier.slice(2)) :
      specifier.startsWith('.') && context.parentURL?.startsWith('file:') ? fileURLToPath(new URL(specifier, context.parentURL)) : null;
    if (candidate) {
      for (const suffix of ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx', '/index.js']) {
        if (existsSync(candidate + suffix) && statSync(candidate + suffix).isFile()) {
          return { url: pathToFileURL(candidate + suffix).href, shortCircuit: true };
        }
      }
    }
    try { return next(specifier, context); }
    catch (error) {
      if (context.parentURL && !specifier.startsWith('.') && !specifier.startsWith('node:')) {
        return { url: pathToFileURL(createRequire(context.parentURL).resolve(specifier)).href, shortCircuit: true };
      }
      throw error;
    }
  },
  load(url, context, next) {
    if (/\.tsx?$/.test(url) && !url.includes('/node_modules/')) {
      const result = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      });
      return { format: 'module', source: result.outputText, shortCircuit: true };
    }
    if (url.endsWith('.json') && !url.includes('/node_modules/')) {
      return { format: 'module', source: 'export default ' + readFileSync(fileURLToPath(url), 'utf8'), shortCircuit: true };
    }
    return next(url, context);
  },
});
