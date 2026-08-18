// ARCHIVO: __tests__/pulsoNegocioComponentes.test.tsx
// DESCRIPCIÓN: Contrato de render de las tres tarjetas del bloque "Pulso
// por negocio" (`docs/plan_dashboard_centro_control.md` §4 Bloque 3 /
// §9.2), contra las vistas presentacionales puras (`Pulso*CardView`) --
// nunca contra el componente contenedor (`Pulso*Card`), que hace I/O real
// vía Supabase y no se puede ejercitar con fixtures estáticas. Mismo patrón
// que `accionesRecomendadasComponentes.test.tsx`: `renderToStaticMarkup`,
// sin `@testing-library/react` (no está instalado en el proyecto).
//
// Lo que se verifica en las tres: el criterio de bloqueo de release del
// encargo ("sin dato es sin dato, nada arranca en 0, nada se rellena") y
// los contratos explícitos del plan (denominador del hato en ámbar y
// SIEMPRE visible, nunca un `0%` de plaga sin lectura, el hueco de
// cabezas/ha con su causa).

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PulsoHatoCardView } from '../components/dashboard/PulsoHatoCard';
import { PulsoAguacateCardView } from '../components/dashboard/PulsoAguacateCard';
import { PulsoGanadoCardView } from '../components/dashboard/PulsoGanadoCard';
import type { PulsoHatoDatos, PulsoAguacateDatos, PulsoGanadoDatos } from '../components/dashboard/pulsoNegocioCalculos';
import type { RevisionPulsoHato } from '../components/dashboard/hooks/usePulsoHato';

// ============================================================================
// PulsoHatoCardView
// ============================================================================

const datosHatoEjemplo: PulsoHatoDatos = {
  litrosPorVacaHoy: 416.5 / 27,
  litrosTotalHoy: 416.5,
  fechaUltimoPesaje: '2026-08-12',
  vacasPesadasHoy: 27,
  vacasTotalEnOrdeno: 34,
  serieLitrosPorVaca: [15.9, 14.7, 13.5, 14.0, 13.9, 14.5, 15.7, 15.4],
};

const revisionEjemplo: RevisionPulsoHato = { vacias: 11, secadoVencido: 5, umbralDias: 90 };

describe('PulsoHatoCardView', () => {
  it('cargando: pinta el esqueleto, nunca un número a medias', () => {
    const html = renderToStaticMarkup(
      <PulsoHatoCardView cargando error={null} datos={null} vejez={null} revision={null} onNavigate={() => {}} />,
    );
    expect(html).toContain('animate-pulse');
    expect(html).not.toContain('L/vaca');
  });

  it('sin pesaje registrado: "—" y su explicación, nunca "0 L/vaca"', () => {
    const html = renderToStaticMarkup(
      <PulsoHatoCardView
        cargando={false}
        error={null}
        datos={null}
        vejez={{ ultimaFecha: null, semanas: null, nivel: 'critico' }}
        revision={null}
        onNavigate={() => {}}
      />,
    );
    expect(html).toContain('—');
    expect(html).toContain('Sin pesaje registrado');
    expect(html).not.toContain('0 L/vaca');
    expect(html).not.toMatch(/>0<\/p>/);
  });

  it('con datos: el denominador "27 de 34 vacas pesadas" es SIEMPRE visible en el texto, nunca en un atributo title', () => {
    const html = renderToStaticMarkup(
      <PulsoHatoCardView
        cargando={false}
        error={null}
        datos={datosHatoEjemplo}
        vejez={{ ultimaFecha: '2026-08-12', semanas: 0, nivel: 'ok' }}
        revision={revisionEjemplo}
        onNavigate={() => {}}
      />,
    );
    expect(html).toContain('27 de 34 vacas pesadas');
    expect(html).not.toContain('title="27 de 34 vacas pesadas"');
    // El denominador va en ámbar (text-amber-700), no en un tono neutro.
    expect(html).toMatch(/text-amber-700[^>]*>27 de 34 vacas pesadas/);
    expect(html).toContain('15,4');
    expect(html).toContain('416,5 L el 12 de agosto');
  });

  it('línea de revisión: cuenta total + el desglose vacías/secado, usando el umbral real de hato_config (nunca "90" hardcodeado en otro valor)', () => {
    const html = renderToStaticMarkup(
      <PulsoHatoCardView
        cargando={false}
        error={null}
        datos={datosHatoEjemplo}
        vejez={{ ultimaFecha: '2026-08-12', semanas: 0, nivel: 'ok' }}
        revision={revisionEjemplo}
        onNavigate={() => {}}
      />,
    );
    expect(html).toContain('16 vacas por revisar');
    expect(html).toContain('11 vacías hace más de 90 d');
    expect(html).toContain('5 con secado vencido');
  });

  it('sin nada por revisar: la fila dice "Nada por revisar", no "0 vacas por revisar"', () => {
    const html = renderToStaticMarkup(
      <PulsoHatoCardView
        cargando={false}
        error={null}
        datos={datosHatoEjemplo}
        vejez={{ ultimaFecha: '2026-08-12', semanas: 0, nivel: 'ok' }}
        revision={{ vacias: 0, secadoVencido: 0, umbralDias: 90 }}
        onNavigate={() => {}}
      />,
    );
    expect(html).toContain('Nada por revisar');
    expect(html).not.toContain('0 vacas por revisar');
  });

  it('vejez fuera de "ok": el chip de frescura queda en ámbar', () => {
    const html = renderToStaticMarkup(
      <PulsoHatoCardView
        cargando={false}
        error={null}
        datos={datosHatoEjemplo}
        vejez={{ ultimaFecha: '2026-07-01', semanas: 6, nivel: 'critico' }}
        revision={revisionEjemplo}
        onNavigate={() => {}}
      />,
    );
    expect(html).toContain('bg-amber-50');
  });

  it('denominador imposible (numerador > denominador): la línea del denominador NO se pinta -- caso real "27 de 26"', () => {
    const datosDenominadorRoto: PulsoHatoDatos = { ...datosHatoEjemplo, vacasPesadasHoy: 27, vacasTotalEnOrdeno: 26 };
    const html = renderToStaticMarkup(
      <PulsoHatoCardView
        cargando={false}
        error={null}
        datos={datosDenominadorRoto}
        vejez={{ ultimaFecha: '2026-08-12', semanas: 0, nivel: 'ok' }}
        revision={revisionEjemplo}
        onNavigate={() => {}}
      />,
    );
    expect(html).not.toContain('de 26 vacas pesadas');
    expect(html).not.toContain('27 de 26');
    // El resto de la tarjeta (L/vaca, fecha, fila de revisión) se sigue
    // pintando -- sólo la línea del denominador roto desaparece.
    expect(html).toContain('15,4');
    expect(html).toContain('16 vacas por revisar');
  });

  it('error: mensaje explícito, y la fila de revisión no se pinta (no se mezclan datos parciales)', () => {
    const html = renderToStaticMarkup(
      <PulsoHatoCardView
        cargando={false}
        error="fallo de red"
        datos={null}
        vejez={null}
        revision={revisionEjemplo}
        onNavigate={() => {}}
      />,
    );
    expect(html).toContain('No se pudo cargar el hato.');
    expect(html).not.toContain('vacas por revisar');
    expect(html).not.toContain('Nada por revisar');
  });
});

// ============================================================================
// PulsoAguacateCardView
// ============================================================================

const datosAguacateEjemplo: PulsoAguacateDatos = {
  rondaId: 'ronda-1',
  fechaRonda: '2026-08-03',
  plagas: [
    { nombre: 'Huevos de ácaro', incidencia: 25.5, arbolesAfectados: 107, arbolesMonitoreados: 420, deltaPp: null, gravedad: { texto: 'Alta', numerica: 3 } },
    { nombre: 'Ácaro', incidencia: 16.0, arbolesAfectados: 67, arbolesMonitoreados: 420, deltaPp: 2.1, gravedad: { texto: 'Media', numerica: 2 } },
    { nombre: 'Monalonion', incidencia: 11.4, arbolesAfectados: 20, arbolesMonitoreados: 175, deltaPp: -1.5, gravedad: { texto: 'Media', numerica: 2 } },
  ],
};

describe('PulsoAguacateCardView', () => {
  it('cargando: pinta el esqueleto', () => {
    const html = renderToStaticMarkup(<PulsoAguacateCardView cargando error={null} datos={null} onNavigate={() => {}} />);
    expect(html).toContain('animate-pulse');
  });

  it('sin monitoreo reciente: "—" y su explicación, nunca "0%"', () => {
    const html = renderToStaticMarkup(<PulsoAguacateCardView cargando={false} error={null} datos={null} onNavigate={() => {}} />);
    expect(html).toContain('—');
    expect(html).toContain('Sin monitoreo reciente');
    expect(html).not.toContain('0%');
  });

  it('reproduce el caso real: huevos de ácaro 25,5% como principal, con "107 de 420 árboles"', () => {
    const html = renderToStaticMarkup(
      <PulsoAguacateCardView cargando={false} error={null} datos={datosAguacateEjemplo} onNavigate={() => {}} />,
    );
    expect(html).toContain('25,5%');
    expect(html).toContain('Huevos de ácaro');
    expect(html).toContain('107');
    expect(html).toContain('420');
    expect(html).toContain('árboles');
    // Las siguientes (Ácaro, Monalonion) van con su propia incidencia, en
    // barra. El texto visible lleva un decimal ("16,0%", nunca "16%" a
    // secas) -- distinto a propósito del `style="width:16%"` de la barra,
    // que es sólo el ancho del relleno, no el rótulo que lee el usuario.
    expect(html).toContain('Ácaro');
    expect(html).toContain('>16,0%<');
    expect(html).toContain('Monalonion');
    expect(html).toContain('>11,4%<');
  });

  it('chip de ronda pasa a ámbar cuando la ronda lleva más de 14 días', () => {
    const html = renderToStaticMarkup(
      <PulsoAguacateCardView cargando={false} error={null} datos={datosAguacateEjemplo} onNavigate={() => {}} />,
    );
    // La fecha fija de "hoy" del entorno de test no se controla aquí, pero
    // la ronda del ejemplo es del 3 de agosto de 2026 -- muy anterior a
    // cualquier fecha real de ejecución del test, así que siempre cae del
    // lado ámbar (>14 días). Se afirma la clase, no el conteo exacto de
    // días (eso ya lo cubre `pulsoNegocioCalculos.test.ts`).
    expect(html).toContain('bg-amber-50');
    expect(html).toContain('Ronda del 3 de agosto');
  });

  it('una plaga con deltaPp positivo se pinta en rojo (semántica invertida: subir es rojo)', () => {
    const soloPrincipalConDelta: PulsoAguacateDatos = {
      ...datosAguacateEjemplo,
      plagas: [{ ...datosAguacateEjemplo.plagas[0], deltaPp: 3.2 }],
    };
    const html = renderToStaticMarkup(
      <PulsoAguacateCardView cargando={false} error={null} datos={soloPrincipalConDelta} onNavigate={() => {}} />,
    );
    expect(html).toContain('text-red-600');
    expect(html).toContain('+3,2pp');
  });

  it('una plaga con deltaPp negativo se pinta en verde', () => {
    const soloPrincipalConDelta: PulsoAguacateDatos = {
      ...datosAguacateEjemplo,
      plagas: [{ ...datosAguacateEjemplo.plagas[0], deltaPp: -2.0 }],
    };
    const html = renderToStaticMarkup(
      <PulsoAguacateCardView cargando={false} error={null} datos={soloPrincipalConDelta} onNavigate={() => {}} />,
    );
    expect(html).toContain('text-green-600');
  });

  it('error: mensaje explícito', () => {
    const html = renderToStaticMarkup(
      <PulsoAguacateCardView cargando={false} error="fallo de red" datos={null} onNavigate={() => {}} />,
    );
    expect(html).toContain('No se pudo cargar el monitoreo.');
  });
});

// ============================================================================
// PulsoGanadoCardView
// ============================================================================

const datosGanadoEjemplo: PulsoGanadoDatos = {
  totalCabezas: 369,
  totalNovillos: 222,
  totalToros: 147,
  porFinca: [
    { finca: 'Escocia', cabezas: 197, hectareas: 0 },
    { finca: 'santimp', cabezas: 67, hectareas: 0 },
    { finca: 'Carrizal', cabezas: 45, hectareas: 0 },
    { finca: 'Mochuelos', cabezas: 23, hectareas: 0 },
    { finca: 'Andalucía', cabezas: 19, hectareas: 0 },
    { finca: 'Maryland', cabezas: 18, hectareas: 0 },
  ],
  cabezasPorHa: null,
  ultimaActualizacion: null,
};

describe('PulsoGanadoCardView', () => {
  it('cargando: pinta el esqueleto', () => {
    const html = renderToStaticMarkup(<PulsoGanadoCardView cargando error={null} datos={null} onNavigate={() => {}} />);
    expect(html).toContain('animate-pulse');
  });

  it('sin datos de inventario: "—" y su explicación', () => {
    const html = renderToStaticMarkup(<PulsoGanadoCardView cargando={false} error={null} datos={null} onNavigate={() => {}} />);
    expect(html).toContain('—');
    expect(html).toContain('Sin datos de inventario');
  });

  it('reproduce el caso real: 369 cabezas = 222 novillos + 147 toros, con la finca "santimp" tal cual (dato sucio real, se muestra igual)', () => {
    const html = renderToStaticMarkup(
      <PulsoGanadoCardView cargando={false} error={null} datos={datosGanadoEjemplo} onNavigate={() => {}} />,
    );
    expect(html).toContain('369');
    expect(html).toContain('cabezas');
    expect(html).toContain('222 novillos');
    expect(html).toContain('147 toros');
    expect(html).toContain('Escocia');
    expect(html).toContain('santimp');
    expect(html).toContain('Carrizal');
  });

  it('cabezasPorHa null: hueco declarado con su causa (las N fincas tienen hectáreas en 0), nunca "0 cabezas/ha"', () => {
    const html = renderToStaticMarkup(
      <PulsoGanadoCardView cargando={false} error={null} datos={datosGanadoEjemplo} onNavigate={() => {}} />,
    );
    expect(html).toContain('Cabezas/ha no disponible');
    expect(html).toContain('hectáreas en 0');
    expect(html).not.toContain('0 cabezas/ha');
    expect(html).not.toContain('/ha</p>'); // ningún renglón "X cabezas/ha" con número
    // "las N fincas" es CON INVENTARIO (las de `porFinca`, p. ej. 3 de 8 en
    // total en el caso real de producción), nunca da a entender que la
    // finca solo tiene N fincas en total -- el ejemplo trae 6 en `porFinca`.
    expect(html).toContain('6 fincas con inventario');
  });

  it('cabezasPorHa con valor: NO se muestra el mensaje de hueco', () => {
    const conHa: PulsoGanadoDatos = { ...datosGanadoEjemplo, cabezasPorHa: 3.2 };
    const html = renderToStaticMarkup(<PulsoGanadoCardView cargando={false} error={null} datos={conHa} onNavigate={() => {}} />);
    expect(html).not.toContain('Cabezas/ha no disponible');
  });

  it('error: mensaje explícito', () => {
    const html = renderToStaticMarkup(
      <PulsoGanadoCardView cargando={false} error="fallo de red" datos={null} onNavigate={() => {}} />,
    );
    expect(html).toContain('No se pudo cargar el inventario de ganado.');
  });
});
