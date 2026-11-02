// Diagnostic categories only. This never replaces or relaxes validateRawInventory.
import {createHash} from 'node:crypto';
import {TARGET} from './release-faithfulness-proof.mjs';
import {OMITTED,validateRawInventory,latestCacheEntry} from './release-application-date-cohort-capture.mjs';
const prefix=`supabase/functions/${TARGET}/`,limit=512;
const cache=new Map([
 ['supabase/.temp/cli-latest',{bytes:8,sha256:'e259ceef24c76934bc3c6884c465e636c7f058e1b275e46de8d1e51a5dc8c4c4'}],
 ['supabase/.temp/linked-project.json',{bytes:134,sha256:'5afb37cef5be9eb93a709f9a1769352d325098f5dc58bdf706563d6a6110a302'}],
]);
const empty=()=>({cacheChanged:0,cacheMissing:0,latestChanged:0,linkChanged:0,latestMissing:0,linkMissing:0,sourceChanged:0,sourceMissing:0,wrapperChanged:0,wrapperMissing:0,configChanged:0,configMissing:0,unexpected:0,unexpectedSource:0,representationChanged:0,unsafe:0,malformed:0});
const problem=code=>{throw code;};
const own=(value,key)=>{
 const descriptor=Object.getOwnPropertyDescriptor(value,key);
 if(!descriptor || !Object.hasOwn(descriptor,'value'))problem('MALFORMED_LAYOUT');
 return descriptor.value;
};
function snapshot(value){
 const containerPrototype=Object.getPrototypeOf(value);
 if(containerPrototype!==Object.prototype && containerPrototype!==null)problem('MALFORMED_LAYOUT');
 const entries=own(value,'entries');
 if(!Array.isArray(entries) || Object.getPrototypeOf(entries)!==Array.prototype)problem('MALFORMED_LAYOUT');
 const n=own(entries,'length');if(!Number.isSafeInteger(n)||n<0)problem('MALFORMED_LAYOUT');
 if(n>limit)problem('LIMIT_EXCEEDED');
 const arrayKeys=Reflect.ownKeys(entries);
 if(arrayKeys.length!==n+1 || arrayKeys.some(k=>k!=='length' && (typeof k!=='string'||!/^(0|[1-9]\d*)$/.test(k)||Number(k)>=n)))problem('MALFORMED_LAYOUT');
 const result=[],seen=new Set();let bytes=0;
 for(let i=0;i<n;i++){
  const entry=own(entries,String(i));
  if(!entry || typeof entry!=='object' || Array.isArray(entry))problem('MALFORMED_LAYOUT');
  const prototype=Object.getPrototypeOf(entry);
  if(prototype!==Object.prototype && prototype!==null)problem('MALFORMED_LAYOUT');
  const keys=Reflect.ownKeys(entry),path=own(entry,'path'),type=own(entry,'type');
  if(typeof path!=='string' || !path || path.length>1024 || /[\x00-\x1f\x7f\\]/.test(path) || path.startsWith('/') || /^[a-z]:/i.test(path) || path.split('/').some(p=>!p||p==='.'||p==='..'))problem('UNSAFE_LAYOUT');
  if(seen.has(path))problem('MALFORMED_LAYOUT');seen.add(path);
  if(!['file','directory','symlink','special'].includes(type))problem('MALFORMED_LAYOUT');
  const required=type==='file'?['path','type','bytes','sha256']:['path','type'];
  if(keys.length!==required.length || keys.some(k=>!required.includes(k)))problem('MALFORMED_LAYOUT');
  const copy={};for(const key of keys){if(!Object.getOwnPropertyDescriptor(entry,key).enumerable)problem('MALFORMED_LAYOUT');copy[key]=own(entry,key);}
  if(type==='file'){
   if(!Number.isSafeInteger(copy.bytes)||copy.bytes<0||typeof copy.sha256!=='string'||!/^[a-f0-9]{64}$/.test(copy.sha256))problem('MALFORMED_LAYOUT');
   bytes+=copy.bytes;if(bytes>32*1024*1024)problem('LIMIT_EXCEEDED');
  }
  result.push(copy);
 }
 return result;
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function classifyRaw(raw,gitInventory,config,latestContent){
 const counts=empty();let gitEntries,expected,reference;
 try{
  gitEntries=snapshot(gitInventory);
  if(own(gitInventory,'fileCount')!==85 || !Buffer.isBuffer(config) || config.length>65536)problem('REFERENCE_INVALID');
  reference={fileCount:85,entries:gitEntries};
  expected=[...['supabase','supabase/functions',`supabase/functions/${TARGET}`].map(path=>({path,type:'directory'})),
   {path:'supabase/config.toml',type:'file',bytes:config.length,sha256:sha(config)},
   ...gitEntries.filter(e=>!Object.hasOwn(OMITTED,e.path)).map(e=>({...e,path:prefix+e.path})),
   {path:'supabase/.temp',type:'directory'},...Array.from(cache,([path,value])=>path==='supabase/.temp/cli-latest'?latestCacheEntry(latestContent):({path,type:'file',...value}))];
  // Copied diagnostic reference must itself satisfy the unchanged authority.
  if(expected.length>limit)problem('REFERENCE_INVALID');
  validateRawInventory({entries:expected},reference,config,latestContent);
 }catch{return{category:'REFERENCE_INVALID',counts};}
 let actual;
 try{actual=snapshot(raw);}catch(code){
  if(code==='UNSAFE_LAYOUT'){counts.unsafe=1;return{category:'UNSAFE_LAYOUT',counts};}
  if(code==='LIMIT_EXCEEDED')return{category:'LIMIT_EXCEEDED',counts};
  counts.malformed=1;return{category:'MALFORMED_LAYOUT',counts};
 }
 const inc=key=>{counts[key]=Math.min(limit,counts[key]+1);};
 const actualMap=new Map(actual.map(e=>[e.path,e])),expectedMap=new Map(expected.map(e=>[e.path,e]));
 for(const entry of actual){
  if(entry.type==='symlink'||entry.type==='special')inc('unsafe');
  if(!expectedMap.has(entry.path)){inc('unexpected');if(entry.path.startsWith(prefix))inc('unexpectedSource');}
 }
 for(const entry of expected){
  const found=actualMap.get(entry.path),isCache=cache.has(entry.path),isConfig=entry.path==='supabase/config.toml';
  if(!found){inc(entry.type==='directory'?'wrapperMissing':isCache?'cacheMissing':isConfig?'configMissing':'sourceMissing');if(isCache)inc(entry.path==='supabase/.temp/cli-latest'?'latestMissing':'linkMissing');continue;}
  if(found.type!==entry.type){inc('wrapperChanged');continue;}
  if(JSON.stringify(Object.keys(found))!==JSON.stringify(Object.keys(entry)))inc('representationChanged');
  if(entry.type==='file' && (found.bytes!==entry.bytes||found.sha256!==entry.sha256)){
   inc(isCache?'cacheChanged':isConfig?'configChanged':'sourceChanged');
   if(isCache)inc(entry.path==='supabase/.temp/cli-latest'?'latestChanged':'linkChanged');
  }
 }
 let accepted=false;try{validateRawInventory({entries:actual},reference,config,latestContent);accepted=true;}catch{/* Classification cannot approve. */}
 const kinds=[['CACHE_ONLY',counts.cacheChanged+counts.cacheMissing],['SOURCE_ONLY',counts.sourceChanged+counts.sourceMissing],['WRAPPER_ONLY',counts.wrapperChanged+counts.wrapperMissing],['CONFIG_ONLY',counts.configChanged+counts.configMissing]].filter(([,n])=>n>0);
 let category;
 if(counts.unsafe)category='UNSAFE_LAYOUT';
 else if(counts.unexpected||counts.representationChanged)category='UNKNOWN_LAYOUT';
 else if(accepted)category=kinds.length?'REFERENCE_INVALID':'RAW_MATCH';
 else if(kinds.length===1)category=kinds[0][0];
 else category=kinds.length?'MIXED_MISMATCH':'UNKNOWN_LAYOUT';
 return{category,counts};
}
export function inspectRawCapture(raw,gitInventory,config,emit,latestContent){
 let error,failed=false;
 try{validateRawInventory(raw,gitInventory,config,latestContent);}catch(e){error=e;failed=true;}
 const event={stage:'mismatch',event:'classified',...classifyRaw(raw,gitInventory,config,latestContent)};
 if(failed){try{emit(event);}catch{/* Preserve the original rejection. */}throw error;}
 emit(event); // Reporting failure stops; successful classification cannot bypass proof.
}
