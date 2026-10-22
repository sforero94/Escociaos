// Synthetic Unix-socket PostgreSQL only. Real transaction races, never hosted access.
import fs from 'node:fs';import {createRequire} from 'node:module';
const x=JSON.parse(fs.readFileSync(0,'utf8'));if(!/^\/tmp\/escocia-treatment-pg-[^/]+\/socket$/.test(x.socket)||!x.client.startsWith('/tmp/'))throw Error('Contained runtime required');
const {Client}=createRequire(import.meta.url)(x.client),clients=[],checks=[];
const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
async function connect(){const c=new Client({host:x.socket,port:55439,user:'postgres',database:'postgres',password:'',ssl:false,connectionTimeoutMillis:5000,query_timeout:12000});clients.push(c);await c.connect();return c;}
async function ordinary(c,isolation='READ COMMITTED'){await c.query('BEGIN ISOLATION LEVEL '+isolation);await c.query('SET LOCAL ROLE authenticated');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[x.owner]);}
async function service(c){await c.query('BEGIN');await c.query('SET LOCAL ROLE service_role');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[x.owner]);}
async function waitLock(observer,pid){for(let i=0;i<100;i++){const r=await observer.query("SELECT wait_event_type='Lock' blocked FROM pg_stat_activity WHERE pid=$1",[pid]);if(r.rows[0]?.blocked)return;await new Promise(r=>setTimeout(r,25));}throw Error('Expected real lock wait not observed');}
try{
 const a=await connect(),s=await connect(),observer=await connect();
 const insert=async(c,q)=>c.query('INSERT INTO public.hato_produccion_quincenal SELECT z.* FROM jsonb_populate_record(NULL::public.hato_produccion_quincenal,$1::jsonb) z',[q]);
 // New measured association commits while an ordinary statement is waiting on its lock.
 await service(s);await insert(s,x.production[0]);await ordinary(a);const pid=(await a.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 const waiting=a.query('UPDATE fin_ingresos SET valor=valor+1 WHERE id=$1',[x.incomes[0]]).then(()=>null,e=>e);await waitLock(observer,pid);check(true,'ordinary statement waits for real concurrent association writer');await s.query('COMMIT');
 const err=await waiting;check(err?.code==='42501'&&err.message.includes('Measured income requires'),'post-lock fresh snapshot refuses newly committed measured association');await a.query('ROLLBACK');
 // A preexisting RR/serializable snapshot may never authorize an ordinary write.
 for(const isolation of ['REPEATABLE READ','SERIALIZABLE']){
  await ordinary(a,isolation);await a.query('SELECT count(*) FROM hato_produccion_quincenal');let rejected;try{await a.query('UPDATE fin_ingresos SET observaciones=observaciones WHERE id=$1',[x.incomes[1]]);}catch(e){rejected=e;}
  check(rejected?.code==='42501'&&rejected.message.includes('fresh read committed'),'old '+isolation+' ordinary snapshot refuses');await a.query('ROLLBACK');
 }
 // The reverse ordering is legal: an unrelated ordinary change finishes before association.
 await ordinary(a);await a.query('UPDATE fin_ingresos SET observaciones=$1 WHERE id=$2',['Synthetic before association',x.incomes[1]]);await service(s);const spid=(await s.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 const linking=insert(s,x.production[1]);await waitLock(observer,spid);check(true,'association writer waits for ordinary unmeasured write transaction');await a.query('COMMIT');await linking;await s.query('COMMIT');
 const row=(await observer.query('SELECT observaciones FROM fin_ingresos WHERE id=$1',[x.incomes[1]])).rows[0];check(row.observaciones==='Synthetic before association','completed unmeasured change precedes trusted association');
 await ordinary(a);let rejected;try{await a.query('UPDATE fin_ingresos SET observaciones=$1 WHERE id=$2',['Synthetic forbidden after association',x.incomes[1]]);}catch(e){rejected=e;}check(rejected?.code==='42501','subsequent ordinary metadata change refuses measured row');await a.query('ROLLBACK');
 console.log(JSON.stringify({assertions:checks.length,checks,observed_lock_races:2}));
}finally{for(const c of clients){try{await c.query('ROLLBACK');}catch{}await c.end();}}
