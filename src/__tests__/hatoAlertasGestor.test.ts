import { describe, it, expect } from 'vitest';
import {
  tipoAlertaRequiereAnimal,
  construirReglaClaveManual,
  validarAlertaManual,
  puedeEditarAlerta,
  puedeDescartarAlerta,
  puedeConfirmarRevision,
  accionesAlertaFila,
  validarEdicionAlerta,
  validarHorasEscalamiento,
  etiquetaCanalAlerta,
  datosConNotaGestor,
} from '@/utils/hatoAlertasGestor';

describe('tipoAlertaRequiereAnimal', () => {
  it('rechequeo_due es de hato: la vaca es opcional', () => {
    expect(tipoAlertaRequiereAnimal('rechequeo_due')).toBe(false);
  });

  it('el resto de tipos manuales exigen vaca', () => {
    expect(tipoAlertaRequiereAnimal('secado_due')).toBe(true);
    expect(tipoAlertaRequiereAnimal('tratamiento_paso')).toBe(true);
    expect(tipoAlertaRequiereAnimal('servicio_sin_confirmacion')).toBe(true);
    expect(tipoAlertaRequiereAnimal('parto_proximo')).toBe(true);
  });
});

describe('validarAlertaManual', () => {
  const base = {
    tipo: 'secado_due' as const,
    animalId: 'animal-1',
    fechaProgramada: '2026-09-10',
    nota: 'revisar en corral',
    idUnico: 'abc-123',
  };

  it('arma la fila pendiente con regla_clave estable y origen manual', () => {
    const r = validarAlertaManual(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fila.estado).toBe('pendiente');
    expect(r.fila.animal_id).toBe('animal-1');
    expect(r.fila.regla_clave).toBe('manual:secado_due:animal-1:2026-09-10:abc-123');
    expect(r.fila.datos).toEqual({ origen: 'manual', nota: 'revisar en corral' });
  });

  it('rechaza una fecha que no es ISO', () => {
    const r = validarAlertaManual({ ...base, fechaProgramada: '10/09/2026' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/fecha/i);
  });

  it('exige vaca en secado y no en rechequeo', () => {
    expect(validarAlertaManual({ ...base, animalId: null }).ok).toBe(false);
    const r = validarAlertaManual({
      ...base,
      tipo: 'rechequeo_due',
      animalId: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fila.animal_id).toBeNull();
    expect(r.fila.regla_clave).toContain(':hato:');
  });

  it('una nota vacía no se guarda como string vacío', () => {
    const r = validarAlertaManual({ ...base, nota: '   ' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fila.datos).toEqual({ origen: 'manual' });
  });
});

describe('construirReglaClaveManual', () => {
  it('nunca usa el número de chapeta: la identidad es el uuid', () => {
    const clave = construirReglaClaveManual('parto_proximo', 'uuid-vaca', '2026-10-01', 'x');
    expect(clave).toBe('manual:parto_proximo:uuid-vaca:2026-10-01:x');
    expect(clave.split(':')[2]).toBe('uuid-vaca');
  });
});

describe('accionesAlertaFila', () => {
  it('sin escritura no hay botones', () => {
    expect(accionesAlertaFila('pendiente', false)).toEqual({
      responder: false,
      confirmarRevision: false,
      editar: false,
      descartar: false,
    });
  });

  it('pendiente/enviada/escalada se responden como en Telegram', () => {
    expect(accionesAlertaFila('pendiente', true).responder).toBe(true);
    expect(accionesAlertaFila('enviada', true).responder).toBe(true);
    expect(accionesAlertaFila('escalada', true).responder).toBe(true);
  });

  it('respondida/expirada se cierran en la revisión semanal, no con Sí', () => {
    expect(accionesAlertaFila('respondida', true)).toMatchObject({
      responder: false,
      confirmarRevision: true,
      descartar: true,
      editar: true,
    });
    expect(accionesAlertaFila('expirada', true)).toMatchObject({
      responder: false,
      confirmarRevision: true,
      descartar: true,
    });
  });

  it('confirmada/descartada no se vuelven a tocar', () => {
    expect(puedeDescartarAlerta('confirmada')).toBe(false);
    expect(puedeDescartarAlerta('descartada')).toBe(false);
    expect(puedeEditarAlerta('confirmada')).toBe(false);
    expect(puedeConfirmarRevision('confirmada')).toBe(false);
  });
});

describe('validarEdicionAlerta / horas / canal / nota', () => {
  it('editar solo acepta fecha ISO y recorta la nota', () => {
    expect(validarEdicionAlerta({ fechaProgramada: 'mala', nota: 'x' }).ok).toBe(false);
    expect(validarEdicionAlerta({ fechaProgramada: '2026-09-10', nota: '  hola  ' })).toEqual({
      ok: true,
      fecha_programada: '2026-09-10',
      nota: 'hola',
    });
  });

  it('horas de escalamiento: enteros 1–336', () => {
    expect(validarHorasEscalamiento(48)).toBeNull();
    expect(validarHorasEscalamiento(0)).not.toBeNull();
    expect(validarHorasEscalamiento(1.5)).not.toBeNull();
    expect(validarHorasEscalamiento(337)).not.toBeNull();
  });

  it('etiqueta el canal: campo = secado/tratamiento, el resto web', () => {
    expect(etiquetaCanalAlerta('secado_due')).toBe('campo');
    expect(etiquetaCanalAlerta('tratamiento_paso')).toBe('campo');
    expect(etiquetaCanalAlerta('servicio_sin_confirmacion')).toBe('web');
  });

  it('datosConNotaGestor no borra mensaje ni enviada_en', () => {
    const next = datosConNotaGestor({ mensaje: 'hola', enviada_en: '2026-09-01' }, 'nueva');
    expect(next.mensaje).toBe('hola');
    expect(next.enviada_en).toBe('2026-09-01');
    expect(next.nota_gestor).toBe('nueva');
    const sin = datosConNotaGestor(next, null);
    expect(sin.nota_gestor).toBeUndefined();
    expect(sin.mensaje).toBe('hola');
  });
});
