// Node 20+ loader for this fixed offline tool and its pure local TypeScript imports.
// Uses the repository's installed TypeScript. Writes nothing and permits no remote imports.
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
const localRequire=createRequire(import.meta.url);
const ts=localRequire('typescript');
const base=realpathSync(dirname(fileURLToPath(import.meta.url)));
const roots=[base,realpathSync(resolve(base,'../../src/utils'))];
const cache=new Map();
export function cargar() {
  function load(file) {
    file=realpathSync(file);
    if(!roots.some(root=>{const rel=relative(root,file);return rel===''||(!rel.startsWith('../')&&!rel.startsWith('..\\')&&!isAbsolute(rel));})) throw Error('P6_MODULE_OUT_OF_SCOPE');
    if(cache.has(file)) return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
    const requireClosed=(id)=>{
      if(id==='node:crypto')return localRequire(id);
      if(!id.startsWith('.')||!id.endsWith('.ts'))throw Error('P6_IMPORT_FORBIDDEN');
      return load(resolve(dirname(file),id));
    };
    new Function('require','module','exports',source)(requireClosed,module,module.exports);
    return module.exports;
  }
  return load(resolve(base,'comparar.ts'));
}
