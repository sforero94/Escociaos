DO $$
DECLARE checks integer := 0;
BEGIN
 INSERT INTO aplicaciones VALUES ('same', 'synthetic', '2031-05-01','2031-05-01','2032-02-29','2032-02-29'); checks:=checks+1;
 INSERT INTO aplicaciones VALUES ('ongoing', 'synthetic', NULL,NULL,'2031-05-01',NULL); checks:=checks+1;
 INSERT INTO aplicaciones VALUES ('independent', 'synthetic', '2032-05-01','2032-05-02','2031-05-01','2031-05-02'); checks:=checks+1;
 BEGIN
  INSERT INTO aplicaciones VALUES ('bad-planned', 'synthetic', '2031-05-02','2031-05-01',NULL,NULL);
  RAISE EXCEPTION 'Expected planned rejection';
 EXCEPTION WHEN check_violation THEN checks:=checks+1; END;
 BEGIN
  INSERT INTO aplicaciones VALUES ('bad-actual', 'synthetic', NULL,NULL,'2031-05-02','2031-05-01');
  RAISE EXCEPTION 'Expected actual rejection';
 EXCEPTION WHEN check_violation THEN checks:=checks+1; END;
 BEGIN
  UPDATE aplicaciones SET fecha_fin_ejecucion='2031-04-30' WHERE id='ongoing';
  RAISE EXCEPTION 'Expected one-column rejection';
 EXCEPTION WHEN check_violation THEN checks:=checks+1; END;
 UPDATE aplicaciones SET nombre='unrelated synthetic edit' WHERE id='legacy'; checks:=checks+1;
 UPDATE aplicaciones SET fecha_inicio_ejecucion='2031-04-30' WHERE id='legacy'; checks:=checks+1;
 BEGIN
  UPDATE aplicaciones SET nombre='must roll back' WHERE id='ongoing';
  UPDATE aplicaciones SET fecha_fin_ejecucion='2031-04-30' WHERE id='ongoing';
  RAISE EXCEPTION 'Expected transactional closure rejection';
 EXCEPTION WHEN check_violation THEN
  IF (SELECT nombre FROM aplicaciones WHERE id='ongoing')='must roll back' THEN RAISE EXCEPTION 'Closure was not atomic'; END IF;
  checks:=checks+1;
 END;
 PERFORM set_config('TimeZone','Pacific/Kiritimati',true);
 UPDATE aplicaciones SET fecha_fin_ejecucion='2031-05-01' WHERE id='ongoing'; checks:=checks+1;
 PERFORM set_config('TimeZone','Pacific/Pago_Pago',true);
 UPDATE aplicaciones SET fecha_fin_ejecucion='2031-05-01' WHERE id='ongoing'; checks:=checks+1;
 RAISE NOTICE 'Passed % synthetic application date checks',checks;
END $$;
