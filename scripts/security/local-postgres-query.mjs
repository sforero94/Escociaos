// Transport for the synthetic local harness. Explicit Unix socket only; no env DB selectors.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [socket,clientPath] = process.argv.slice(2);
if (!/^\/tmp\/escocia-treatment-pg-[^/]+\/socket$/.test(socket) || !clientPath?.startsWith('/tmp/')) throw Error('Synthetic temporary runtime paths required');
const {default: pg} = await import(pathToFileURL(clientPath).href);
const client = new pg.Client({host:socket,port:55439,user:'postgres',database:'postgres',password:'',ssl:false,connectionTimeoutMillis:5000});
try{
 await client.connect();
 const result=await client.query(readFileSync(0,'utf8'));
 for(const part of Array.isArray(result)?result:[result])for(const row of part.rows){
  console.log(Object.values(row).map(v=>v===null?'':typeof v==='object'?JSON.stringify(v):typeof v==='boolean'?(v?'t':'f'):String(v)).join('|'));
 }
}catch(error){console.error(error.message);process.exitCode=1;}finally{await client.end();}
