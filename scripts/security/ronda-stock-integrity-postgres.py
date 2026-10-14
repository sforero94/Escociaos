#!/usr/bin/env python3
"""Synthetic isolated ronda stock verification, no network/live rows/export."""
import importlib.util,json,uuid,time,concurrent.futures
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('stock_fixture',ROOT/'scripts/security/application-closure-postgres.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
EX='80000000-0000-4000-8000-000000000001';EX2='80000000-0000-4000-8000-000000000002';ROUND='90000000-0000-4000-8000-000000000001'
WORKER='a0000000-0000-4000-8000-000000000001';TG_MANAGER='a0000000-0000-4000-8000-000000000002'
ACTUAL=Path('/workspace/.escocia-security-evidence/ronda-current-defs.sql')

def setup():
 f.sql(f.FIXTURE)
 f.sql("ALTER TYPE tipo_movimiento ADD VALUE 'Ajuste'; ALTER TYPE tipo_movimiento ADD VALUE 'Salida Otros';")
 f.sql("""ALTER TABLE movimientos_inventario ADD COLUMN factura text;
 ALTER TABLE movimientos_inventario ADD COLUMN created_at timestamptz DEFAULT now();
 ALTER TABLE movimientos_inventario ADD COLUMN notas text;
 CREATE TABLE telegram_usuarios(id uuid PRIMARY KEY,usuario_id uuid,nombre_display text NOT NULL,rol_bot text NOT NULL,modulos_permitidos text[],activo bool,updated_at timestamptz DEFAULT now(),telegram_id bigint UNIQUE);
 ALTER TABLE telegram_usuarios ENABLE ROW LEVEL SECURITY;
 CREATE TYPE estado_excepcion_inventario AS ENUM ('reportada','explicada','ajuste_aprobado','ajuste_aplicado','resuelta_con_captura');
 CREATE TABLE rondas_inventario(id uuid PRIMARY KEY,periodo date,estado text);
 CREATE TABLE inventario_causas_raiz(clave text PRIMARY KEY,etiqueta text,activo bool);
 CREATE TABLE rondas_excepciones(id uuid PRIMARY KEY,ronda_id uuid REFERENCES rondas_inventario(id),producto_id uuid REFERENCES productos(id),estado estado_excepcion_inventario NOT NULL,cantidad_fisica numeric NOT NULL,teorico_conteo numeric NOT NULL,explicacion_david_en timestamptz,decision_causa text REFERENCES inventario_causas_raiz(clave),aplicacion_movimiento_id uuid REFERENCES movimientos_inventario(id),aplicacion_en timestamptz,aplicacion_por_usuario uuid,aplicacion_por_telegram uuid,captura_movimiento_id uuid REFERENCES movimientos_inventario(id),captura_en timestamptz,captura_por_usuario uuid,captura_por_telegram uuid,updated_at timestamptz DEFAULT now());
 ALTER TABLE rondas_excepciones ENABLE ROW LEVEL SECURITY;
 ALTER TABLE rondas_inventario ENABLE ROW LEVEL SECURITY;
 ALTER TABLE inventario_causas_raiz ENABLE ROW LEVEL SECURITY;
 GRANT SELECT,INSERT,UPDATE ON rondas_excepciones TO authenticated;
 GRANT SELECT ON rondas_inventario,inventario_causas_raiz TO authenticated;
 CREATE POLICY rondas_excepciones_select_authenticated ON rondas_excepciones FOR SELECT TO authenticated USING(true);
 CREATE POLICY rondas_excepciones_insert_admin_gerencia ON rondas_excepciones FOR INSERT TO authenticated WITH CHECK ((SELECT public.get_user_role()) IN ('Administrador'::public.rol_usuario,'Gerencia'::public.rol_usuario));
 CREATE POLICY rondas_excepciones_update_admin_gerencia ON rondas_excepciones FOR UPDATE TO authenticated USING ((SELECT public.get_user_role()) IN ('Administrador'::public.rol_usuario,'Gerencia'::public.rol_usuario)) WITH CHECK ((SELECT public.get_user_role()) IN ('Administrador'::public.rol_usuario,'Gerencia'::public.rol_usuario));
 CREATE POLICY ronda_read ON rondas_inventario FOR SELECT TO authenticated USING(true);
 CREATE POLICY cause_read ON inventario_causas_raiz FOR SELECT TO authenticated USING(true);
 """)
 correo=(ROOT/'src/sql/migrations/143_fn_ronda_actor_correo_para_movimientos.sql').read_text().split('CREATE FUNCTION fn_ronda_actor_correo',1)[1].split('COMMENT ON FUNCTION',1)[0]
 f.sql('CREATE FUNCTION fn_ronda_actor_correo'+correo)
 # pg_get_functiondef capture omitted statement delimiters between definitions.
 f.sql(ACTUAL.read_text().replace('END $function$','END $function$;'))
 f.sql('REVOKE ALL ON FUNCTION fn_ronda_validar_actor(uuid,uuid,text),fn_ronda_aplicar_ajuste(jsonb),fn_ronda_resolver_con_captura(jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION fn_ronda_validar_actor(uuid,uuid,text),fn_ronda_aplicar_ajuste(jsonb),fn_ronda_resolver_con_captura(jsonb) TO authenticated,service_role;')
 f.sql((ROOT/'src/sql/security-candidates/ronda-stock-integrity.sql').read_text())
 f.TABLES=['usuarios','telegram_usuarios','productos','movimientos_inventario','rondas_excepciones','rondas_inventario','inventario_causas_raiz','ronda_stock_integrity.proofs','ronda_stock_integrity.proposals','ronda_stock_integrity.deliveries']

def reset(state='ajuste_aprobado',quantity=12,theory=10):
 f.sql('TRUNCATE '+','.join(f.TABLES)+' CASCADE;')
 f.sql(f"INSERT INTO usuarios(id,email,rol,activo) VALUES ('{f.ACTOR}','admin@synthetic.invalid','Administrador',true),('{f.MANAGER}','manager@synthetic.invalid','Gerencia',true),('{f.INACTIVE}','inactive@synthetic.invalid','Administrador',false),('{f.VIEWER}','viewer@synthetic.invalid','Verificador',true) ON CONFLICT(id) DO UPDATE SET activo=EXCLUDED.activo,rol=EXCLUDED.rol; INSERT INTO telegram_usuarios(id,usuario_id,nombre_display,rol_bot,modulos_permitidos,activo,updated_at) VALUES ('{WORKER}',NULL,'Worker','campo',ARRAY['inventario_ronda','inventario_explicacion'],true,now()),('{TG_MANAGER}','{f.MANAGER}','Manager','gerencia',ARRAY['inventario_aprobacion','inventario_explicacion'],true,now()) ON CONFLICT(id) DO UPDATE SET usuario_id=EXCLUDED.usuario_id,activo=EXCLUDED.activo,modulos_permitidos=EXCLUDED.modulos_permitidos,rol_bot=EXCLUDED.rol_bot; INSERT INTO productos(id,nombre,unidad_medida,cantidad_actual,precio_unitario,activo) VALUES ('{f.P1}','Synthetic SKU','Kilos',10,2,true),('{f.P2}','Other SKU','Kilos',10,2,true); INSERT INTO rondas_inventario VALUES ('{ROUND}','2026-10-01','en_curso'); INSERT INTO inventario_causas_raiz VALUES ('synthetic','Synthetic cause',true); INSERT INTO rondas_excepciones(id,ronda_id,producto_id,estado,cantidad_fisica,teorico_conteo,explicacion_david_en,decision_causa) VALUES ('{EX}','{ROUND}','{f.P1}','{state}',{quantity},{theory},now(),'synthetic'),('{EX2}','{ROUND}','{f.P1}','{state}',{quantity},{theory},now(),'synthetic');")

def body(op='adjust',exception=EX,user=f.ACTOR,tg=None):
 p=dict(actor_usuario_id=user,actor_telegram_usuario_id=tg,excepcion_id=exception,fecha_movimiento='2026-10-10')
 if op=='capture':p.update(tipo_movimiento='Entrada',cantidad=2.345,cantidad_fisica_confirmada=99,observaciones='Actual physical movement',factura=None,lote_aplicacion=None,aplicacion_id=None)
 return p

def call(p=None,op='adjust',uid=f.ACTOR,role='authenticated',ok=True):
 name='fn_ronda_aplicar_ajuste' if op=='adjust' else 'fn_ronda_resolver_con_captura'
 p=p if p is not None else body(op)
 out=f.sql(f"BEGIN; SET LOCAL ROLE {role}; SET LOCAL request.jwt.claim.sub={f.literal(uid or '')}; SELECT {name}({f.literal(json.dumps(p))}::jsonb); COMMIT;",ok)
 return json.loads(out) if ok else out

def reject(label,p=None,op='adjust',**kw):
 before=f.state();err=call(p,op,ok=False,**kw)
 if any(x in err for x in ['ambiguous','syntax error','is not assigned yet']):raise AssertionError(err)
 f.verify(f.state()==before,label)
 return err

def confirm(p,token,ok=True):
 out=f.sql(f"BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{f.ACTOR}';SELECT fn_ronda_confirmar_ajuste({f.literal(json.dumps(p))}::jsonb,'{token}');COMMIT;",ok)
 return json.loads(out) if ok else out

def telegram_rpc(name,args,ok=True):
 out=f.sql(f"BEGIN;SET LOCAL ROLE service_role;SET LOCAL request.jwt.claim.sub='';SELECT {name}({args});COMMIT;",ok)
 return json.loads(out) if ok else out

def telegram_tests():
 reset();f.sql(f"UPDATE telegram_usuarios SET telegram_id=123 WHERE id='{TG_MANAGER}';UPDATE productos SET cantidad_actual=15 WHERE id='{f.P1}';")
 warning=telegram_rpc('fn_ronda_telegram_ajuste',f"123,123,'{EX}','2026-10-10'");token=warning['propuesta_id'];before=f.state()
 f.verify({k:warning[k] for k in ['producto_nombre','unidad','fecha_movimiento','cantidad_fisica']}==dict(producto_nombre='Synthetic SKU',unidad='Kilos',fecha_movimiento='2026-10-10',cantidad_fisica=12),'warning exposes immutable original SKU unit date and physical count')
 err=telegram_rpc('fn_ronda_telegram_confirmar_ajuste',f"123,123,456,'{token}'",False)
 f.verify('Original private Telegram review required' in err and f.state()==before,'undelivered private warning has no destructive confirmation')
 before=f.state();f.verify(telegram_rpc('fn_ronda_telegram_revisar_ajuste',f"123,123,'{token}'")==warning and f.state()==before,'absent-delivery recovery retains same proposal without posting')
 telegram_rpc('fn_ronda_telegram_registrar_revision',f"123,123,456,'{token}'")
 for args in [f"123,999,456,'{token}'",f"124,124,456,'{token}'",f"123,123,457,'{token}'",f"123,123,456,'{uuid.uuid4()}'"]:
  before=f.state();telegram_rpc('fn_ronda_telegram_confirmar_ajuste',args,False);f.verify(f.state()==before,'forwarded/foreign/unknown proposal confirmation refuses '+args)
 before=f.state();review=telegram_rpc('fn_ronda_telegram_revisar_ajuste',f"123,123,'{token}'");f.verify(review==warning and f.state()==before,'read-only recovery returns same original proposal with no posting or key replacement')
 telegram_rpc('fn_ronda_telegram_registrar_revision',f"123,123,789,'{token}'")
 f.verify(f.sql('SELECT count(*)=2 FROM ronda_stock_integrity.deliveries;')=='t','commit-unknown original delivery can recover another immutable control for same proposal')
 result=telegram_rpc('fn_ronda_telegram_confirmar_ajuste',f"123,123,456,'{token}'")
 f.verify(result['saldo_nuevo']==17,'exact delivered original private warning confirms')
 f.verify(f.sql("SELECT fecha_movimiento::text FROM movimientos_inventario;")=='2026-10-10','confirmed movement preserves original proposal date')
 before=f.state();f.verify(telegram_rpc('fn_ronda_telegram_confirmar_ajuste',f"123,123,456,'{token}'")==result and f.state()==before,'private lost-response retry returns original receipt')
 f.sql(f"UPDATE productos SET cantidad_actual=20 WHERE id='{f.P1}';");before=f.state();f.verify(telegram_rpc('fn_ronda_telegram_revisar_ajuste',f"123,123,'{token}'")==result and f.state()==before,'completed read-only recovery returns original receipt after subsequent stock change')
 f.sql(f"UPDATE usuarios SET activo=false WHERE id='{f.MANAGER}';");before=f.state();telegram_rpc('fn_ronda_telegram_confirmar_ajuste',f"123,123,456,'{token}'",False);f.verify(f.state()==before,'fresh linked Gerencia revocation refuses completed retry')
 for role in ['anon','authenticated']:
  f.sql(f"SET ROLE {role};SELECT fn_ronda_telegram_ajuste(123,123,'{EX}','2026-10-10');",False);f.verify(True,'Telegram selector service-only '+role)
 reset();f.sql(f"UPDATE telegram_usuarios SET telegram_id=123 WHERE id='{TG_MANAGER}';UPDATE productos SET cantidad_actual=15;UPDATE rondas_excepciones SET producto_id='{f.P2}' WHERE id='{EX2}';")
 first=telegram_rpc('fn_ronda_telegram_ajuste',f"123,123,'{EX}','2026-10-09'");second=telegram_rpc('fn_ronda_telegram_ajuste',f"123,123,'{EX2}','2026-10-09'")
 f.verify(first['producto_nombre']=='Synthetic SKU' and second['producto_nombre']=='Other SKU' and all(first[k]==second[k] for k in ['teorico_al_conteo','teorico_hoy','delta','cantidad_fisica','unidad','fecha_movimiento']),'same-numeric different-SKU warnings retain distinct original names')
 before=f.state();f.verify(telegram_rpc('fn_ronda_telegram_revisar_ajuste',f"123,123,'{first['propuesta_id']}'")==first and telegram_rpc('fn_ronda_telegram_revisar_ajuste',f"123,123,'{second['propuesta_id']}'")==second and f.state()==before,'both different-SKU recoveries equal exact original warnings and dates without posting')
 reset();f.sql(f"UPDATE telegram_usuarios SET telegram_id=123 WHERE id='{TG_MANAGER}';UPDATE productos SET cantidad_actual=NULL WHERE id='{f.P1}';")
 warning=telegram_rpc('fn_ronda_telegram_ajuste',f"123,123,'{EX}','2026-10-10'");before=f.state()
 review=telegram_rpc('fn_ronda_telegram_revisar_ajuste',f"123,123,'{warning['propuesta_id']}'")
 f.verify(review==warning and review['teorico_hoy']==0 and f.state()==before,'nullable live balance recovery preserves exact originally normalized reviewed zero')

def proposal_fault_tests():
 for table,action in [('ronda_stock_integrity.proposals','RETURN NULL;'),('ronda_stock_integrity.proposals',"NEW.id:='ffffffff-ffff-4fff-8fff-ffffffffffff';RETURN NEW;"),('ronda_stock_integrity.proposals',"NEW.payload:='{}';RETURN NEW;"),('ronda_stock_integrity.proposals',"UPDATE public.productos SET nombre='foreign';RETURN NEW;")]:
  reset();f.sql(f"UPDATE productos SET cantidad_actual=15 WHERE id='{f.P1}';")
  f.sql(f"CREATE FUNCTION public.proposal_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN {action} END $$;CREATE TRIGGER proposal_fault BEFORE INSERT ON {table} FOR EACH ROW EXECUTE FUNCTION public.proposal_fault();")
  before=f.state();err=call(ok=False);f.verify('observed proposal insertion/source' in err and f.state()==before,'proposal insertion/source fault rolls back '+action)
  f.sql(f'DROP TRIGGER proposal_fault ON {table};DROP FUNCTION public.proposal_fault();')
 for action in ['RETURN NULL;',"NEW.message:=999;RETURN NEW;","UPDATE public.productos SET nombre='foreign';RETURN NEW;"]:
  reset();f.sql(f"UPDATE telegram_usuarios SET telegram_id=123 WHERE id='{TG_MANAGER}';UPDATE productos SET cantidad_actual=15 WHERE id='{f.P1}';")
  token=telegram_rpc('fn_ronda_telegram_ajuste',f"123,123,'{EX}','2026-10-10'")['propuesta_id']
  f.sql(f"CREATE FUNCTION public.delivery_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN {action} END $$;CREATE TRIGGER delivery_fault BEFORE INSERT ON ronda_stock_integrity.deliveries FOR EACH ROW EXECUTE FUNCTION public.delivery_fault();")
  before=f.state();err=telegram_rpc('fn_ronda_telegram_registrar_revision',f"123,123,456,'{token}'",False);f.verify('review delivery suppressed/rewritten' in err and f.state()==before,'delivery/source insertion fault rolls back '+action)
  f.sql('DROP TRIGGER delivery_fault ON ronda_stock_integrity.deliveries;DROP FUNCTION public.delivery_fault();')
 reset();f.sql(f"UPDATE telegram_usuarios SET telegram_id=123 WHERE id='{TG_MANAGER}';UPDATE productos SET cantidad_actual=15 WHERE id='{f.P1}';")
 token=telegram_rpc('fn_ronda_telegram_ajuste',f"123,123,'{EX}','2026-10-10'")['propuesta_id'];f.sql(f"UPDATE productos SET cantidad_actual=16 WHERE id='{f.P1}';");before=f.state()
 err=telegram_rpc('fn_ronda_telegram_revisar_ajuste',f"123,123,'{token}'",False);f.verify('Original review source/authority changed' in err and f.state()==before,'stale source refuses read-only recovery without replacement')
 err=telegram_rpc('fn_ronda_telegram_registrar_revision',f"123,123,456,'{token}'",False);f.verify('Original review source changed' in err and f.state()==before,'stale warning delivery cannot bind a destructive control')
 for table in ['ronda_stock_integrity.proposals','ronda_stock_integrity.deliveries']:
  for role in ['anon','authenticated','service_role']:
   f.sql(f'SET ROLE {role};SELECT * FROM {table};',False);f.verify(True,'private proposal/review unreadable '+table+' '+role)


def tests():
 setup();reset();p=body();r=call(p)
 f.verify(r['delta']==2 and r['saldo_anterior']==10 and r['saldo_nuevo']==12,'ordinary Administrator applies approved signed delta over live stock')
 f.verify(f.sql(f"SELECT cantidad_actual=12 FROM productos WHERE id='{f.P1}';")=='t','exact SKU stock result')
 f.verify(f.sql("SELECT cantidad=2 AND saldo_anterior=10 AND saldo_nuevo=12 AND valor_movimiento=4 AND responsable='admin@synthetic.invalid' FROM movimientos_inventario;")=='t','exact ledger fields use trusted persisted attribution and price')
 before=f.state();f.verify(call(p)==r and f.state()==before,'identical completed retry returns original proof with no second posting')
 for change in ["UPDATE ronda_stock_integrity.proofs SET result='{}'", "UPDATE ronda_stock_integrity.proofs SET payload='{}'", "DELETE FROM ronda_stock_integrity.proofs"]:
  before=f.state();f.sql(change+';',False);f.verify(f.state()==before,'completed proof refuses privileged '+change.split()[0]+' rewrite')
 for role in ['authenticated','service_role','anon']:
  f.sql(f'SET ROLE {role}; SELECT * FROM ronda_stock_integrity.proofs;',False)
  f.verify(True,'private proofs unreadable to '+role)
  f.sql(f"SET ROLE {role}; SELECT ronda_stock_integrity.post('adjust','{{}}');",False)
  f.verify(True,'private posting helper inaccessible to '+role)
 reject('changed payload cannot replay prospective outcome',dict(p,fecha_movimiento='2026-10-11'))
 reject('foreign actor cannot claim completed proof',body(user=f.MANAGER),uid=f.MANAGER)
 f.sql(f"UPDATE usuarios SET activo=false WHERE id='{f.ACTOR}';");reject('revoked actor cannot replay prior success',p)
 reset();f.verify(call(body(user=f.MANAGER),uid=f.MANAGER)['aplicado'],'active human Gerencia applies without inventing Telegram modules')
 reset();f.sql(f"UPDATE productos SET cantidad_actual=15 WHERE id='{f.P1}';");r=call();f.verify(not r['aplicado'] and r['motivo']=='teorico_cambio' and r['delta']==2,'live theoretical change warns without posting')
 f.verify(f.sql('SELECT count(*)=0 FROM movimientos_inventario;')=='t','warning creates no stock ledger or completed proof')
 f.verify(f.sql('SELECT count(*)=0 FROM ronda_stock_integrity.proofs;')=='t','warning preserves ability to explicitly confirm later')
 reject('old boolean-only force refuses',dict(body(),confirmar_cambio_teorico=True))
 token=r['propuesta_id']; other=call()['propuesta_id'];original=body();result=confirm(original,token)
 before=f.state();err=confirm(original,other,ok=False);f.verify('Ronda proof original/actor conflict' in err and f.state()==before,'another warning proposal cannot claim completed original confirmation receipt')
 f.verify(result['saldo_nuevo']==17,'original observed proposal applies frozen delta to exact observed live balance')
 before=f.state();f.verify(confirm(original,token)==result and f.state()==before,'confirmed proposal retry returns original receipt')
 f.sql(f"UPDATE productos SET cantidad_actual=20 WHERE id='{f.P1}';")
 f.verify(confirm(original,token)==result,'completed confirmation preserves original receipt after legitimate subsequent SKU edits')
 for change in [f"UPDATE productos SET cantidad_actual=16 WHERE id='{f.P1}'", f"UPDATE productos SET nombre='changed' WHERE id='{f.P1}'", f"UPDATE rondas_excepciones SET cantidad_fisica=13 WHERE id='{EX}'", f"UPDATE inventario_causas_raiz SET etiqueta='changed'", f"UPDATE usuarios SET email='changed' WHERE id='{f.ACTOR}'"]:
  reset();f.sql(f"UPDATE productos SET cantidad_actual=15 WHERE id='{f.P1}';");warning=call();f.sql(change+';');before=f.state();err=confirm(body(),warning['propuesta_id'],ok=False)
  f.verify('original observed source/authority changed' in err and f.state()==before,'pending original proposal refuses '+change.split(' SET')[0])
 reset();f.sql(f"UPDATE productos SET cantidad_actual=15 WHERE id='{f.P1}';");warning=call();before=f.state()
 for field in ['payload','actor_snapshot','before_product','before_exception','sources']:
  f.sql(f"UPDATE ronda_stock_integrity.proposals SET {field}='{{}}';",False);f.verify(f.state()==before,'immutable observed proposal '+field)
 f.sql('DELETE FROM ronda_stock_integrity.proposals;',False);f.verify(f.state()==before,'immutable observed proposal deletion')
 telegram_tests();proposal_fault_tests()
 for physical,theory,delta in [(8,10,-2),(10,10,0),(0,10,-10)]:
  reset(quantity=physical,theory=theory);r=call();f.verify(r['delta']==delta and r['saldo_nuevo']==10+delta,'signed/zero/exact-depletion adjustment '+str(delta))
 reset('explicada');p=body('capture');r=call(p,'capture')
 f.verify(r['saldo_nuevo']==12.35 and r['cantidad_fisica_confirmada']==99,'capture normalizes movement once and keeps independent physical count')
 f.verify(f.sql(f"SELECT cantidad_fisica=99 AND estado='resuelta_con_captura' FROM rondas_excepciones WHERE id='{EX}';")=='t','capture persists independently confirmed physical count')
 before=f.state();f.verify(call(p,'capture')==r and f.state()==before,'capture exact retry returns original event proof')
 reject('capture changed independent physical count cannot replay',dict(p,cantidad_fisica_confirmada=98),'capture')
 reject('one exception cannot replay through another operation',dict(p),'adjust')
 for field in ['result','actor_snapshot','before_product','before_exception','sources','actual_movement','actual_exception','actual_product','created_at']:
  # Every stored original/actual/receipt is immutable after completion.
  column=field
  value="'2000-01-01'" if field=='created_at' else "'{}'::jsonb"
  before=f.state();f.sql(f'UPDATE ronda_stock_integrity.proofs SET {column}={value};',False)
  f.verify(f.state()==before,'completed capture proof refuses '+column+' rewrite')
 reset('explicada');p=body('capture');p.update(tipo_movimiento='Salida Otros',cantidad=10,cantidad_fisica_confirmada=0);f.verify(call(p,'capture')['saldo_nuevo']==0,'capture exact depletion and real zero physical count')
 for lane,role in [(WORKER,'campo'),(WORKER,'admin'),(TG_MANAGER,'gerencia')]:
  reset();f.sql(f"UPDATE telegram_usuarios SET rol_bot='{role}' WHERE id='{lane}';");p=body(user=None,tg=lane);r=call(p,uid=None,role='service_role');f.verify(r['aplicado'],'configured Telegram '+role+' lane authorized with current module')
  before=f.state();f.verify(call(p,uid=None,role='service_role')==r and f.state()==before,'Telegram '+role+' exact own retry')
 reset('explicada');p=body('capture',user=None,tg=WORKER);f.verify(call(p,'capture',uid=None,role='service_role')['saldo_nuevo']==12.35,'unlinked configured worker may capture real movement')
 for uid in [f.INACTIVE,f.VIEWER,None]:
  reset();reject('invalid human current actor '+str(uid),body(user=uid),uid=uid)
 reset();reject('human cannot impersonate Telegram',body(user=None,tg=WORKER))
 reset();reject('human cannot claim other authenticated actor',body(user=f.MANAGER))
 reset();reject('authenticated NULL UID cannot use service worker lane',body(user=None,tg=WORKER),uid=None)
 reset();reject('anonymous execute refused',role='anon',uid=None)
 for col in ['activo','rol']:
  reset();f.sql(f"UPDATE usuarios SET {col}=NULL WHERE id='{f.ACTOR}';");reject('nullable human '+col+' refused')
 for mutation,label in [(f"UPDATE telegram_usuarios SET activo=false WHERE id='{WORKER}'",'inactive worker'),(f"UPDATE telegram_usuarios SET modulos_permitidos=ARRAY['labores'] WHERE id='{WORKER}'",'wrong worker module'),(f"UPDATE telegram_usuarios SET usuario_id=NULL WHERE id='{TG_MANAGER}'",'unlinked gerencia'),(f"UPDATE usuarios SET activo=false WHERE id='{f.MANAGER}'",'inactive linked Gerencia'),(f"UPDATE usuarios SET rol='Administrador' WHERE id='{f.MANAGER}'",'mismatched linked Gerencia role')]:
  reset();f.sql(mutation+';');tg=TG_MANAGER if 'Gerencia' in label or 'gerencia' in label else WORKER;reject('Telegram '+label+' refused',body(user=None,tg=tg),uid=None,role='service_role')
 reset();f.sql(f"ALTER TABLE telegram_usuarios ALTER COLUMN rol_bot DROP NOT NULL; UPDATE telegram_usuarios SET rol_bot=NULL WHERE id='{WORKER}';");reject('nullable Telegram role cannot enter privileged lane',body(user=None,tg=WORKER),uid=None,role='service_role');reset();f.sql('ALTER TABLE telegram_usuarios ALTER COLUMN rol_bot SET NOT NULL;')
 reset();reject('service role cannot declare an unbound human actor',body(),uid=None,role='service_role')
 for op,state in [('adjust','ajuste_aprobado'),('capture','explicada')]:
  for field,values in [('cantidad_fisica',["'NaN'::numeric","'Infinity'::numeric",'-1']),('teorico_conteo',["'NaN'::numeric",'-1'])]:
   for value in values:
    reset(state);f.sql(f"UPDATE rondas_excepciones SET {field}={value} WHERE id='{EX}';");reject('invalid '+op+' persisted '+field+' '+value,body(op),op)
 for field,values in [('cantidad_actual',["'NaN'::numeric",'-1']),('precio_unitario',["'NaN'::numeric",'-1'])]:
  for value in values:
   reset();f.sql(f"UPDATE productos SET {field}={value} WHERE id='{f.P1}';");reject('invalid persisted SKU '+field+' '+value)
 for field,values in [('cantidad',[0,.001,-1,'NaN','Infinity',10000000000]),('cantidad_fisica_confirmada',[-1,'NaN','Infinity',10000000000])]:
  for value in values:
   reset('explicada');p=body('capture');p[field]=value;reject('invalid capture '+field+' '+str(value),p,'capture')
 reset();f.sql(f"UPDATE rondas_excepciones SET estado='ajuste_aplicado' WHERE id='{EX}';");reject('historical terminal state cannot mint prospective receipt')
 # Exact write and later-trigger faults, not mirrored happy-path checks.
 for table,event in [('movimientos_inventario','INSERT'),('productos','UPDATE'),('rondas_excepciones','UPDATE'),('ronda_stock_integrity.proofs','INSERT'),('ronda_stock_integrity.proofs','UPDATE')]:
  reset();f.suppress(table,event);reject('suppressed '+table+' '+event+' entire transaction rollback');f.unsuppress(table)
  reset('explicada');f.suppress(table,event);reject('suppressed capture '+table+' '+event+' entire transaction rollback',body('capture'),'capture');f.unsuppress(table)
 for table,event,code in [('movimientos_inventario','INSERT','NEW.cantidad:=99; RETURN NEW;'),('productos','UPDATE','NEW.precio_unitario:=9; RETURN NEW;'),('rondas_excepciones','UPDATE',"NEW.aplicacion_por_usuario:=NULL; RETURN NEW;"),('ronda_stock_integrity.proofs','INSERT',"NEW.origin:='telegram'; RETURN NEW;"),('ronda_stock_integrity.proofs','UPDATE',"NEW.result:='{}'; RETURN NEW;")]:
  reset();f.suppress(table,event,code);reject('rewritten '+table+' '+event+' rollback');f.unsuppress(table)
  reset('explicada');capture_code=code.replace('aplicacion_por_usuario','captura_por_usuario');f.suppress(table,event,capture_code);reject('rewritten capture '+table+' '+event+' rollback',body('capture'),'capture');f.unsuppress(table)
 reset();f.suppress('rondas_excepciones','UPDATE',f"UPDATE productos SET cantidad_actual=99 WHERE id='{f.P1}'; RETURN NEW;");reject('later exception trigger cannot alter earlier SKU proof');f.unsuppress('rondas_excepciones')
 reset();f.suppress('ronda_stock_integrity.proofs','UPDATE',f"UPDATE rondas_excepciones SET teorico_conteo=99 WHERE id='{EX}'; RETURN NEW;");reject('private proof trigger cannot alter business final source');f.unsuppress('ronda_stock_integrity.proofs')
 reset();f.suppress('ronda_stock_integrity.proofs','UPDATE',f"UPDATE usuarios SET activo=false WHERE id='{f.ACTOR}'; RETURN NEW;");reject('private proof trigger cannot revoke actor and still return success');f.unsuppress('ronda_stock_integrity.proofs')
 reset();f.suppress('ronda_stock_integrity.proofs','INSERT',"NEW.created_at:='2000-01-01'; RETURN NEW;");reject('proof creation timestamp cannot be forged');f.unsuppress('ronda_stock_integrity.proofs')
 for table,event,code in [('productos','UPDATE',"NEW.updated_by:=NULL; RETURN NEW;"),('productos','UPDATE',"NEW.updated_at:='2000-01-01'; RETURN NEW;"),('rondas_excepciones','UPDATE',"NEW.updated_at:='2000-01-01'; RETURN NEW;"),('movimientos_inventario','INSERT',"NEW.created_at:='2000-01-01'; RETURN NEW;"),('movimientos_inventario','INSERT',"NEW.notas:='forged'; RETURN NEW;")]:
  reset();f.suppress(table,event,code)
  # Run after the fixture's legitimate timestamp/attribution seal triggers.
  f.sql(f'ALTER TRIGGER synthetic_fault ON {table} RENAME TO zzz_synthetic_fault;')
  reject('trusted metadata rewrite refused '+table+' '+code)
  f.sql(f'ALTER TRIGGER zzz_synthetic_fault ON {table} RENAME TO synthetic_fault;');f.unsuppress(table)
 for table,event,action in [('movimientos_inventario','INSERT',f"UPDATE productos SET cantidad_actual=99 WHERE id='{f.P1}'; RETURN NULL;"),('ronda_stock_integrity.proofs','UPDATE',f"UPDATE rondas_excepciones SET teorico_conteo=99 WHERE id='{EX}'; RETURN NULL;")]:
  reset();f.sql(f'CREATE FUNCTION public.synthetic_deferred() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN {action} END $$; CREATE CONSTRAINT TRIGGER synthetic_deferred AFTER {event} ON {table} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.synthetic_deferred();')
  reject('deferred '+table+' result rewrite refused before posting')
  f.sql(f'DROP TRIGGER synthetic_deferred ON {table}; DROP FUNCTION public.synthetic_deferred();')
 reset();f.sql('REVOKE INSERT,UPDATE,DELETE ON productos,movimientos_inventario FROM authenticated;');f.verify(call()['aplicado'],'protected human wrapper remains functional after ordinary direct-DML retirement');f.sql('GRANT INSERT,UPDATE,DELETE ON productos,movimientos_inventario TO authenticated;')
 reset();p=body();
 def raw(p):return f.docker(['exec','-i','-u','postgres',f.CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','postgres'],f"BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{f.ACTOR}';SELECT fn_ronda_aplicar_ajuste({f.literal(json.dumps(p))});COMMIT;",False)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:out=list(pool.map(raw,[p,p]))
 f.verify(all(x.returncode==0 for x in out) and out[0].stdout==out[1].stdout,'same exception simultaneous exact retries return one matching receipt')
 f.verify(f.sql('SELECT count(*)=1 FROM movimientos_inventario;')=='t','concurrent duplicate posts once')
 reset();p2=body(exception=EX2);p=body()
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:out=list(pool.map(raw,[p,p2]))
 f.verify(all(x.returncode==0 for x in out) and f.sql(f"SELECT cantidad_actual=12 FROM productos WHERE id='{f.P1}';")=='t','different same-SKU exceptions serialize and second warns against changed original theoretical stock')
 f.verify(f.sql('SELECT count(*)=1 FROM ronda_stock_integrity.proofs;')=='t','same-SKU concurrent operation has one proof and one observed warning proposal')
 # Witness the SKU lock wait, replace the exception reference, then release
 # that lock. The RPC must refuse its initially observed SKU after re-reading.
 reset();holder=f.subprocess.Popen(f.DOCKER+['exec','-i','-u','postgres',f.CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','postgres'],stdin=f.subprocess.PIPE,stdout=f.subprocess.PIPE,stderr=f.subprocess.PIPE,text=True,env=f.ENV)
 try:
  holder.stdin.write(f"BEGIN; SELECT id FROM productos WHERE id='{f.P1}' FOR UPDATE;\n");holder.stdin.flush()
  f.verify(holder.stdout.readline().strip()==f.P1,'SKU race fixture holds intended row lock')
  with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
   pending=pool.submit(raw,body())
   for _ in range(100):
    if f.sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event='transactionid' AND query LIKE '%SELECT fn_ronda_aplicar_ajuste%');")=='t':break
    time.sleep(.05)
   else:raise AssertionError('RPC did not reach witnessed SKU lock wait')
   f.sql(f"UPDATE rondas_excepciones SET producto_id='{f.P2}' WHERE id='{EX}';")
   before=f.state();holder.stdin.write('COMMIT;\n');holder.stdin.flush();holder.stdin.close();holder.wait(timeout=10)
   outcome=pending.result(timeout=10)
  f.verify(outcome.returncode!=0 and 'Ronda source SKU changed' in outcome.stderr and f.state()==before,'source SKU replacement after initial read refuses all posting')
 finally:
  if holder.poll() is None:holder.kill();holder.wait(timeout=10)
 reset();p=body();call(p);f.sql(f"UPDATE movimientos_inventario SET responsable='foreign' WHERE producto_id='{f.P1}';");reject('rewritten historical ledger prevents stale replay receipt',p)
 reset();p=body();call(p);f.sql(f"UPDATE telegram_usuarios SET activo=false WHERE id='{WORKER}';");reject('foreign worker cannot claim human completed proof',body(user=None,tg=WORKER),uid=None,role='service_role')

def main():
 f.docker(['info','--format','{{.ServerVersion}}']);f.CONTAINER='escociaos-ronda-stock-'+uuid.uuid4().hex
 try:
  f.docker(['run','-d','--name',f.CONTAINER,'--pull=never','--network=none','--read-only','--tmpfs','/var/lib/postgresql/data:rw,size=256m','--tmpfs','/var/run/postgresql:rw,size=16m','--tmpfs','/tmp:rw,size=16m','--memory=512m','--cpus=2','--security-opt=no-new-privileges','-e','POSTGRES_HOST_AUTH_METHOD=trust',f.IMAGE])
  c=json.loads(f.docker(['inspect','--format','{{json .HostConfig}}',f.CONTAINER]).stdout);f.verify(c['NetworkMode']=='none' and not c['Binds'] and not c['PortBindings'],'network none no binds or ports')
  for _ in range(120):
   if f.docker(['exec',f.CONTAINER,'cat','/proc/1/comm'],check=False).stdout.strip()=='postgres' and f.docker(['exec','-u','postgres',f.CONTAINER,'pg_isready'],check=False).returncode==0:break
   time.sleep(.25)
  else:raise AssertionError('Synthetic startup failed')
  tests();print(f'{f.CHECKS} synthetic assertions passed; no production calls or deployment.',flush=True)
 finally:
  f.docker(['rm','-f','-v',f.CONTAINER],check=False);f.verify(f.docker(['inspect',f.CONTAINER],check=False).returncode!=0,'container/tmpfs cleanup verified')
if __name__=='__main__':main()
