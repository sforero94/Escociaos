#!/usr/bin/env -S deno run --no-prompt --deny-net --deny-write --deny-env --deny-run
// Uses the adapter/browser proof artifact unchanged, no independent npm resolution.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const scratch=resolve(Deno.args[0]??resolve(root,'../.escocia-xlsx-review'),'adapter-proof');
const source=await Deno.readFile(resolve(scratch,'adapter.mjs'));
const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',source))].map(b=>b.toString(16).padStart(2,'0')).join('');
const result=JSON.parse(await Deno.readTextFile(resolve(scratch,'result.json')));assert.equal(sha,result.adapterSHA256);
for(const name of ['net','write','env','run'])assert.equal((await Deno.permissions.query({name})).state,'denied');
const api=await import(pathToFileURL(resolve(scratch,'adapter.mjs')).href);
const book=await api.readXlsx(await Deno.readFile(resolve(scratch,'golden.xlsx')));
assert.deepEqual(book.sheets[0].rows,[[46225.50000000001,'#VALUE!',true,0],[null,null,null,null],[null,null,null,null]]);
const bytes=await api.writeXlsx([{name:'Deno',rows:[[0,false,' raw ','=1+2'],[null,null,null,null]],widths:[13,13,24,24],printTitlesRow:'1:1'}]);
assert.deepEqual((await api.readXlsx(bytes)).sheets[0].rows,[[0,false,' raw ','=1+2'],[null,null,null,null]]);
await assert.rejects(api.readXlsx(new Uint8Array([0xd0,0xcf])),/Convierta/);
const actual=await import(pathToFileURL(resolve(root,'src/utils/spreadsheet/index.ts')).href);
assert.deepEqual((await actual.readXlsx(await Deno.readFile(resolve(scratch,'golden.xlsx')))).sheets[0].rows,book.sheets[0].rows);
assert.deepEqual((await actual.readXlsx(await actual.writeXlsx([{name:'Actual source',rows:[[0,false,' raw ']]}]))).sheets[0].rows,[[0,false,' raw ']]);
console.log(JSON.stringify({assertions:10,sourceAdapter:true,deno:Deno.version,adapterSHA256:sha,runtimeSHA256:result.runtimeSHA256,note:'Local restricted runtime, exact browser-proven adapter/artifact; hosted Supabase runtime unverified'}));
