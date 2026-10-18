-- NONNUMBERED native Telegram milk caller boundary after44candidates. OFFLINE ONLY.
BEGIN;
SELECT hato_birth_undo.lock_domain();
DO $$ BEGIN IF current_user<>'postgres' OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.fn_hato_milk_weighing_web(text,uuid,jsonb,uuid)'::regprocedure AND md5(prosrc)='25bc45070d18c745cbadb057c92aeda9' AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed native milk foundation';END IF;PERFORM hato_milk_weighing.assert_baseline();END $$;
CREATE SCHEMA hato_milk_telegram;
REVOKE ALL ON SCHEMA hato_milk_telegram FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_milk_telegram.requests(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,original jsonb,plan jsonb,effective_date date,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,acknowledged boolean NOT NULL DEFAULT false,
 CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR intent IS NOT NULL AND original IS NOT NULL AND plan IS NOT NULL AND effective_date IS NOT NULL),CHECK(NOT acknowledged OR state IN('committed','canceled')));
CREATE UNIQUE INDEX one_original_registration ON hato_milk_telegram.requests(owner_id) WHERE state IN('pending','committed') AND NOT acknowledged;
CREATE TABLE hato_milk_telegram.audit(request_key uuid PRIMARY KEY REFERENCES hato_milk_telegram.requests(request_key),receipt jsonb NOT NULL);
ALTER TABLE hato_milk_telegram.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_milk_telegram.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_milk_weighing FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_milk_telegram.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable milk weighing proof';END IF;
 IF ((to_jsonb(NEW)-'acknowledged')=(to_jsonb(OLD)-'acknowledged') AND NOT OLD.acknowledged AND NEW.acknowledged AND OLD.state IN('committed','canceled')) OR (OLD.state='pending' AND NEW.state IN('committed','canceled') AND (to_jsonb(NEW)-'state'-'receipt')=(to_jsonb(OLD)-'state'-'receipt')) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Immutable original milk weighing';
END $$;
CREATE TRIGGER immutable_registration_request BEFORE UPDATE OR DELETE ON hato_milk_telegram.requests FOR EACH ROW EXECUTE FUNCTION hato_milk_telegram.immutable();
CREATE TRIGGER immutable_registration_audit BEFORE UPDATE OR DELETE ON hato_milk_telegram.audit FOR EACH ROW EXECUTE FUNCTION hato_milk_telegram.immutable();
CREATE TRIGGER no_truncate_registration_request BEFORE TRUNCATE ON hato_milk_telegram.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_milk_telegram.immutable();
CREATE TRIGGER no_truncate_registration_audit BEFORE TRUNCATE ON hato_milk_telegram.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_milk_telegram.immutable();
CREATE FUNCTION hato_milk_telegram.controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_milk_telegram.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_milk_telegram.audit x));
$$;
CREATE FUNCTION hato_milk_telegram.result(r hato_milk_telegram.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'receipt',r.receipt,'acknowledged',coalesce(r.acknowledged,false));
$$;

CREATE FUNCTION hato_milk_telegram.assert_baseline() RETURNS void LANGUAGE sql SET search_path=pg_catalog AS $$ SELECT hato_milk_weighing.assert_baseline(); $$;
CREATE FUNCTION hato_milk_telegram.validate(p jsonb) RETURNS void LANGUAGE sql SET search_path=pg_catalog AS $$ SELECT hato_milk_weighing.validate(p); $$;
CREATE FUNCTION hato_milk_telegram.actor(p_sender bigint,p_chat bigint,p_message bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE actor jsonb;p public.usuarios;BEGIN
 IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Native service action required' USING ERRCODE='42501';END IF;
 actor=hato_treatment_creation.telegram_actor(p_sender,p_chat,p_message);
 SELECT * INTO p FROM public.usuarios WHERE id=(actor->>'profileId')::uuid FOR SHARE;
 IF NOT FOUND OR p.activo IS DISTINCT FROM true OR p.rol::text NOT IN('Administrador','Gerencia') OR p.rol IS NULL THEN RAISE EXCEPTION 'Fresh linked Admin/Gerencia milk actor required' USING ERRCODE='42501';END IF;
 RETURN actor;
END $$;
CREATE TABLE hato_milk_telegram.actions(sender bigint NOT NULL,chat_id bigint NOT NULL,message_id bigint NOT NULL,request_key uuid NOT NULL UNIQUE,actor jsonb NOT NULL,PRIMARY KEY(sender,chat_id,message_id),CHECK(sender BETWEEN 1 AND 9007199254740991 AND chat_id=sender AND message_id BETWEEN 1 AND 9007199254740991));
ALTER TABLE hato_milk_telegram.actions ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION hato_milk_telegram.immutable_action() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Immutable native milk action';END $$;
CREATE TRIGGER immutable_native_action BEFORE UPDATE OR DELETE ON hato_milk_telegram.actions FOR EACH ROW EXECUTE FUNCTION hato_milk_telegram.immutable_action();
CREATE TRIGGER no_truncate_native_action BEFORE TRUNCATE ON hato_milk_telegram.actions FOR EACH STATEMENT EXECUTE FUNCTION hato_milk_telegram.immutable_action();
CREATE FUNCTION hato_milk_telegram.write_traces() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE request hato_milk_telegram.requests;binding hato_milk_telegram.actions;actor jsonb;x jsonb;trace public.hato_correcciones;written public.hato_correcciones;entry jsonb;count_changes int=0;ids uuid[]='{}';BEGIN
 SELECT * INTO STRICT request FROM hato_milk_telegram.requests WHERE request_key=NEW.request_key;
 SELECT * INTO STRICT binding FROM hato_milk_telegram.actions WHERE request_key=NEW.request_key;
 actor=hato_milk_telegram.actor(binding.sender,binding.chat_id,binding.message_id);
 IF current_user<>'postgres' OR request.state<>'pending' OR actor IS DISTINCT FROM binding.actor OR NEW.receipt->'actor' IS DISTINCT FROM actor OR NEW.receipt->>'requestKey' IS DISTINCT FROM request.request_key::text OR NEW.receipt->'intent' IS DISTINCT FROM request.intent OR NEW.receipt->'original' IS DISTINCT FROM request.original OR NEW.receipt->'plan' IS DISTINCT FROM request.plan THEN RAISE EXCEPTION 'Trusted native milk correction context required';END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(request.plan->'accepted') LOOP
  IF entry->'before'='null'::jsonb OR entry->'before'=entry->'after' THEN CONTINUE;END IF;
  count_changes=count_changes+1;
  SELECT value INTO STRICT x FROM jsonb_array_elements(NEW.receipt->'corrections') WHERE value->'datos_anteriores'=entry->'before' AND value->'datos_nuevos'=entry->'after';
  trace=jsonb_populate_record(NULL::public.hato_correcciones,x);
  IF to_jsonb(trace) IS DISTINCT FROM x OR trace.id=ANY(ids) OR trace.tabla<>'hato_pesajes_leche' OR trace.operacion<>'update' OR trace.fila_id IS DISTINCT FROM(entry->'before'->>'id')::uuid OR trace.animal_id IS DISTINCT FROM(entry->'before'->>'animal_id')::uuid OR trace.corregido_por IS DISTINCT FROM request.owner_id OR trace.corregido_en IS DISTINCT FROM now() OR trace.motivo IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.hato_pesajes_leche t WHERE t.id=trace.fila_id AND to_jsonb(t)=entry->'after') THEN RAISE EXCEPTION 'Exact native milk correction required';END IF;
  ids=array_append(ids,trace.id);INSERT INTO public.hato_correcciones SELECT trace.* RETURNING * INTO written;
  IF NOT FOUND OR to_jsonb(written) IS DISTINCT FROM x THEN RAISE EXCEPTION 'Native milk correction suppressed/mutated';END IF;
 END LOOP;
 IF jsonb_array_length(NEW.receipt->'corrections')<>count_changes THEN RAISE EXCEPTION 'Exact native milk correction count required';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trusted_native_milk_corrections AFTER INSERT ON hato_milk_telegram.audit FOR EACH ROW EXECUTE FUNCTION hato_milk_telegram.write_traces();
CREATE FUNCTION hato_milk_telegram.step(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid,p_sender bigint,p_chat_id bigint,p_message_id bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_milk_telegram.requests;expected hato_milk_telegram.requests;before_domain jsonb;expected_domain jsonb;before_controls jsonb;expected_controls jsonb;herd jsonb;cell jsonb;old jsonb;created jsonb;written jsonb;row_value public.hato_pesajes_leche;accepted jsonb='[]';rejected jsonb='[]';before_rows jsonb='[]';after_rows jsonb='[]';changes jsonb='[]';traces jsonb;change jsonb;iso integer;capture_before jsonb;capture_after jsonb;receipt_value jsonb;a hato_milk_telegram.audit;wa hato_milk_telegram.audit;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS NOT NULL OR (hato_milk_telegram.actor(p_sender,p_chat_id,p_message_id)->>'profileId')::uuid IS DISTINCT FROM p_expected_owner OR p_request_key IS NULL THEN RAISE EXCEPTION 'Original milk weighing owner/key required' USING ERRCODE='42501';END IF;
 PERFORM hato_milk_telegram.assert_baseline();actor=hato_milk_telegram.actor(p_sender,p_chat_id,p_message_id);
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve','acknowledge') OR (p_action<>'prepare' AND p_intent IS NOT NULL) THEN RAISE EXCEPTION 'Invalid original milk weighing action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-milk weighing-owner:'||p_expected_owner::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-milk weighing-key:'||p_request_key::text,0));
 SELECT * INTO r FROM hato_milk_telegram.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original milk weighing owner changed' USING ERRCODE='42501';END IF;
 IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_milk_telegram.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original milk weighing audit missing';END IF;
 IF p_action='status' THEN IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='unknown';r.acknowledged=false;END IF;RETURN hato_milk_telegram.result(r);END IF;
 PERFORM hato_birth_undo.lock_domain();PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 before_domain=hato_birth_undo.capture_domain();expected_domain=before_domain;before_controls=hato_milk_telegram.controls();expected_controls=before_controls;
 herd=jsonb_build_object('rows',before_domain->'public.hato_pesajes_leche','animals',before_domain->'public.hato_animales','config',before_domain->'public.hato_config');
 IF p_action='prepare' THEN
  PERFORM hato_milk_telegram.validate(p_intent);
  IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'Original milk weighing intent changed';END IF;RETURN hato_milk_telegram.result(r);END IF;
  IF EXISTS(SELECT 1 FROM hato_milk_telegram.requests WHERE owner_id=p_expected_owner AND state IN('pending','committed') AND NOT acknowledged) THEN RAISE EXCEPTION 'Recover original milk weighing before replacement';END IF;
  SELECT (valor->>'iso')::integer INTO iso FROM public.hato_config WHERE clave='dia_pesaje_semanal' AND jsonb_typeof(valor)='object' AND jsonb_typeof(valor->'iso')='number';
  IF iso IS NULL OR iso NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'Current milk weighing day config required';END IF;
  FOR cell IN SELECT value FROM jsonb_array_elements(p_intent->'cells') LOOP
   SELECT to_jsonb(x) INTO old FROM public.hato_pesajes_leche x WHERE animal_id=(cell->>'animalId')::uuid AND fecha=(cell->>'date')::date;
   IF coalesce(old,'null'::jsonb) IS DISTINCT FROM cell->'observed' THEN RAISE EXCEPTION 'Observed milk cell changed before review';END IF;
   IF extract(isodow FROM (cell->>'date')::date)<>iso OR NOT EXISTS(SELECT 1 FROM public.hato_animales WHERE id=(cell->>'animalId')::uuid AND estado='activa' AND etapa IN('vaca','novilla')) THEN
    rejected=rejected||jsonb_build_array(jsonb_build_object('cell',cell,'reason','current_roster_or_weekday'));CONTINUE;
   END IF;
   IF old IS NULL THEN row_value=jsonb_populate_record(NULL::public.hato_pesajes_leche,jsonb_build_object('id',gen_random_uuid(),'animal_id',cell->'animalId','fecha',cell->'date','created_by',p_expected_owner));created=to_jsonb(row_value);ELSE created=old;END IF;
   created=created||jsonb_build_object('litros_am',cell->'am','litros_pm',cell->'pm','litros_total',coalesce((cell->>'am')::numeric,0)+coalesce((cell->>'pm')::numeric,0),'fuente','telegram');
   accepted=accepted||jsonb_build_array(jsonb_build_object('cell',cell,'before',old,'after',created));
  END LOOP;
  IF jsonb_array_length(accepted)=0 THEN RAISE EXCEPTION 'No accepted milk cells; review current roster/config';END IF;
  r.request_key=p_request_key;r.owner_id=p_expected_owner;r.intent=p_intent;r.original=herd;r.plan=jsonb_build_object('accepted',accepted,'rejected',rejected,'weekday',iso);
  capture_before=NULL;
  IF p_intent->>'captureId' IS NOT NULL THEN
   SELECT to_jsonb(c) INTO capture_before FROM public.hato_capturas_foto c WHERE id=(p_intent->>'captureId')::uuid;
   IF capture_before IS NULL OR capture_before->>'created_by' IS DISTINCT FROM p_expected_owner::text OR capture_before->>'tipo'<>'pesaje' OR capture_before->>'origen'<>'telegram' OR capture_before->>'desenlace'<>'pendiente' OR (capture_before->>'anio')::int<>(p_intent->>'year')::int OR (capture_before->>'mes')::int<>(p_intent->>'month')::int THEN RAISE EXCEPTION 'Current owner-bound pending milk photo required';END IF;
  END IF;
  r.plan=r.plan||jsonb_build_object('capture',capture_before);
  r.effective_date=(now() AT TIME ZONE 'America/Bogota')::date;r.state='pending';r.acknowledged=false;expected=r;
  INSERT INTO hato_milk_telegram.requests SELECT expected.* RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'milk weighing reservation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';r.acknowledged=false;expected=r;INSERT INTO hato_milk_telegram.requests SELECT expected.* RETURNING * INTO r;
  ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_milk_telegram.requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO r;
  ELSE RETURN hato_milk_telegram.result(r);END IF;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'milk weighing cancellation suppressed/mutated';END IF;
 ELSIF p_action='acknowledge' THEN
  IF r.state IS NULL OR r.state NOT IN('committed','canceled') THEN RAISE EXCEPTION 'Verify terminal original milk weighing first';END IF;
  IF r.acknowledged THEN RETURN hato_milk_telegram.result(r);END IF;
  expected=r;expected.acknowledged=true;UPDATE hato_milk_telegram.requests SET acknowledged=true WHERE request_key=p_request_key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'milk weighing acknowledgment suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
  IF r.state IS NULL THEN RAISE EXCEPTION 'Original prepared milk weighing required';END IF;
  IF r.state='committed' THEN RETURN hato_milk_telegram.result(r);ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled milk weighing cannot post';END IF;
  IF r.effective_date IS DISTINCT FROM (now() AT TIME ZONE 'America/Bogota')::date OR herd IS DISTINCT FROM r.original THEN RAISE EXCEPTION 'Original milk weighing source/day changed; resolve original';END IF;

  capture_before=r.plan->'capture';
  IF capture_before IS DISTINCT FROM 'null'::jsonb THEN
   SELECT to_jsonb(c) INTO capture_after FROM public.hato_capturas_foto c WHERE id=(capture_before->>'id')::uuid;
   IF capture_after IS DISTINCT FROM capture_before THEN RAISE EXCEPTION 'Original milk photo changed';END IF;
  END IF;
  FOR cell IN SELECT value FROM jsonb_array_elements(r.plan->'accepted') LOOP
   old=cell->'before';created=cell->'after';
   IF old='null'::jsonb THEN created=created||jsonb_build_object('created_at',now());END IF;
   row_value=jsonb_populate_record(NULL::public.hato_pesajes_leche,created);
   IF old='null'::jsonb THEN INSERT INTO public.hato_pesajes_leche SELECT row_value.* RETURNING to_jsonb(hato_pesajes_leche.*) INTO written;
   ELSE UPDATE public.hato_pesajes_leche SET litros_am=row_value.litros_am,litros_pm=row_value.litros_pm,litros_total=row_value.litros_total,fuente=row_value.fuente WHERE id=row_value.id RETURNING to_jsonb(hato_pesajes_leche.*) INTO written;END IF;
   IF NOT FOUND OR written IS DISTINCT FROM created THEN RAISE EXCEPTION 'Milk weighing cell suppressed/mutated';END IF;
   IF old<>'null'::jsonb THEN before_rows=before_rows||jsonb_build_array(old);IF old IS DISTINCT FROM created THEN changes=changes||jsonb_build_array(hato_chequeo_integrity.mutation('hato_pesajes_leche','update',old,created));END IF;END IF;
   after_rows=after_rows||jsonb_build_array(created);
  END LOOP;
  traces='[]';
  FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
   traces=traces||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'tabla','hato_pesajes_leche','operacion','update','fila_id',change->'before'->'id','animal_id',change->'before'->'animal_id','datos_anteriores',change->'before','datos_nuevos',change->'after','corregido_por',p_expected_owner,'corregido_en',now(),'motivo',NULL));
  END LOOP;
  IF jsonb_array_length(traces)<>jsonb_array_length(changes) THEN RAISE EXCEPTION 'Exact milk correction trace count required';END IF;
  FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
   IF(SELECT count(*) FROM jsonb_array_elements(traces)t WHERE t->>'tabla'='hato_pesajes_leche' AND t->>'operacion'='update' AND t->'datos_anteriores'=change->'before' AND t->'datos_nuevos'=change->'after' AND t->>'fila_id'=change->'before'->>'id' AND t->>'animal_id'=change->'before'->>'animal_id' AND t->>'corregido_por'=p_expected_owner::text AND(t->>'corregido_en')::timestamptz=now() AND t->>'motivo' IS NULL)<>1 THEN RAISE EXCEPTION 'Exact trusted milk correction trace required';END IF;
  END LOOP;
  expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_pesajes_leche',before_rows,after_rows);expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_correcciones','[]',traces);

  capture_after=capture_before;
  IF capture_before IS DISTINCT FROM 'null'::jsonb THEN
   capture_after=capture_before||jsonb_build_object('desenlace','ok','actualizado_en',now(),'celdas_confirmadas',jsonb_array_length(r.intent->'cells'),'filas_escritas',jsonb_array_length(after_rows),'detalle',NULL);
   UPDATE public.hato_capturas_foto SET desenlace='ok',actualizado_en=now(),celdas_confirmadas=jsonb_array_length(r.intent->'cells'),filas_escritas=jsonb_array_length(after_rows),detalle=NULL WHERE id=(capture_before->>'id')::uuid RETURNING to_jsonb(hato_capturas_foto.*) INTO written;
   IF NOT FOUND OR written IS DISTINCT FROM capture_after THEN RAISE EXCEPTION 'Milk photo outcome suppressed/mutated';END IF;
   expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_capturas_foto',jsonb_build_array(capture_before),jsonb_build_array(capture_after));
  END IF;
  receipt_value=jsonb_build_object('capture',jsonb_build_object('before',capture_before,'after',capture_after),'version',1,'requestKey',p_request_key,'owner',p_expected_owner,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'actor',actor,'recordedAt',now(),'before',before_rows,'after',after_rows,'corrections',traces,'footprints',jsonb_build_object('before',encode(sha256(convert_to(before_domain::text,'UTF8')),'hex'),'after',encode(sha256(convert_to(expected_domain::text,'UTF8')),'hex')));
  a.request_key=p_request_key;a.receipt=receipt_value;INSERT INTO hato_milk_telegram.audit SELECT a.* RETURNING * INTO wa;
  IF NOT FOUND OR to_jsonb(wa) IS DISTINCT FROM to_jsonb(a) THEN RAISE EXCEPTION 'milk weighing trusted audit suppressed/mutated';END IF;
  expected=r;expected.state='committed';expected.receipt=receipt_value;UPDATE hato_milk_telegram.requests SET state='committed',receipt=receipt_value WHERE request_key=p_request_key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'milk weighing committed control suppressed/mutated';END IF;
  expected_controls=jsonb_set(expected_controls,'{audit}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((expected_controls->'audit')||jsonb_build_array(to_jsonb(a)))x));
 END IF;
 expected_controls=jsonb_set(expected_controls,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(before_controls->'requests')x WHERE x->>'request_key'<>p_request_key::text)||jsonb_build_array(to_jsonb(expected)))x));
 PERFORM hato_milk_telegram.assert_baseline();
 IF hato_milk_telegram.controls() IS DISTINCT FROM expected_controls OR hato_birth_undo.capture_domain() IS DISTINCT FROM expected_domain OR hato_milk_telegram.actor(p_sender,p_chat_id,p_message_id) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'milk weighing final authority/domain/control readback mismatch';END IF;
 RETURN hato_milk_telegram.result(r);
END $$;

CREATE FUNCTION public.fn_hato_milk_weighing_telegram(p_action text,p_sender bigint,p_chat_id bigint,p_message_id bigint,p_intent jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;binding hato_milk_telegram.actions;expected hato_milk_telegram.actions;proof jsonb;before_actions jsonb;BEGIN
 actor=hato_milk_telegram.actor(p_sender,p_chat_id,p_message_id);PERFORM hato_milk_weighing.assert_baseline();
 IF p_action NOT IN('prepare','post','status','resolve','acknowledge','source') OR p_action IS NULL OR(p_action<>'prepare' AND p_intent IS NOT NULL) THEN RAISE EXCEPTION 'Invalid native milk action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('native-milk-owner:'||(actor->>'profileId'),0));
 IF p_action='source' THEN
  PERFORM hato_birth_undo.lock_domain();RETURN jsonb_build_object('rows',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM public.hato_pesajes_leche x),'animals',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM public.hato_animales x),'config',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM public.hato_config x));
 END IF;
 SELECT * INTO binding FROM hato_milk_telegram.actions WHERE sender=p_sender AND chat_id=p_chat_id AND message_id=p_message_id;
 IF FOUND AND binding.actor IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Original native milk actor changed' USING ERRCODE='42501';END IF;
 IF binding.request_key IS NULL THEN
  IF p_action='status' THEN RETURN jsonb_build_object('version',1,'actor',actor,'action',jsonb_build_object('sender',p_sender,'chatId',p_chat_id,'messageId',p_message_id),'result',NULL);END IF;
  IF p_action NOT IN('prepare','resolve') THEN RAISE EXCEPTION 'Original native milk reservation required';END IF;
  -- A canceled pre-prepare action is a permanent fence, never a replacement key.
  binding.sender=p_sender;binding.chat_id=p_chat_id;binding.message_id=p_message_id;binding.actor=actor;binding.request_key=gen_random_uuid();expected=binding;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY sender,chat_id,message_id),'[]') INTO before_actions FROM hato_milk_telegram.actions x;
  INSERT INTO hato_milk_telegram.actions SELECT expected.* RETURNING * INTO binding;
  IF NOT FOUND OR to_jsonb(binding) IS DISTINCT FROM to_jsonb(expected) OR (SELECT jsonb_agg(x ORDER BY x->>'sender',x->>'chat_id',x->>'message_id') FROM jsonb_array_elements(before_actions||jsonb_build_array(to_jsonb(expected)))x) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sender::text,x.chat_id::text,x.message_id::text) FROM hato_milk_telegram.actions x) THEN RAISE EXCEPTION 'Native milk identity suppressed/mutated';END IF;
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY sender,chat_id,message_id),'[]') INTO before_actions FROM hato_milk_telegram.actions x;
 proof=hato_milk_telegram.step(p_action,binding.request_key,p_intent,(actor->>'profileId')::uuid,p_sender,p_chat_id,p_message_id);
 IF before_actions IS DISTINCT FROM (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY sender,chat_id,message_id),'[]') FROM hato_milk_telegram.actions x) OR hato_milk_telegram.actor(p_sender,p_chat_id,p_message_id) IS DISTINCT FROM actor OR NOT EXISTS(SELECT 1 FROM hato_milk_telegram.actions x WHERE to_jsonb(x)=to_jsonb(binding)) THEN RAISE EXCEPTION 'Native milk final binding/actor changed';END IF;
 RETURN jsonb_build_object('version',1,'actor',actor,'action',jsonb_build_object('sender',p_sender,'chatId',p_chat_id,'messageId',p_message_id),'result',proof);
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_milk_telegram FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_milk_telegram FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_milk_weighing_telegram(text,bigint,bigint,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_milk_weighing_telegram(text,bigint,bigint,bigint,jsonb) TO service_role;
COMMIT;
