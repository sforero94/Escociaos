// ARCHIVO: __tests__/chequeoDiffReviewNovedades.test.tsx
// DESCRIPCIÓN: `ChequeoDiffReview.tsx` -- la parte de la promoción de filas
// manuscritas (plan `docs/hato/plan_chequeo_novedades_implementacion.md`
// §6.5): la etiqueta «Escrita a mano», el panel ámbar de
// `numero_animal_inactivo` y el botón de llenado de un clic de
// `sugerenciaActiva`.
//
// Mismo patrón que `accionesRecomendadasComponentes.test.tsx`
// (`renderToStaticMarkup`, sin `@testing-library` -- este repo no lo trae
// entre sus dependencias): assertions sobre el HTML estático que produce un
// único paso de render. Eso alcanza para chip/panel/texto condicionales,
// pero NO puede simular un click ni un cambio de estado -- las pruebas del
// botón "Usar esta caravana" y de los dos botones del panel ámbar verifican
// que el botón EXISTE con el texto/target correctos, nunca que al hacer
// click cambia el valor del campo (eso lo cubre `hatoCorreccionChequeo.ts`,
// que es la función pura que `onCorregir`/`onReactivarAnimal` invocan).

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChequeoDiffReview, type FilaPromovidaOcr } from '@/components/hato/components/ChequeoDiffReview';
import { PREFIJO_ISSUE_FILA_PROMOVIDA } from '@/utils/importHato/ocrChequeo';
import { PREFIJO_ISSUE_CORRECCION_MANUAL } from '@/utils/hatoCorreccionChequeo';
import type { RevisionChequeo } from '@/components/hato/hooks/useRevisionChequeo';
import type { PreviewChequeoRespuesta } from '@/components/hato/hooks/useSubirChequeoExcel';
import type { FilaDiffChequeo } from '@/utils/importHato/diffChequeo';
import type { FilaChequeoNormalizada } from '@/utils/importHato/tipos';

function filaNormalizada(fila: number, overrides: Partial<FilaChequeoNormalizada> = {}): FilaChequeoNormalizada {
  return {
    archivo: 'chequeo.xlsx',
    hoja: 'HATO',
    fila,
    generacionEncabezado: 3,
    numero: null,
    nombre: null,
    chequeoFecha: '2026-09-08',
    chequeoFechaConfianza: 'exacta',
    raw: {
      pl: null,
      np: null,
      ultimaCria: null,
      sx: null,
      fechaServicio: null,
      toro: null,
      estadoRegistrado: null,
      tp: null,
      estado: null,
      secar: null,
      pp: null,
      ttto: null,
    },
    pl: null,
    numPartos: null,
    fechasServicio: [],
    sx: null,
    estado: null,
    fechaSecar: null,
    fechaProbableParto: null,
    toroNombre: null,
    tipoServicio: null,
    estadoRegistrado: null,
    issues: [],
    ...overrides,
  };
}

function filaDiff(fila: number, overrides: Partial<FilaDiffChequeo> = {}): FilaDiffChequeo {
  return {
    fila,
    numero: null,
    nombre: null,
    clasificacion: 'no_reconocido',
    animalId: null,
    numeroEsProvisional: false,
    ultimoChequeoFecha: null,
    diferencias: [],
    motivoNoReconocido: 'sin caravana asignada',
    issues: [],
    conflictoEstadoRegistrado: null,
    ...overrides,
  };
}

function filaPromovida(overrides: Partial<FilaPromovidaOcr> = {}): FilaPromovidaOcr {
  return {
    filaExcel: 10,
    pagina: 1,
    orden: 1,
    numeroImpreso: '178',
    nombreImpreso: 'COMINA',
    motivo: 'numero_animal_inactivo',
    detalle: 'detalle',
    candidatosInactivos: [],
    sugerenciaActiva: null,
    ...overrides,
  };
}

/** `RevisionChequeo` mínima: las funciones son espías vacías -- este test no
 * ejerce interacción (ver cabecera), solo verifica qué se pinta para un
 * `diff` dado. */
function revisionConFilas(filas: FilaDiffChequeo[], normalizadas: FilaChequeoNormalizada[]): RevisionChequeo {
  return {
    diff: {
      filas,
      resumen: {
        totalFilas: filas.length,
        nuevos: filas.filter((f) => f.clasificacion === 'nuevo').length,
        sinCambio: filas.filter((f) => f.clasificacion === 'sin_cambio').length,
        cambios: filas.filter((f) => f.clasificacion === 'cambio').length,
        noReconocidos: filas.filter((f) => f.clasificacion === 'no_reconocido').length,
        conIssues: 0,
        conConflictoEstadoRegistrado: 0,
      },
      colisionesEnHoja: [],
    },
    filasCorregidas: normalizadas,
    filasAprobables: [],
    correcciones: {},
    camposCorregidosPorFila: {},
    erroresCorreccion: [],
    resumenCorrecciones: { filasCorregidas: 0, camposCorregidos: 0, fechaChequeoFijadaAMano: false },
    fechaChequeoTexto: '2026-09-08',
    fechaChequeoValida: '2026-09-08',
    errorFechaChequeo: null,
    derivasDesdePreview: [],
    torosNuevos: [],
    puedeEditar: true,
    cargandoEstado: false,
    errorEstado: null,
    corregirCampo: vi.fn(),
    deshacerFila: vi.fn(),
    setFechaChequeoTexto: vi.fn(),
    recargarEstado: vi.fn(),
  };
}

function resultadoConOcr(filasPromovidas: FilaPromovidaOcr[]): PreviewChequeoRespuesta {
  return {
    success: true,
    archivo: 'chequeo.xlsx',
    generadoEn: '2026-09-15T00:00:00Z',
    chequeoFecha: '2026-09-08',
    hojas: [],
    diffChequeos: { filas: [], resumen: { totalFilas: 0, nuevos: 0, sinCambio: 0, cambios: 0, noReconocidos: 0, conIssues: 0, conConflictoEstadoRegistrado: 0 }, colisionesEnHoja: [] },
    filasNormalizadas: [],
    terneras: [],
    subtablas: [],
    ocr: {
      modelo: 'test',
      fotos: [],
      almacenamiento: { bucket: 'chequeos-fotos', ok: true, errores: [] },
      paginasNoLeidas: [],
      filasNoLeidas: [],
      filasPromovidas,
      vacasSinLeer: [],
      advertencias: [],
      resumen: {
        vacasEnRoster: 0,
        fotosRecibidas: 1,
        fotosLeidas: 1,
        filasConfirmadas: 0,
        filasPromovidas: filasPromovidas.length,
        filasNoLeidas: 0,
        vacasSinLeer: 0,
        celdasNoConfiables: 0,
      },
    },
  };
}

function render(diffFilas: FilaDiffChequeo[], normalizadas: FilaChequeoNormalizada[], promovidas: FilaPromovidaOcr[]) {
  return renderToStaticMarkup(
    <ChequeoDiffReview
      resultado={resultadoConOcr(promovidas)}
      revision={revisionConFilas(diffFilas, normalizadas)}
      editable
      onCrearFicha={() => {}}
      onReactivarAnimal={() => {}}
    />,
  );
}

describe('ChequeoDiffReview -- chip «Escrita a mano»', () => {
  it('se pinta en una fila no_reconocido con el issue de procedencia', () => {
    const diff = filaDiff(10, {
      issues: [{ crudo: '', motivo: `${PREFIJO_ISSUE_FILA_PROMOVIDA} numero_ilegible: '#178' / 'COMINA'` }],
    });
    const fila = filaNormalizada(10, {
      issues: [{ crudo: '', motivo: `${PREFIJO_ISSUE_FILA_PROMOVIDA} numero_ilegible: '#178' / 'COMINA'` }],
    });
    const html = render([diff], [fila], []);
    expect(html).toContain('Escrita a mano');
  });

  it('NO se pinta en una fila no_reconocido normal, sin ese issue', () => {
    const diff = filaDiff(11);
    const fila = filaNormalizada(11);
    const html = render([diff], [fila], []);
    expect(html).not.toContain('Escrita a mano');
  });

  it('sobrevive a la resolución: se pinta aunque la fila ya no sea no_reconocido', () => {
    // El issue de procedencia queda en `fila.issues` para siempre (es un
    // hecho permanente sobre de dónde vino la fila); una vez asignada la
    // caravana la clasificación cambia, pero la etiqueta se conserva.
    const diff = filaDiff(12, { clasificacion: 'cambio', numero: 178, nombre: 'COMINA' });
    const fila = filaNormalizada(12, {
      numero: 178,
      nombre: 'COMINA',
      issues: [
        { crudo: '', motivo: `${PREFIJO_ISSUE_FILA_PROMOVIDA} numero_animal_inactivo: '#178' / 'COMINA'` },
        { crudo: '178', motivo: `${PREFIJO_ISSUE_CORRECCION_MANUAL} [numero] Caravana (#): «sin dato» → «178».` },
      ],
    });
    const html = render([diff], [fila], []);
    expect(html).toContain('Escrita a mano');
  });
});

describe('ChequeoDiffReview -- panel ámbar de numero_animal_inactivo', () => {
  const issueEscritaAMano = { crudo: '', motivo: `${PREFIJO_ISSUE_FILA_PROMOVIDA} numero_animal_inactivo: '#178' / 'COMINA'` };

  it('lista los candidatos y ofrece las dos rutas, sin preferir ninguna', () => {
    const promovida = filaPromovida({
      filaExcel: 20,
      numeroImpreso: '178',
      nombreImpreso: 'COMINA',
      motivo: 'numero_animal_inactivo',
      candidatosInactivos: [{ id: 'animal-178', numero: 178, nombre: 'COMINA', estado: 'descartada' }],
    });
    const diff = filaDiff(20, { issues: [issueEscritaAMano] });
    const fila = filaNormalizada(20, { issues: [issueEscritaAMano] });
    const html = render([diff], [fila], [promovida]);

    expect(html).toContain('#178 COMINA');
    expect(html).toContain('El animal sigue en el hato (reactivar)');
    expect(html).toContain('Me equivoqué de número');
    // Un solo candidato -> singular, no "más de un animal".
    expect(html).toContain('un animal');
    expect(html).not.toContain('más de un animal');
  });

  it('con más de un candidato, avisa la ambigüedad en plural', () => {
    const promovida = filaPromovida({
      filaExcel: 21,
      candidatosInactivos: [
        { id: 'a1', numero: 178, nombre: 'COMINA', estado: 'descartada' },
        { id: 'a2', numero: 178, nombre: 'MOCA', estado: 'vendida' },
      ],
    });
    const diff = filaDiff(21, { issues: [issueEscritaAMano] });
    const fila = filaNormalizada(21, { issues: [issueEscritaAMano] });
    const html = render([diff], [fila], [promovida]);
    expect(html).toContain('más de un animal');
  });

  it('no se pinta para un motivo distinto (numero_fuera_del_roster sin sugerencia)', () => {
    const promovida = filaPromovida({
      filaExcel: 22,
      motivo: 'numero_fuera_del_roster',
      candidatosInactivos: [],
      sugerenciaActiva: null,
    });
    const diff = filaDiff(22, { issues: [issueEscritaAMano] });
    const fila = filaNormalizada(22, { issues: [issueEscritaAMano] });
    const html = render([diff], [fila], [promovida]);
    expect(html).not.toContain('El animal sigue en el hato (reactivar)');
    // Sin panel específico, cae al hint genérico.
    expect(html).toContain('Escribe la caravana para identificarla.');
  });
});

describe('ChequeoDiffReview -- llenado de un clic de sugerenciaActiva', () => {
  const issueEscritaAMano = { crudo: '', motivo: `${PREFIJO_ISSUE_FILA_PROMOVIDA} numero_fuera_del_roster: '#450' / 'NOVILLITA'` };

  it('ofrece el botón de llenado citando la novilla sugerida, y NO aprueba nada solo', () => {
    const promovida = filaPromovida({
      filaExcel: 30,
      numeroImpreso: '450',
      nombreImpreso: 'NOVILLITA',
      motivo: 'numero_fuera_del_roster',
      candidatosInactivos: [],
      sugerenciaActiva: { id: 'novilla-450', numero: 450, nombre: 'NOVILLITA', estado: 'activa' },
    });
    const diff = filaDiff(30, { issues: [issueEscritaAMano] });
    const fila = filaNormalizada(30, { issues: [issueEscritaAMano] });
    const html = render([diff], [fila], [promovida]);

    expect(html).toContain('Usar esta caravana');
    expect(html).toContain('#450 NOVILLITA');
    // No hay panel de reactivación (motivo distinto) ni texto de aprobación
    // automática -- el botón sólo puede rellenar el campo `numero`.
    expect(html).not.toContain('El animal sigue en el hato (reactivar)');
  });

  it('sin sugerenciaActiva, no ofrece el botón de llenado', () => {
    const promovida = filaPromovida({
      filaExcel: 31,
      motivo: 'numero_fuera_del_roster',
      sugerenciaActiva: null,
    });
    const diff = filaDiff(31, { issues: [issueEscritaAMano] });
    const fila = filaNormalizada(31, { issues: [issueEscritaAMano] });
    const html = render([diff], [fila], [promovida]);
    expect(html).not.toContain('Usar esta caravana');
  });
});

describe('ChequeoDiffReview -- nuevo/no_reconocido siguen sin atajo de aprobación', () => {
  it('una fila `nuevo` no ofrece ningún botón de reactivación ni de llenado', () => {
    const diff = filaDiff(40, { clasificacion: 'nuevo', numero: 900, nombre: 'ALGUIEN' });
    const fila = filaNormalizada(40, { numero: 900, nombre: 'ALGUIEN' });
    const html = render([diff], [fila], []);
    expect(html).not.toContain('El animal sigue en el hato (reactivar)');
    expect(html).not.toContain('Usar esta caravana');
    // Su propia salida ya existente (crear ficha) sigue intacta.
    expect(html).toContain('Crear ficha del animal');
  });

  it('una fila no_reconocido plana (sin escribir a mano) no muestra el chip ni los paneles', () => {
    const diff = filaDiff(41);
    const fila = filaNormalizada(41);
    const html = render([diff], [fila], []);
    expect(html).not.toContain('Escrita a mano');
    expect(html).not.toContain('El animal sigue en el hato (reactivar)');
    expect(html).not.toContain('Usar esta caravana');
  });
});
