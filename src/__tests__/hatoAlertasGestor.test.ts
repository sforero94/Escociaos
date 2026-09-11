import { describe, it, expect } from 'vitest';
import {
  tipoAlertaRequiereAnimal,
  construirReglaClaveManual,
  validarAlertaManual,
  puedeEditarAlerta,
  puedeDescartarAlerta,
  accionesAlertaFila,
  validarEdicionAlerta,
  validarHorasEscalamiento,
  etiquetaCanalAlerta,
  datosConNotaGestor,
  esAlertaActiva,
  esAlertaCompletada,
  vistaEstadoAlerta,
  tipoAlertaInformativa,
  tipoAlertaCampo,
  TEMAS_ALERTA_CAMPO,
  TEMAS_ALERTA_GERENCIA,
  agruparRechequeoInformativo,
  agruparPartoInformativo,
  particionarAlertasGestor,
  ordenarAlertasHistorial,
  etiquetaResultadoHistorial,
  tabAlertasDesdeParam,
  formatearNombreVacaAlerta,
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
      editar: false,
      descartar: false,
    });
  });

  it('pendiente/enviada/escalada se responden como en Telegram', () => {
    expect(accionesAlertaFila('pendiente', true, 'secado_due').responder).toBe(true);
    expect(accionesAlertaFila('enviada', true, 'tratamiento_paso').responder).toBe(true);
    expect(accionesAlertaFila('escalada', true, 'servicio_sin_confirmacion').responder).toBe(true);
  });

  it('rechequeo y parto próximo no tienen botones: son informativos', () => {
    expect(accionesAlertaFila('pendiente', true, 'rechequeo_due')).toEqual({
      responder: false,
      editar: false,
      descartar: false,
    });
    expect(accionesAlertaFila('enviada', true, 'parto_proximo').responder).toBe(false);
  });

  it('completadas (respondida/confirmada/descartada/expirada) no se tocan', () => {
    for (const estado of ['respondida', 'confirmada', 'descartada', 'expirada'] as const) {
      expect(accionesAlertaFila(estado, true, 'secado_due')).toEqual({
        responder: false,
        editar: false,
        descartar: false,
      });
    }
    expect(puedeDescartarAlerta('confirmada')).toBe(false);
    expect(puedeDescartarAlerta('descartada')).toBe(false);
    expect(puedeEditarAlerta('confirmada')).toBe(false);
  });
});

describe('vista Activas / Completadas', () => {
  it('pendiente, enviada y escalada son Activas', () => {
    expect(esAlertaActiva('pendiente')).toBe(true);
    expect(esAlertaActiva('enviada')).toBe(true);
    expect(esAlertaActiva('escalada')).toBe(true);
    expect(vistaEstadoAlerta('escalada')).toBe('activa');
  });

  it('respondida, confirmada, descartada y expirada son Completadas', () => {
    expect(esAlertaCompletada('respondida')).toBe(true);
    expect(esAlertaCompletada('confirmada')).toBe(true);
    expect(esAlertaCompletada('descartada')).toBe(true);
    expect(esAlertaCompletada('expirada')).toBe(true);
    expect(vistaEstadoAlerta('respondida')).toBe('completada');
  });

  it('rechequeo y parto son informativos; secado y tratamiento son de campo', () => {
    expect(tipoAlertaInformativa('rechequeo_due')).toBe(true);
    expect(tipoAlertaInformativa('parto_proximo')).toBe(true);
    expect(tipoAlertaInformativa('secado_due')).toBe(false);
    expect(tipoAlertaCampo('secado_due')).toBe(true);
    expect(tipoAlertaCampo('tratamiento_paso')).toBe(true);
    expect(tipoAlertaCampo('servicio_sin_confirmacion')).toBe(false);
  });

  it('en Activas el orden de temas es campo, parto, servicio, rechequeo', () => {
    expect([...TEMAS_ALERTA_CAMPO, ...TEMAS_ALERTA_GERENCIA]).toEqual([
      'secado_due',
      'tratamiento_paso',
      'parto_proximo',
      'servicio_sin_confirmacion',
      'rechequeo_due',
    ]);
  });
});

describe('agrupar rechequeo / parto informativos', () => {
  it('una alerta de hato muestra los nombres de datos.animales', () => {
    const grupos = agruparRechequeoInformativo([{
      id: 'hato-1',
      tipo: 'rechequeo_due' as const,
      animal_id: null,
      fecha_programada: '2026-09-10',
      datos: {
        ultimo_chequeo_fecha: '2026-05-01',
        vacas_count: 2,
        animales: [
          { animal_id: 'a1', numero: 1, nombre: 'ALINA' },
          { animal_id: 'a2', numero: 2, nombre: 'BELLA' },
        ],
      },
    }]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].nombres.map((n) => n.nombre)).toEqual(['ALINA', 'BELLA']);
    expect(grupos[0].detalle).toBe('Último chequeo: 2026-05-01');
  });

  it('filas viejas por vaca se agrupan aparte, sin botones en la vista', () => {
    const grupos = agruparRechequeoInformativo([
      {
        id: 'vieja-1',
        tipo: 'rechequeo_due' as const,
        animal_id: 'a1',
        fecha_programada: '2026-08-01',
        datos: null,
        animalNumero: 12,
        animalNombre: 'LUNA',
      },
      {
        id: 'vieja-2',
        tipo: 'rechequeo_due' as const,
        animal_id: 'a2',
        fecha_programada: '2026-08-01',
        datos: null,
        animalNumero: 13,
        animalNombre: 'SOL',
      },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].nombres.map((n) => formatearNombreVacaAlerta(n))).toEqual(['#12 LUNA', '#13 SOL']);
  });

  it('parto próximo es un solo grupo con todos los nombres', () => {
    const grupos = agruparPartoInformativo([
      {
        id: 'p1',
        tipo: 'parto_proximo' as const,
        animal_id: 'a1',
        fecha_programada: '2026-10-01',
        datos: null,
        animalNumero: 8,
        animalNombre: 'MIA',
      },
      {
        id: 'p2',
        tipo: 'parto_proximo' as const,
        animal_id: 'a2',
        fecha_programada: '2026-10-05',
        datos: null,
        animalNumero: 9,
        animalNombre: 'NIA',
      },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].nombres).toHaveLength(2);
  });
});

describe('particionar / historial / tabs', () => {
  it('separa gerencia (arriba) de campo (abajo) y completadas al historial', () => {
    const { gerencia, campo, completadas } = particionarAlertasGestor([
      { id: '1', estado: 'pendiente' as const, tipo: 'rechequeo_due' as const },
      { id: '2', estado: 'enviada' as const, tipo: 'secado_due' as const },
      { id: '3', estado: 'respondida' as const, tipo: 'tratamiento_paso' as const },
      { id: '4', estado: 'escalada' as const, tipo: 'servicio_sin_confirmacion' as const },
    ]);
    expect(gerencia.map((a) => a.id).sort()).toEqual(['1', '4']);
    expect(campo.map((a) => a.id)).toEqual(['2']);
    expect(completadas.map((a) => a.id)).toEqual(['3']);
  });

  it('el historial ordena por updated_at descendente', () => {
    const orden = ordenarAlertasHistorial([
      { id: 'vieja', updated_at: '2026-08-01T00:00:00Z' },
      { id: 'nueva', updated_at: '2026-09-10T00:00:00Z' },
    ]);
    expect(orden.map((a) => a.id)).toEqual(['nueva', 'vieja']);
  });

  it('etiqueta el resultado del historial sin los 7 estados de la base', () => {
    expect(etiquetaResultadoHistorial({ estado: 'descartada', respuesta: null })).toBe('Descartada');
    expect(etiquetaResultadoHistorial({ estado: 'respondida', respuesta: 'si' })).toBe('Sí');
    expect(etiquetaResultadoHistorial({ estado: 'respondida', respuesta: 'no' })).toBe('Todavía no');
    expect(etiquetaResultadoHistorial({ estado: 'confirmada', respuesta: 'otro' })).toBe('Otra cosa');
    expect(etiquetaResultadoHistorial({ estado: 'expirada', respuesta: null })).toBe('Completada');
  });

  it('mapea tabs viejos cola/quien/tipos a las tres pestañas nuevas', () => {
    expect(tabAlertasDesdeParam(null)).toBe('activas');
    expect(tabAlertasDesdeParam('cola')).toBe('activas');
    expect(tabAlertasDesdeParam('quien')).toBe('configuracion');
    expect(tabAlertasDesdeParam('tipos')).toBe('configuracion');
    expect(tabAlertasDesdeParam('historial')).toBe('historial');
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
