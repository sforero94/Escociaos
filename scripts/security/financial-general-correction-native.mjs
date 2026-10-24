// Contained native races for independent/shared-monthly income. No hosted transport or synthetic retry replacement.
import fs from 'node:fs';import {createRequire} from 'node:module';import {randomUUID,createHash} from 'node:crypto';
const x=JSON.parse(fs.readFileSync(0,'utf8'));if(!/^\/tmp\/escocia-treatment-pg-[^/]+\/socket$/.test(x.socket)||!x.client.startsWith('/tmp/'))throw Error('Contained local runtime required');
const {Client}=createRequire(import.meta.url)(x.client),clients=[],checks=[];
// Exact synthetic statements/parameters retained outside Git before each native dispatch.
const diagnosticDir='/tmp/escocia-general-financial-native-'+process.pid;fs.mkdirSync(diagnosticDir,{recursive:true,mode:0o700});let sequence=0;const originalQuery=Client.prototype.query;Client.prototype.query=async function(...args){const id=++sequence,exact=JSON.stringify(args),sha256=createHash('sha256').update(exact).digest('hex'),file=diagnosticDir+'/'+id+'.sql.json',start=performance.now();fs.writeFileSync(file,exact,{mode:0o600});fs.appendFileSync(diagnosticDir+'/timings.jsonl',JSON.stringify({id,file,sha256,phase:'start',at:new Date().toISOString()})+'\n');try{return await originalQuery.apply(this,args);}finally{fs.appendFileSync(diagnosticDir+'/timings.jsonl',JSON.stringify({id,file,sha256,phase:'end',elapsedMs:performance.now()-start,at:new Date().toISOString()})+'\n');}};
const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
async function connect(){const c=new Client({host:x.socket,port:55439,user:'postgres',database:'postgres',password:'',ssl:false,connectionTimeoutMillis:5000,query_timeout:12000});clients.push(c);await c.connect();return c;}
async function ordinary(c){await c.query('BEGIN');await c.query('SET LOCAL ROLE authenticated');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[x.owner]);}
async function invoke(c,action,key,intent=null){return(await c.query('SELECT public.fn_financial_general_correction_web($1,$2,$3,$4) value',[action,key,intent,x.owner])).rows[0].value;}
async function waitLock(c,pid){for(let i=0;i<100;i++){if((await c.query("SELECT wait_event_type='Lock' blocked FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.blocked)return;await new Promise(r=>setTimeout(r,25));}throw Error('Expected real source lock wait');}
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
let primaryError;
try{
 const a=await connect(),b=await connect(),observer=await connect();
 const snapshot=async()=>canonical((await observer.query(x.stateQuery)).rows[0]);
 const prepare=async()=>{await ordinary(a);const income=(await a.query('SELECT to_jsonb(i) value FROM fin_ingresos i WHERE id=$1',[x.income])).rows[0].value;const draft={version:1,kind:'generalFinancial',targetId:x.income,fields:{date:income.fecha,businessId:income.negocio_id,categoryId:income.categoria_id,name:'Synthetic native reviewed correction',regionId:income.region_id,mediumId:income.medio_pago_id,buyerId:income.comprador_id,value:'123777.50'}};const source=(await a.query('SELECT public.fn_financial_general_correction_source_web($1,$2) value',[draft,x.owner])).rows[0].value;const key=randomUUID();await invoke(a,'prepare',key,{...draft,observed:source.source});await a.query('COMMIT');return key;};
 const cancel=async key=>{await ordinary(a);await invoke(a,'resolve',key);await invoke(a,'acknowledge',key);await a.query('COMMIT');};
 const pidA=(await a.query('SELECT pg_backend_pid() pid')).rows[0].pid,pidB=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 // A direct ordinary writer wins the source lock first; stale prepared post must refuse.
 let key=await prepare();await ordinary(a);await a.query('UPDATE fin_ingresos SET valor=valor+1 WHERE id=$1',[x.income]);await ordinary(b);
 let posting=invoke(b,'post',key).then(()=>null,e=>e);await waitLock(observer,pidB);check(true,'prepared post waits for actual competing ordinary financial writer');await a.query('COMMIT');const afterWriter=await snapshot();let error=await posting;check(error?.message.includes('source/day changed'),'fresh post-lock snapshot refuses stale prepared financial source');await b.query('ROLLBACK');check(await snapshot()===afterWriter,'stale post adds no domain/control/audit mutation beyond the competing write');await cancel(key);
 // Current actor is revoked while posting waits on the trusted profile row lock.
 key=await prepare();await a.query('BEGIN');await a.query('UPDATE usuarios SET activo=false WHERE id=$1',[x.owner]);await ordinary(b);posting=invoke(b,'post',key).then(()=>null,e=>e);await waitLock(observer,pidB);check(true,'prepared post waits for actual concurrent profile revocation');await a.query('COMMIT');const afterRevocation=await snapshot();error=await posting;check(error?.code==='42501'&&error.message.includes('Fresh active Gerencia'),'profile predicate is rechecked after revocation lock releases');await b.query('ROLLBACK');check(await snapshot()===afterRevocation,'revoked actor post preserves complete domain/control/audit state');await a.query('UPDATE usuarios SET activo=true WHERE id=$1',[x.owner]);await cancel(key);
 // One owner-bound original posts once; a concurrent duplicate recovers its first receipt.
 key=await prepare();await ordinary(a);const first=await invoke(a,'post',key);await ordinary(b);posting=invoke(b,'post',key).then(value=>({value}),error=>({error}));try{await waitLock(observer,pidB);}catch(lockError){const outcome=await posting;if(outcome.error)throw new AggregateError([lockError,outcome.error],'Duplicate post and lock observation failed',{cause:outcome.error});throw lockError;}check(true,'concurrent duplicate original post waits for its real owner/key transaction');await a.query('COMMIT');const outcome=await posting;if(outcome.error)throw outcome.error;const second=outcome.value;await b.query('COMMIT');check(canonical(first)===canonical(second)&&first.state==='committed','duplicate original returns the identical committed receipt');
 const row=(await observer.query('SELECT to_jsonb(i) value FROM fin_ingresos i WHERE id=$1',[x.income])).rows[0].value;
 check(canonical(row)===canonical(first.receipt.after.income),'independent income row exactly matches committed correction receipt');
 check((await observer.query('SELECT count(*)::int count FROM financial_general_correction.audit WHERE request_key=$1',[key])).rows[0].count===1,'exactly one immutable correction audit exists for the original');
 const beforeRecovery=await snapshot();await ordinary(a);const recovered=(await a.query('SELECT public.fn_financial_general_correction_recover_web($1) value',[x.owner])).rows[0].value;await a.query('COMMIT');check(canonical(recovered)===canonical(first)&&await snapshot()===beforeRecovery,'owner recovery after duplicate/lost replies returns first original without another mutation');
 console.log(JSON.stringify({assertions:checks.length,checks,observed_lock_races:3}));
}catch(error){primaryError=error;throw error;
}finally{
 const cleanupErrors=[];
 for(const c of clients){
  try{await c.query('ROLLBACK');}catch(error){cleanupErrors.push(new Error('Local replay rollback failed',{cause:error}));}
  try{await c.end();}catch(error){cleanupErrors.push(new Error('Local replay client close failed',{cause:error}));}
 }
 if(cleanupErrors.length)throw new AggregateError(primaryError?[primaryError,...cleanupErrors]:cleanupErrors,'Native general financial replay cleanup failed',primaryError?{cause:primaryError}:undefined);
}
