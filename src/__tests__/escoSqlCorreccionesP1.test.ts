// Esco SQL — correcciones P1 (plan de migración Esco 2.0, §8.1) que viven en el código y en el prompt.
// Las que viven en las vistas (F2, F3, F4, F10) se prueban contra Postgres en escoSqlMigracion193.test.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ClienteLLM, RespuestaLLM } from '../utils/esco2/llm.ts';
import { abreviarDineroEnTexto } from '../utils/escoSql/formatoDinero.ts';
import { responderPregunta } from '../utils/escoSql/loop.ts';
import { construirPrompt, VALORES_ESCO } from '../utils/escoSql/prompt.ts';

const PROMPT = construirPrompt('2026-11-09');
/** La sección REGLAS completa, para comprobar cada regla por su número y su contenido. */
const REGLAS = PROMPT.slice(PROMPT.indexOf('\nREGLAS\n'), PROMPT.indexOf('FORMATO DE NÚMEROS'));
const regla = (n: number) => new RegExp(`\\n${n}\\. [^\\n]*(?:\\n   [^\\n]*)*`).exec(REGLAS)?.[0] ?? '';

describe('F1 — dinero en formato M, de forma determinista', () => {
  it.each([
    ['El costo fue $153.623.469 en octubre.', 'El costo fue aprox. $154M en octubre.'],
    ['Gastamos $8.237.046 en total.', 'Gastamos aprox. $8,2M en total.'],
    ['Entró $1.578.987.184.', 'Entró aprox. $1.579M.'],
    ['Fueron $2.000.000.000 en el año.', 'Fueron $2.000M en el año.'],
    ['Un pago de $50.400.000 exactos.', 'Un pago de $50,4M exactos.'],
    ['Son $291040000 pesos.', 'Son aprox. $291M pesos.'],
    ['Costó $17.388.413,40 con decimales.', 'Costó aprox. $17,4M con decimales.'],
    ['El saldo es -$12.500.000.', 'El saldo es -$12,5M.'],
    ['Ahorramos $95.343.110 COP.', 'Ahorramos aprox. $95,3M.'],
  ])('%s', (entrada, esperado) => {
    expect(abreviarDineroEnTexto(entrada)).toBe(esperado);
  });

  it('no toca lo que ya está abreviado ni lo menor de un millón', () => {
    for (const t of ['$95M', '$50,4M', '$2.000M', '$223.406', '$934.567', '$0', '$999.999', 'aprox. $8,2M']) {
      expect(abreviarDineroEnTexto(`Total ${t} en el mes.`)).toBe(`Total ${t} en el mes.`);
    }
  });

  it('solo toca importes con $: kilos, litros, jornales y conteos quedan intactos', () => {
    const t = 'Se cosecharon 111.156 kg, 1.469.529 combinaciones, 209,5 jornales y 12.345.678 litros.';
    expect(abreviarDineroEnTexto(t)).toBe(t);
  });

  it('un texto con varios importes los convierte todos, cada uno por su valor', () => {
    expect(abreviarDineroEnTexto('De $8.237.046 a $17.388.413 y $223.406 de mano de obra.')).toBe(
      'De aprox. $8,2M a aprox. $17,4M y $223.406 de mano de obra.',
    );
  });

  it('el loop devuelve la respuesta ya abreviada aunque el modelo escribiera pesos completos', async () => {
    const uso = { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 };
    const r: RespuestaLLM = { texto: 'Gastamos $153.623.469 en octubre.', llamadas: [], uso, ms: 1, modelo: 'm', finishReason: 'stop' };
    const llm: ClienteLLM = { completar: async () => r };
    const out = await responderPregunta({ pregunta: 'x', llm, ejecutarSql: async () => ({ filas: [], n_filas: 0, truncado: false }), hoy: '2026-11-09' });
    expect(out.respuesta).toBe('Gastamos aprox. $154M en octubre.');
  });

  it('el prompt le pide al modelo pesos completos y deja la abreviatura al sistema (el modelo redondeaba mal: $153M por $153,6M)', () => {
    expect(PROMPT).toMatch(/escríbelo en pesos completos/);
    expect(PROMPT).toMatch(/NO lo abrevies ni lo redondees tú/);
  });
});

describe('F2 — «ventas» frente a «ingresos» en el prompt', () => {
  it('la regla 11 separa los dos conceptos y manda filtrar es_venta', () => {
    const r = regla(11);
    expect(r).toMatch(/"Ventas" son solo las filas con es_venta = true/);
    expect(r).toMatch(/Rentas, Participación, Otro ni Otros Ingresos/);
    expect(r).toMatch(/origen = 'fin_transacciones_ganado'/);
  });
});

describe('F5 — valores exactos de categoría y nombres de plaga', () => {
  it('lista los valores del hato: «activa», no «activo»', () => {
    expect(PROMPT).toContain("v_esco_hato.estado: 'activa', 'muerta', 'vendida'");
    expect(PROMPT).toContain('"activa", no "activo"');
  });

  it('lista los nombres exactos del catálogo de plagas, incluido «Ácaro» frente a sus variantes', () => {
    const plagas = VALORES_ESCO.find((v) => v.columna === 'v_esco_monitoreo.plaga')!.valores;
    for (const n of ['Ácaro', 'Ácaro Cristalino', 'Huevos de acaro', 'Thrips', 'Monalonion', 'Phytophtora']) expect(plagas).toContain(n);
  });

  it('la regla 10 prohíbe ILIKE de plagas, pide igualdad exacta y separar o preguntar cuando la palabra cubre varias', () => {
    const r = regla(10);
    expect(r).toMatch(/plaga = 'Ácaro'/);
    expect(r).toMatch(/nunca ILIKE '%ácaro%'/);
    expect(r).toMatch(/muestra cada una por separado o pregunta cuál/);
    expect(r).toMatch(/SELECT DISTINCT/);
  });

  it('el ILIKE de la regla 2 se limita a nombres de lote, producto, aplicación y persona', () => {
    expect(regla(2)).toMatch(/NO vale para las columnas de categoría/);
  });

  it('aclara tipo_tarea frente a tarea en la vista de jornales', () => {
    expect(PROMPT).toMatch(/tipo_tarea es la CATEGORÍA de la labor/);
    expect(PROMPT).toMatch(/filtra por tipo_tarea, no por tarea/);
  });

  it('toda columna de la lista de valores existe en una vista descrita en el prompt', () => {
    for (const v of VALORES_ESCO) {
      for (const ref of v.columna.split(' / ')) {
        const [vista, columna] = ref.split('.');
        expect(PROMPT, ref).toMatch(new RegExp(`- ${vista}\\([^)]*\\b${columna}\\b`));
      }
    }
  });
});

describe('F6 — pregunta sin período', () => {
  it('la regla 4 manda preguntar el período y no elegir uno, y deja pasar los seguimientos', () => {
    const r = regla(4);
    expect(r).toMatch(/NO elijas un período/);
    expect(r).toMatch(/UNA pregunta corta/);
    expect(r).toMatch(/seguimiento/);
  });
});

describe('F7 — cruces', () => {
  it('la regla 12 manda agregar cada lado antes de unir y avisa que el JOIN directo multiplica', () => {
    const r = regla(12);
    expect(r).toMatch(/agregar ANTES cada lado a la llave del cruce/);
    expect(r).toMatch(/multiplica/);
  });
});

describe('listas y rangos: ajustes que salieron del eval de dev', () => {
  it('«cuáles» se responde nombrando los elementos; solo las listas de cientos de filas se resumen (regla 6)', () => {
    const r = regla(6);
    expect(r).toMatch(/NOMBRA los elementos/);
    expect(r).toMatch(/Solo si son cientos de filas/);
  });

  it('«hasta hoy» y «en lo que va del año» incluyen hoy: límite exclusivo = día siguiente (regla 13)', () => {
    const r = regla(13);
    expect(r).toMatch(/INCLUYE hoy: fecha < hoy \+ 1/);
    expect(r).toMatch(/día SIGUIENTE al último día incluido/);
  });

  it('una respuesta de lluvia dice cuántos días tuvieron dato y por qué un día queda sin dato (regla 8)', () => {
    const r = regla(8);
    expect(r).toMatch(/LLUVIA/);
    expect(r).toMatch(/cuántos días del período tuvieron dato y cuántos no/);
  });
});

describe('ajustes de ingresos y monitoreo salidos del eval de dev', () => {
  it('una cosecha se filtra por su etiqueta, no por fecha', () => {
    expect(PROMPT).toMatch(/filtra por la ETIQUETA \(cosecha = 'Principal 2026'\), nunca por fecha/);
  });
  it('las cabezas vendidas suman todas las filas es_venta y dicen de dónde salen', () => {
    expect(PROMPT).toMatch(/suma cabezas de TODAS las filas es_venta/);
  });
  it('«últimas N rondas» son las N más recientes (ronda_orden <= N), no las que contienen la plaga', () => {
    expect(PROMPT).toMatch(/ronda_orden <= N/);
    expect(PROMPT).toMatch(/no se monitoreó en ellas/);
  });
  it('«última ronda» es es_ultima_ronda y no se ordena a mano (las filas sin ronda ordenan primero)', () => {
    expect(PROMPT).toMatch(/es_ultima_ronda = true/);
    expect(PROMPT).toMatch(/ronda_id NULL\) ordenan primero/);
  });
  it('la incidencia de varios lotes o rondas es Σafectados/Σmonitoreados, nunca AVG(incidencia_pct)', () => {
    expect(PROMPT).toMatch(/NUNCA AVG\(incidencia_pct\)/);
    expect(PROMPT).toMatch(/SUM\(n_observaciones\), no COUNT/);
  });
});

describe('hato: vocabulario y vistas nuevas en el prompt', () => {
  it('«vacías» es estado_pantalla = Vacía y activa; «partos» se cuentan en eventos; «pesar» es producción quincenal', () => {
    expect(PROMPT).toMatch(/estado_pantalla = 'Vacía' y estado = 'activa'/);
    expect(PROMPT).toMatch(/COUNT\(\*\) de tipo = 'parto' con la fecha del EVENTO/);
    expect(PROMPT).toMatch(/«¿Cuántos litros se pesaron \/ produjo el hato en octubre\?» se responde con SUM\(litros\)/);
    expect(PROMPT).toMatch(/Es una muestra semanal por vaca, no la producción del hato/);
  });
});

describe('F8 — ningún conteo sin consulta', () => {
  it('la regla 1 exige que todo conteo salga de un COUNT o de n_filas, y un COUNT antes del total si hubo truncado', () => {
    const r = regla(1);
    expect(r).toMatch(/Todo CONTEO que menciones/);
    expect(r).toMatch(/COUNT\(\*\) o de n_filas/);
    expect(r).toMatch(/TRUNCADO a 500, antes de dar un total corre un COUNT\(\*\)/);
  });
});

describe('F9 — kg por árbol por año', () => {
  it('la vista de producción dice que los árboles son por cosecha y que un año usa árboles distintos', () => {
    expect(PROMPT).toMatch(/arboles_registrados es por COSECHA/);
    expect(PROMPT).toMatch(/cada árbol dos veces/);
    expect(PROMPT).toMatch(/árboles distintos/);
    expect(PROMPT).toMatch(/Di siempre cuál de las dos calculaste/);
  });
});

describe('F10 — cobertura de lluvia', () => {
  it('la vista de clima manda contar los días sin fila y explicar por qué un día es «sin dato»', () => {
    expect(PROMPT).toMatch(/UNA fila por cada día calendario/);
    expect(PROMPT).toMatch(/cuenta los días sin fila también/);
    expect(PROMPT).toMatch(/"sin dato" = la estación no registró ese día o el sensor de lluvia no fue confiable/);
  });
});

describe('F11 — rangos semiabiertos', () => {
  it('la regla 13 pide [inicio, fin) y da el ejemplo de 60 días', () => {
    const r = regla(13);
    expect(r).toMatch(/semiabiertos/);
    expect(r).toMatch(/fecha < hoy \+ 60 \(60 fechas, no 61\)/);
    expect(r).toMatch(/Nunca uses BETWEEN/);
  });
});

describe('F12 — el punto y coma dentro de un texto', () => {
  it('P4 conserva una sentencia y permite el literal como parámetro, sin ejecutar su texto', () => {
    const r = regla(14);
    expect(r).toMatch(/No envíes varias sentencias/);
    expect(r).toMatch(/dentro de un texto entre comillas/);
    expect(r).toMatch(/el texto viaja como parámetro/);
  });

  it('F12 no toca la RPC: la migración 193 no crea ni reemplaza ninguna función (cambiar esco_sql_lectura es un cambio de seguridad)', () => {
    const m193 = readFileSync(new URL('../sql/migrations/193_esco_sql_correcciones_vistas.sql', import.meta.url), 'utf8');
    expect(m193).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/i);
    expect(m193).not.toMatch(/ALTER FUNCTION/i);
  });
});

describe('el prompt sigue completo y numerado', () => {
  it('trae las 15 reglas en orden, sin saltos', () => {
    const numeros = [...REGLAS.matchAll(/\n(\d+)\. /g)].map((m) => Number(m[1]));
    expect(numeros).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });
});
