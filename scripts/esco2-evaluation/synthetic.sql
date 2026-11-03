-- Datos inventados. Control local de aritmética, no esquema de export ni RLS.
CREATE TABLE registros_trabajo (id TEXT PRIMARY KEY, lote_id TEXT, fecha_trabajo TEXT, fraccion_jornal NUMERIC, costo_jornal NUMERIC);
INSERT INTO registros_trabajo VALUES
 ('r1','SYN-lote-a','2026-10-01',1,100),
 ('r2',NULL,'2026-10-02',0.5,50),
 ('r3','SYN-lote-a','2026-10-03',0.25,NULL),
 ('r4','SYN-lote-b','2026-11-01',2,200);
CREATE TABLE monitoreos (id TEXT PRIMARY KEY, muestreados INTEGER, afectados INTEGER);
INSERT INTO monitoreos VALUES ('m1',10,5),('m2',90,9);
CREATE TABLE clima (fecha TEXT PRIMARY KEY, lluvia NUMERIC);
INSERT INTO clima VALUES ('2026-10-01',0),('2026-10-02',NULL),('2026-10-03',4);
CREATE TABLE hato_animales (id TEXT PRIMARY KEY, numero INTEGER);
INSERT INTO hato_animales VALUES ('SYN-animal-a',77),('SYN-animal-b',77);
CREATE TABLE hato_pesajes_leche (animal_id TEXT, fecha TEXT, litros NUMERIC);
INSERT INTO hato_pesajes_leche VALUES ('SYN-animal-a','2026-10-01',0),('SYN-animal-b','2026-10-01',NULL);
CREATE TABLE hato_produccion_quincenal (id TEXT PRIMARY KEY, fin_ingreso_id TEXT, origen_dato TEXT, litros_total NUMERIC);
CREATE TABLE fin_ingresos (id TEXT PRIMARY KEY, cantidad NUMERIC);
INSERT INTO hato_produccion_quincenal VALUES ('SYN-q1','SYN-ingreso-1','medido',NULL);
INSERT INTO fin_ingresos VALUES ('SYN-ingreso-1',300);
CREATE TABLE plan_aplicacion (aplicacion_id TEXT, producto_id TEXT, unidad TEXT, cantidad NUMERIC);
CREATE TABLE consumo_aplicacion (aplicacion_id TEXT, producto_id TEXT, unidad TEXT, cantidad NUMERIC);
INSERT INTO plan_aplicacion VALUES ('SYN-app','SYN-producto-a','kg',10),('SYN-app','SYN-producto-b','L',20);
INSERT INTO consumo_aplicacion VALUES ('SYN-app','SYN-producto-a','kg',4),('SYN-app','SYN-producto-a','kg',3),('SYN-app','SYN-producto-b','L',8);
