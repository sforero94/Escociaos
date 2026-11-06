import { describe, expect, it } from 'vitest';
import { resumenCatalogo } from '../utils/esco2/catalogo.ts';
import { promptPlanificador } from '../utils/esco2/prompts.ts';
import { mensajeDisposicion } from '../utils/esco2/mensajes.ts';
import type { DatosLabores } from '../utils/esco2/tipos.ts';
import { planDeOperaciones, operacionesDelPlan } from '../utils/esco2/tipos.ts';
import { validarPlan } from '../utils/esco2/registro.ts';
import { validarEstado } from '../utils/esco2/estado.ts';
import { renderMensaje, validarMensajeFinal } from '../utils/esco2/mensajes.ts';

const datos: DatosLabores = { tareas: [], lotes: [], tiposTareas: [], registros: [] };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('P3 cierre: catálogo independiente y aclaración segura', () => {
  it('mantiene aplicaciones con nombres iguales separadas por ID, sin exigir tarea', () => {
    const resumen = resumenCatalogo(datos, [
      { id: id(1), nombre_aplicacion: 'Aplicación sintética', codigo_aplicacion: 'S-A', tarea_id: null },
      { id: id(2), nombre_aplicacion: 'Aplicación sintética', codigo_aplicacion: 'S-B', tarea_id: null },
    ]);
    expect(resumen.aplicaciones).toHaveLength(2);
    expect(resumen.aplicaciones?.join(' ')).toContain(id(1));
    expect(resumen.aplicaciones?.join(' ')).toContain(id(2));
    expect(resumen.tareas).toEqual([]);
  });

  it('distingue catálogo de aplicaciones no leído de vacío visible', () => {
    const noLeido = promptPlanificador('2026-11-05', resumenCatalogo(datos));
    const vacio = promptPlanificador('2026-11-05', resumenCatalogo(datos, []));
    expect(noLeido).toContain('Catálogo de aplicaciones no leído');
    expect(vacio).toContain('Sin aplicaciones visibles en el catálogo leído');
    expect(noLeido).not.toContain('Sin aplicaciones visibles en el catálogo leído');
  });

  it('permite selector de aplicación textual aunque falte catálogo, sin unir por tarea', () => {
    const prompt = promptPlanificador('2026-11-05', resumenCatalogo(datos));
    expect(prompt).toContain('El catálogo de tareas no es el catálogo de aplicaciones');
    expect(prompt).toContain('no pidas aclarar solo porque no aparece entre las tareas');
    expect(prompt).toContain('No infieras la aplicación desde el nombre de una tarea');
  });

  it('una aclaración genérica no inventa el período que falta ni texto factual del modelo', () => {
    expect(mensajeDisposicion('aclaracion')).toContain('entidad');
    expect(mensajeDisposicion('aclaracion')).not.toMatch(/qu[eé] per[ií]odo/i);
  });
});

describe('P3 cierre: disposición parcial cerrada', () => {
  const cantidades = { nombre: 'consultar_cantidades_aplicacion', argumentos: JSON.stringify({ aplicacion_id: id(1) }) };
  const fuera = { nombre: 'fuera_de_alcance', argumentos: JSON.stringify({ motivo: 'texto no publicable' }) };

  it('convierte un rechazo junto a consultas en una marca sin texto libre', () => {
    const p = validarPlan([fuera, cantidades]);
    expect(p.tipo).toBe('operaciones');
    if (p.tipo !== 'operaciones') throw new Error('expected operations');
    expect(p.parcialFueraDeAlcance).toBe(true);
    expect(p.operaciones).toHaveLength(1);
    expect(JSON.stringify(p)).not.toContain('texto no publicable');
    expect(planDeOperaciones(operacionesDelPlan(p), p.parcialFueraDeAlcance)).toEqual(p);
    expect(validarEstado({ version: 1, plan: p })).toBe(true);
  });

  it('mantiene el límite total y rechaza rechazo duplicado y argumentos desconocidos', () => {
    expect(() => validarPlan([cantidades, cantidades, cantidades, fuera])).not.toThrow();
    expect(() => validarPlan([cantidades, cantidades, cantidades, cantidades, fuera])).toThrow();
    expect(() => validarPlan([cantidades, fuera, fuera])).toThrow();
    expect(() => validarPlan([cantidades, { ...fuera, argumentos: '{"motivo":"x","sql":"select 1"}' }])).toThrow();
  });

  it('valida el motivo antes de descartarlo', () => {
    for (const motivo of [undefined, null, false, {}, []]) {
      expect(() => validarPlan([cantidades, { ...fuera, argumentos: JSON.stringify({ motivo }) }])).toThrow();
    }
  });

  it('renderer y validador requieren disposición cerrada auténtica', () => {
    const t = renderMensaje([], undefined, true);
    expect(t).toMatch(/respuesta parcial/i);
    expect(t).toContain('únicamente a las partes sustentadas');
    expect(t).not.toContain('costo completo de producción');
    expect(validarMensajeFinal(t, [], undefined, true)).toBe(true);
    expect(validarMensajeFinal(t, [])).toBe(false);
    for (const marca of [false, null, 'true', {}]) {
      expect(() => renderMensaje([], undefined, marca as true)).toThrow();
    }
  });
});
