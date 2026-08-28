/**
 * Tests adversariales de autorización -- Fase 2 (RPC) de
 * `docs/brief_tecnico_verificacion_inventario.md` §12 ("Adversarial de
 * autorización", dueño QA en el brief; escritos acá porque la tarea de esta
 * sesión los pidió explícitamente como parte de la Fase 2).
 *
 * Esta suite es ESTRUCTURAL: parsea `126_ronda_inventario_rpcs.sql` y
 * comprueba que cada guarda de autorización sigue presente y con la forma
 * exacta que el §6.1/§6.2/§6.4/§6.5 del brief técnico exige -- no ejecuta
 * SQL contra una base viva (CLAUDE.md: los tests de Vitest de este repo
 * mockean Supabase, nunca corren contra Postgres real). El comportamiento
 * REAL de estos ocho escenarios se verificó aparte, contra un Postgres 17
 * real en Docker con la migración 125+126 aplicadas literalmente, durante la
 * implementación de esta migración -- los ocho pasaron (ver el reporte de la
 * sesión). Lo que esta suite defiende hacia ADELANTE es que ningún PR
 * posterior borre una guarda sin que algo se ponga rojo -- mismo criterio que
 * `dialogScrollContract.test.ts` o `rondaInventarioCausasParidad.test.ts`:
 * un `CHECK`/una guarda sin test es una intención, no una garantía.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RUTA_MIGRACION = resolve(__dirname, '../sql/migrations/126_ronda_inventario_rpcs.sql');
let SQL_126: string;

// `fn_ronda_proponer_ajuste` fue enmendada en vivo por la migración 130
// (2026-08-28, `CREATE OR REPLACE`, ver ese archivo) -- NUNCA se edita el
// archivo de la 126 (regla del repo: no se toca una migración aplicada), así
// que el cuerpo que 126.sql muestra para esa función ya NO es el que corre
// hoy en producción. El describe de más abajo `fn_ronda_proponer_ajuste --
// B-5...` sigue siendo válido: valida lo que 126 introdujo (autorización
// David/Uriel), y nada de eso se tocó. El describe `-- guarda de estado
// (migración 130)`, después de `fn_ronda_aplicar_ajuste`, valida lo que 130
// agregó, leyendo el archivo de la 130.
const RUTA_MIGRACION_130 = resolve(__dirname, '../sql/migrations/130_fn_ronda_proponer_ajuste_guarda_estado.sql');
let SQL_130: string;

// `fn_ronda_confirmar_hallazgos` fue enmendada en vivo por la migración 131
// (2026-08-28, CA-4, ver ese archivo) -- mismo criterio que la 130 arriba:
// nunca se toca 126, se lee 131 aparte.
const RUTA_MIGRACION_131 = resolve(__dirname, '../sql/migrations/131_fn_ronda_confirmar_hallazgos_fuera_de_alcance.sql');
let SQL_131: string;

const NOMBRES_RPC = [
  'fn_ronda_abrir',
  'fn_ronda_confirmar_hallazgos',
  'fn_ronda_deshacer_confirmacion',
  'fn_ronda_explicacion_david',
  'fn_ronda_resolver_con_captura',
  'fn_ronda_proponer_ajuste',
  'fn_ronda_decidir_ajuste',
  'fn_ronda_aplicar_ajuste',
  'fn_ronda_cerrar',
] as const; // fn_ronda_emitir_reporte queda aparte -- ver su describe propio.

function extraerBloque(nombreFuncion: string): string {
  const inicio = SQL_126.indexOf(`CREATE FUNCTION ${nombreFuncion}`);
  if (inicio === -1) {
    throw new Error(`No se encontró "CREATE FUNCTION ${nombreFuncion}" en 126_ronda_inventario_rpcs.sql.`);
  }
  const fin = SQL_126.indexOf('END $$;', inicio);
  if (fin === -1) {
    throw new Error(`No se encontró el cierre "END $$;" de ${nombreFuncion}.`);
  }
  return SQL_126.slice(inicio, fin + 'END $$;'.length);
}

beforeAll(() => {
  SQL_126 = readFileSync(RUTA_MIGRACION, 'utf-8');
  SQL_130 = readFileSync(RUTA_MIGRACION_130, 'utf-8');
  SQL_131 = readFileSync(RUTA_MIGRACION_131, 'utf-8');
});

describe('contrato de forma -- las 10 RPC + fn_ronda_validar_actor existen con la firma esperada', () => {
  it('las 10 funciones del §6.2 están declaradas (10/10, ni una de más ni de menos entre los nombres esperados)', () => {
    const presentes = [...NOMBRES_RPC, 'fn_ronda_emitir_reporte'].filter((n) => SQL_126.includes(`CREATE FUNCTION ${n}`));
    expect(presentes).toHaveLength(10);
  });

  it('fn_ronda_validar_actor está declarada con la firma (UUID, UUID, TEXT) -> VOID', () => {
    expect(SQL_126).toContain('CREATE FUNCTION fn_ronda_validar_actor(');
    const bloque = extraerBloque('fn_ronda_validar_actor');
    expect(bloque).toContain('RETURNS VOID');
  });

  it.each(NOMBRES_RPC)('%s: SECURITY INVOKER, search_path = public, pg_temp (pg_temp AL FINAL), payload JSONB -> JSONB, y llama a fn_ronda_validar_actor', (nombre) => {
    // El header completo (CREATE FUNCTION ... AS $$) vive ANTES del "END $$;"
    // que extraerBloque usa como cierre, así que se relee directamente del
    // archivo en vez de recortar dos veces.
    const inicio = SQL_126.indexOf(`CREATE FUNCTION ${nombre}(`);
    const finFirma = SQL_126.indexOf('AS $$', inicio);
    const firma = SQL_126.slice(inicio, finFirma);
    expect(firma).toContain('payload JSONB');
    expect(firma).toContain('RETURNS JSONB');
    expect(firma).toContain('SECURITY INVOKER');
    expect(firma).toContain('SET search_path = public, pg_temp');

    const cuerpo = extraerBloque(nombre);
    expect(cuerpo).toContain('fn_ronda_validar_actor(');
    // Ninguna de las 10 debe derivar el actor del JWT/sesión -- D-T4: siempre
    // explícito en el payload.
    expect(cuerpo).not.toMatch(/auth\.uid\(\)\s*::\s*uuid\s+AS\s+v_actor/i);
  });

  it.each(NOMBRES_RPC)('%s: EXECUTE revocado a anon (y a PUBLIC), concedido a authenticated y service_role', (nombre) => {
    const inicio = SQL_126.indexOf(`CREATE FUNCTION ${nombre}(`);
    const finGrants = SQL_126.indexOf('-- ---', SQL_126.indexOf('GRANT EXECUTE', inicio));
    const bloqueGrants = SQL_126.slice(inicio, finGrants === -1 ? undefined : finGrants);
    expect(bloqueGrants).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION ${nombre}\\(JSONB\\) FROM PUBLIC`));
    expect(bloqueGrants).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION ${nombre}\\(JSONB\\) FROM anon`));
    expect(bloqueGrants).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${nombre}\\(JSONB\\) TO authenticated, service_role`));
  });
});

describe('fn_ronda_validar_actor -- literal del §6.1 del brief técnico (D-T4/D-T5)', () => {
  let cuerpo: string;
  beforeAll(() => {
    cuerpo = extraerBloque('fn_ronda_validar_actor');
  });

  it('exige EXACTAMENTE uno de p_usuario/p_telegram', () => {
    expect(cuerpo).toContain('IF (p_usuario IS NULL) = (p_telegram IS NULL) THEN');
    expect(cuerpo).toContain('Actor inválido: debe venir exactamente uno de usuario/telegram.');
  });

  it('ADVERSARIAL 1 -- rama navegador: una sesión con auth.uid() NO NULL nunca puede reclamar un actor_telegram_usuario_id', () => {
    expect(cuerpo).toContain('IF auth.uid() IS NOT NULL THEN');
    expect(cuerpo).toContain('IF p_telegram IS NOT NULL THEN');
    expect(cuerpo).toContain('Una sesión autenticada no puede actuar como un usuario de Telegram.');
    // Verificado en vivo contra Postgres 17: browser session con
    // actor_telegram_usuario_id seteado -> RAISE EXCEPTION con este mensaje.
  });

  it('rama navegador: el actor declarado debe SER auth.uid(), nunca otro usuario', () => {
    expect(cuerpo).toContain('IF p_usuario <> (SELECT auth.uid()) THEN');
    expect(cuerpo).toContain('El actor declarado no coincide con la sesión.');
  });

  it('ADVERSARIAL 2 -- rama service_role: exige telegram_usuarios.activo Y p_modulo en modulos_permitidos', () => {
    expect(cuerpo).toContain('WHERE t.id = p_telegram AND t.activo AND p_modulo = ANY(t.modulos_permitidos)');
    expect(cuerpo).toContain('El usuario de Telegram no está activo o no tiene el módulo %.');
    // Verificado en vivo: telegram_usuarios con modulos_permitidos que NO
    // incluye 'inventario_ronda' -> fn_ronda_abrir rechaza con este mensaje.
  });
});

describe('fn_ronda_decidir_ajuste -- guarda de Gerencia por vínculo, NUNCA es_usuario_gerencia() (§6.1)', () => {
  let cuerpo: string;
  beforeAll(() => {
    cuerpo = extraerBloque('fn_ronda_decidir_ajuste');
  });

  it('NO llama a es_usuario_gerencia() -- con service_role esa función da falso siempre', () => {
    expect(cuerpo.toLowerCase()).not.toContain('es_usuario_gerencia()');
  });

  it('ADVERSARIAL 3 -- usa el vínculo telegram_usuarios.usuario_id -> usuarios.rol, literal del §6.1', () => {
    expect(cuerpo).toContain("u.rol = 'Gerencia'::rol_usuario");
    expect(cuerpo).toContain('COALESCE(v_actor_usuario, (SELECT t.usuario_id FROM telegram_usuarios t WHERE t.id = v_actor_telegram))');
    expect(cuerpo).toContain('Aprobar o desestimar un ajuste es exclusivo de Gerencia (R-14 vía b).');
    // Verificado en vivo: telegram_usuarios.usuario_id NULL -> el COALESCE
    // da NULL -> ninguna fila en usuarios -> EXISTS falso -> RAISE EXCEPTION.
    // Es la trampa D-T5 exacta: "el bypass de RLS podría haberse vuelto un
    // agujero" si esta guarda no existiera.
  });

  it('CA-11: decision_causa es obligatoria SIEMPRE, aprobado o desestimado -- no sólo cuando se aprueba', () => {
    expect(cuerpo).toContain("IF v_causa_clave IS NULL OR v_causa_clave = '' THEN");
    expect(cuerpo).toContain('decision_causa es requerida (CA-11)');
  });
});

describe('fn_ronda_confirmar_hallazgos -- ADVERSARIAL 4: doble confirmación no duplica excepciones', () => {
  let cuerpo: string;
  beforeAll(() => {
    cuerpo = extraerBloque('fn_ronda_confirmar_hallazgos');
  });

  it('bloquea el transcrito con FOR UPDATE y exige estado=preview_pendiente antes de insertar nada', () => {
    expect(cuerpo).toContain('SELECT * INTO v_transcrito FROM rondas_transcritos WHERE id = v_transcrito_id FOR UPDATE');
    expect(cuerpo).toContain("IF v_transcrito.estado <> 'preview_pendiente' THEN");
    expect(cuerpo).toContain('no duplica excepciones');
  });

  it('CA-32: rechaza cualquier hallazgo sin producto_id resuelto', () => {
    expect(cuerpo).toContain('IF v_producto_id IS NULL THEN');
    expect(cuerpo).toContain('CA-32');
  });
});

describe('fn_ronda_confirmar_hallazgos -- ADVERSARIAL 9: CA-4, producto en cero (hallazgo real de Santiago, migración 131, 2026-08-28)', () => {
  // Santiago, probando en vivo en producción, narró "15-15-15" -- un
  // fertilizante que existe en `productos` pero con cantidad_actual=0 y
  // activo=false, así que `fn_ronda_abrir` (126) nunca lo congeló en
  // rondas_inventario_alcance. CA-4 del brief de producto YA decía "los
  // productos en cero no entran solos; Uriel puede reportar uno igual si lo
  // encuentra" -- era un gap real entre el brief y el código de la Fase 2,
  // no una reinterpretación. Este describe defiende que la rama nueva no se
  // pierda en un PR posterior.
  it('re-verifica server-side antes de confiar en la bandera del cliente -- nunca agrega al alcance en silencio', () => {
    expect(SQL_131).toContain("v_fuera_de_alcance := COALESCE((v_h ->> 'fuera_de_alcance')::BOOLEAN, FALSE);");
    expect(SQL_131).toContain('SELECT id, cantidad_actual, unidad_medida, precio_unitario, nombre');
    expect(SQL_131).toContain('FROM productos WHERE id = v_producto_id');
  });

  it('rechaza el caso si el producto ya tiene existencia > 0 -- no es CA-4, puede ser P-3, no se agrega solo', () => {
    expect(SQL_131).toContain('IF v_producto_vivo.cantidad_actual > 0 THEN');
    expect(SQL_131).toContain('no es un caso CA-4');
  });

  it('el INSERT a rondas_inventario_alcance usa teórico 0 y las MISMAS columnas que fn_ronda_abrir (126)', () => {
    expect(SQL_131).toContain(
      'INSERT INTO rondas_inventario_alcance (ronda_id, producto_id, cantidad_teorica, unidad, precio_unitario, nombre_producto)',
    );
    expect(SQL_131).toContain(
      'VALUES (v_transcrito.ronda_id, v_producto_vivo.id, 0, v_producto_vivo.unidad_medida, v_producto_vivo.precio_unitario, v_producto_vivo.nombre)',
    );
  });

  it('el INSERT es idempotente -- ON CONFLICT sobre la PK real de la tabla (ronda_id, producto_id)', () => {
    expect(SQL_131).toContain('ON CONFLICT (ronda_id, producto_id) DO NOTHING');
  });

  it('un hallazgo SIN fuera_de_alcance no pasa por la rama nueva -- comportamiento previo intacto', () => {
    // La guarda original -- "no está en el alcance congelado" -- sigue
    // presente sin condicionar, para el camino de siempre.
    expect(SQL_131).toContain('el producto % no está en el alcance congelado de la ronda % (P-3)');
  });

  it('CREATE OR REPLACE, nunca DROP+CREATE -- no abre una ventana sin la función (precedente 077)', () => {
    expect(SQL_131).toContain('CREATE OR REPLACE FUNCTION fn_ronda_confirmar_hallazgos');
    expect(SQL_131).not.toMatch(/DROP\s+FUNCTION\s+fn_ronda_confirmar_hallazgos/i);
  });
});

describe('fn_ronda_proponer_ajuste -- B-5: "David o Uriel" (corrección del orquestador, 2026-08-28)', () => {
  let cuerpo: string;
  beforeAll(() => {
    cuerpo = extraerBloque('fn_ronda_proponer_ajuste');
  });

  it('autoriza inventario_ronda (Uriel) O inventario_explicacion (David) -- nunca solo David', () => {
    // La primera versión de esta migración transcribía el §6.2 del brief
    // técnico, que sólo listaba 'inventario_explicacion'. B-5 del brief de
    // producto dice literal "Como David o como Uriel, quiero proponer el
    // ajuste" -- cita directa de Santiago (§3.2 punto 8): "El ajuste lo
    // puede proponer David o Uriel". Este test defiende que la corrección
    // no se revierta en un PR posterior por transcribir el brief técnico
    // sin mirar el de producto.
    expect(cuerpo).toContain("ARRAY['inventario_ronda', 'inventario_explicacion']");
    expect(cuerpo).not.toContain("PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, 'inventario_explicacion');");
  });

  it('NUNCA autoriza inventario_aprobacion -- Santiago decide (B-6), no propone (B-5)', () => {
    // El arreglo del array de módulos NO debe deslizarse hacia "los tres
    // módulos" como en fn_ronda_aplicar_ajuste -- ahí sí los tres pueden
    // porque aplicar es mecánico (B-7); acá proponer es un rol específico
    // de David/Uriel, y B-5 no nombra a Santiago.
    expect(cuerpo).not.toContain("ARRAY['inventario_ronda', 'inventario_explicacion', 'inventario_aprobacion']");
  });

  it('sigue exigiendo explicacion_david_en IS NOT NULL antes de proponer (CA-38)', () => {
    expect(cuerpo).toContain('IF v_excepcion.explicacion_david_en IS NULL THEN');
  });

  it('el delta se calcula server-side de los valores YA congelados (R-4), nunca de lo que mande el cliente', () => {
    expect(cuerpo).toContain('v_delta := v_excepcion.cantidad_fisica - v_excepcion.teorico_conteo');
  });
});

describe('fn_ronda_proponer_ajuste -- ADVERSARIAL 9: guarda de estado (hallazgo del orquestador, migración 130, 2026-08-28)', () => {
  // Hallazgo durante la revisión de Fase 4: `fn_ronda_proponer_ajuste` era la
  // ÚNICA de las diez RPC del ciclo que no revalidaba el `estado` actual de
  // la excepción antes de escribir -- sólo exigía `explicacion_david_en IS
  // NOT NULL`, una condición que queda cierta para siempre una vez que David
  // explica. Un `callback_data` de Telegram reenviado (`rpa:<id>:c<n>:ok`,
  // bot.ts) podía volver a llamarla sobre una excepción YA decidida o
  // aplicada y resetear su estado a 'ajuste_propuesto' en silencio, abriendo
  // la puerta a una segunda decisión y una segunda aplicación del mismo
  // ajuste. Ver el encabezado de 130_fn_ronda_proponer_ajuste_guarda_estado.sql
  // para el análisis completo. Este describe defiende que la guarda no se
  // pierda en un PR posterior -- mismo criterio que el resto del archivo.
  it('rechaza proponer sobre una excepción que no está en estado "explicada"', () => {
    expect(SQL_130).toContain("IF v_excepcion.estado <> 'explicada' THEN");
    expect(SQL_130).toContain('RAISE EXCEPTION');
  });

  it('la guarda de estado va DESPUÉS de la de explicacion_david_en -- ambas condiciones se exigen, ninguna reemplaza a la otra', () => {
    const idxExplicacion = SQL_130.indexOf('IF v_excepcion.explicacion_david_en IS NULL THEN');
    const idxEstado = SQL_130.indexOf("IF v_excepcion.estado <> 'explicada' THEN");
    expect(idxExplicacion).toBeGreaterThan(-1);
    expect(idxEstado).toBeGreaterThan(idxExplicacion);
  });

  it('no toca la autorización B-5 (David o Uriel, nunca Santiago) que corrigió la 126', () => {
    expect(SQL_130).toContain("ARRAY['inventario_ronda', 'inventario_explicacion']");
    expect(SQL_130).not.toContain("ARRAY['inventario_ronda', 'inventario_explicacion', 'inventario_aprobacion']");
  });

  it('CREATE OR REPLACE, nunca DROP+CREATE -- no abre una ventana sin la función (precedente 077)', () => {
    expect(SQL_130).toContain('CREATE OR REPLACE FUNCTION fn_ronda_proponer_ajuste');
    expect(SQL_130).not.toMatch(/DROP\s+FUNCTION\s+fn_ronda_proponer_ajuste/i);
  });
});

describe('fn_ronda_aplicar_ajuste -- ADVERSARIAL 5 y 6', () => {
  let cuerpo: string;
  beforeAll(() => {
    cuerpo = extraerBloque('fn_ronda_aplicar_ajuste');
  });

  it('ADVERSARIAL 5: sólo aplica si estado=ajuste_aprobado, bloqueado con FOR UPDATE -- doble aplicación imposible', () => {
    expect(cuerpo).toContain('SELECT * INTO v_excepcion FROM rondas_excepciones WHERE id = v_excepcion_id FOR UPDATE');
    expect(cuerpo).toContain("IF v_excepcion.estado <> 'ajuste_aprobado' THEN");
  });

  it('ADVERSARIAL 6: si el teórico vivo difiere del congelado, informa ANTES de aplicar y NO escribe nada -- salvo confirmar_cambio_teorico', () => {
    const indiceGuarda = cuerpo.indexOf('teorico_cambio');
    const indicePrimerInsert = cuerpo.indexOf('INSERT INTO movimientos_inventario');
    expect(indiceGuarda).toBeGreaterThan(-1);
    expect(indicePrimerInsert).toBeGreaterThan(-1);
    // La guarda de teórico-cambiado tiene que aparecer ANTES del primer
    // INSERT -- si no, "informar antes de aplicar" sería mentira.
    expect(indiceGuarda).toBeLessThan(indicePrimerInsert);
    expect(cuerpo).toContain("'aplicado', FALSE");
    expect(cuerpo).toContain('NOT v_confirmar_cambio');
  });

  it('R-4/CA-2: el saldo nuevo es SIEMPRE vivo + delta -- nunca "nuevo := fisico" (fijación)', () => {
    expect(cuerpo).toContain('v_nuevo := v_vivo + v_delta');
    expect(cuerpo).not.toMatch(/v_nuevo\s*:=\s*v_excepcion\.cantidad_fisica\s*;/);
  });

  it('acepta los tres módulos de la ronda (David, Uriel o Santiago pueden ejecutar un ajuste ya aprobado)', () => {
    expect(cuerpo).toContain("ARRAY['inventario_ronda', 'inventario_explicacion', 'inventario_aprobacion']");
  });
});

describe('fn_ronda_deshacer_confirmacion -- ADVERSARIAL 7 y 8, las TRES condiciones de la ventana de P-1/§6.5', () => {
  let cuerpo: string;
  beforeAll(() => {
    cuerpo = extraerBloque('fn_ronda_deshacer_confirmacion');
  });

  it('condición 1: el transcrito debe estar confirmado', () => {
    expect(cuerpo).toContain("IF v_transcrito.estado <> 'confirmado' THEN");
  });

  it('ADVERSARIAL 8 -- condición 2 (la que P-1 destapó): la ronda debe seguir en_curso', () => {
    expect(cuerpo).toContain("IF v_ronda.estado <> 'en_curso' THEN");
    expect(cuerpo).toContain('ya no está en curso');
    expect(cuerpo).toContain('R-10 prohíbe recalcularlo');
  });

  it('ADVERSARIAL 7 -- condición 3: NINGUNA excepción del transcrito puede tener explicacion_david_en IS NOT NULL', () => {
    expect(cuerpo).toContain('WHERE transcrito_id = v_transcrito_id AND explicacion_david_en IS NOT NULL');
    expect(cuerpo).toContain('ya fue tocada por David');
  });

  it('es el único RPC del conjunto que borra filas (DELETE), y no lleva GRANT/política DELETE -- sólo funciona vía service_role', () => {
    expect(cuerpo).toContain('DELETE FROM rondas_excepciones WHERE transcrito_id = v_transcrito_id');
    expect(SQL_126).not.toMatch(/CREATE POLICY[^;]*DELETE[^;]*rondas_excepciones/i);
  });

  it('intentos_preview NO se toca al deshacer (si se reiniciara, Deshacer sería un rodeo infinito alrededor de CA-35)', () => {
    expect(cuerpo).not.toMatch(/intentos_preview\s*=/);
  });
});

describe('fn_ronda_resolver_con_captura -- CA-8: nunca "Ajuste", siempre explicada por David primero', () => {
  let cuerpo: string;
  beforeAll(() => {
    cuerpo = extraerBloque('fn_ronda_resolver_con_captura');
  });

  it("exige estado='explicada' Y explicacion_david_en IS NOT NULL antes de escribir nada", () => {
    expect(cuerpo).toContain("IF v_excepcion.estado <> 'explicada' OR v_excepcion.explicacion_david_en IS NULL THEN");
  });

  it("rechaza tipo_movimiento = 'Ajuste' -- CA-8 literal", () => {
    expect(cuerpo).toContain("IF v_tipo NOT IN ('Entrada', 'Salida por Aplicación', 'Salida Otros') THEN");
    expect(cuerpo).toContain('nunca "Ajuste"');
  });

  it('valida saldo resultante >= 0 con FOR UPDATE sobre productos antes de insertar el movimiento', () => {
    const indiceLock = cuerpo.indexOf('FROM productos WHERE id = v_excepcion.producto_id FOR UPDATE');
    const indiceInsert = cuerpo.indexOf('INSERT INTO movimientos_inventario');
    expect(indiceLock).toBeGreaterThan(-1);
    expect(indiceLock).toBeLessThan(indiceInsert);
    expect(cuerpo).toContain('saldo negativo');
  });
});

describe('fn_ronda_emitir_reporte -- desviación documentada: NO llama a fn_ronda_validar_actor, exclusiva de service_role', () => {
  let cuerpo: string;
  beforeAll(() => {
    cuerpo = extraerBloque('fn_ronda_emitir_reporte');
  });

  it('no llama a fn_ronda_validar_actor (no hay actor humano detrás de la llamada del tick)', () => {
    expect(cuerpo).not.toContain('fn_ronda_validar_actor(');
  });

  it('EXECUTE revocado también de authenticated (no sólo anon) -- exclusiva de service_role', () => {
    const inicio = SQL_126.indexOf('CREATE FUNCTION fn_ronda_emitir_reporte(');
    const bloqueGrants = SQL_126.slice(inicio, SQL_126.indexOf('-- ---', SQL_126.indexOf('GRANT EXECUTE', inicio)));
    expect(bloqueGrants).toContain('REVOKE EXECUTE ON FUNCTION fn_ronda_emitir_reporte(JSONB) FROM authenticated');
    expect(bloqueGrants).toMatch(/GRANT EXECUTE ON FUNCTION fn_ronda_emitir_reporte\(JSONB\) TO service_role;\s*$/m);
  });

  it('es idempotente por PK (único por ronda) -- ON CONFLICT DO NOTHING, nunca sobrescribe un reporte ya emitido (R-10)', () => {
    expect(cuerpo).toContain('ON CONFLICT (ronda_id) DO NOTHING');
  });

  it('sólo emite sobre una ronda cerrada -- lo que hace que "ronda en_curso" en el Deshacer equivalga a "reporte no emitido"', () => {
    expect(cuerpo).toContain("IF v_ronda.estado <> 'cerrada' THEN");
  });
});
