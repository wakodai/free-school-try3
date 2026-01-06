import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import ts from 'typescript';

const aliasPrefix = '@/';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(aliasPrefix)) {
    let resolvedPath = path.join(process.cwd(), 'src', specifier.slice(aliasPrefix.length));
    if (!path.extname(resolvedPath)) {
      resolvedPath += '.ts';
    }
    const url = pathToFileURL(resolvedPath).href;
    return { url, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier)) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const resolvedPath = path.resolve(path.dirname(parentPath), `${specifier}.ts`);
    const url = pathToFileURL(resolvedPath).href;
    return { url, shortCircuit: true };
  }
  return nextResolve(specifier, context, nextResolve);
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith('.ts') && !url.endsWith('.tsx')) {
    return nextLoad(url, context, nextLoad);
  }

  const source = await readFile(fileURLToPath(url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
    },
    fileName: fileURLToPath(url),
  });

  return {
    format: 'module',
    source: outputText,
    shortCircuit: true,
  };
}
