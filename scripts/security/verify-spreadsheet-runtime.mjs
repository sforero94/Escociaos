#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
const hash=path=>createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex');
const prefix='src/vendor/spreadsheet/';
const manifest=JSON.parse(readFileSync(resolve(root,prefix+'manifest.json')));
assert.equal(hash('package-lock.json'),manifest.lockSHA256,'lock changed: regenerate spreadsheet runtime');
assert.equal(hash(manifest.generator),manifest.generatorSHA256,'generator changed: regenerate spreadsheet runtime');
assert.equal(hash(prefix+manifest.artifact),manifest.artifactSHA256,'runtime artifact changed');
assert.equal(hash(prefix+'LICENSES.md'),manifest.licensesSHA256,'license notices changed');
for(const source of manifest.sources)assert.equal(hash(source.path),source.sha256,`source changed: ${source.path}`);
for(const license of manifest.extraLicenseSources)assert.equal(hash(prefix+license.file),license.sha256,'preserved upstream license changed');
const lock=JSON.parse(readFileSync(resolve(root,'package-lock.json')));
for(const pkg of manifest.packages){const record=lock.packages[pkg.path];for(const key of ['version','resolved','integrity'])assert.equal(record[key],pkg[key],`package provenance changed: ${pkg.path}`);}
assert.equal(lock.packages['node_modules/uuid'].version,'11.1.1');
assert.equal(lock.packages['node_modules/exceljs'].version,'4.4.0');
assert(!manifest.sources.some(s=>/^node_modules\/exceljs\/dist\//.test(s.path)));
console.log(JSON.stringify({verified:true,artifactSHA256:manifest.artifactSHA256,sources:manifest.sources.length,packages:manifest.packages.length}));
