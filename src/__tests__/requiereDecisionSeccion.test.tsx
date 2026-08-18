import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RequiereDecision } from '@/components/dashboard/RequiereDecision';
import type { FilaRequiereDecision, UseRequiereDecisionResultado } from '@/components/dashboard/hooks/useRequiereDecision';

/**
 * Estados del bloque "Requiere tu decisión" (§4.3-equivalente del bloque 1,
 * `docs/plan_dashboard_centro_control.md` §9.2). Mismo patrón que
 * `accionesRecomendadasSeccion.test.tsx`: `renderToStaticMarkup` alcanza
 * para verificar clases y contenido -- ningún test aquí depende de
 * interacción real (esta librería no tiene @testing-library/react).
 *
 * A diferencia de `AccionesRecomendadas`, este componente NO llama al hook
 * internamente -- recibe `resultado` ya calculado por el llamador (para que
 * la barra de estado pueda recibir `totalFilas` sin duplicar la consulta),
 * así que estos tests construyen el objeto directamente, sin `vi.mock`.
 */

function resultadoBase(overrides: Partial<UseRequiereDecisionResultado> = {}): UseRequiereDecisionResultado {
  return {
    cargando: false,
    filas: [],
    errores: [],
    totalFilas: 0,
    dialogoGanado: null,
    cerrarDialogoGanado: vi.fn(),
    recargar: vi.fn(),
    ...overrides,
  };
}

function fila(overrides: Partial<FilaRequiereDecision> = {}): FilaRequiereDecision {
  return {
    id: 'f1',
    tipo: 'gastos_pendientes',
    severidad: 'media',
    titulo: '2 gastos pendientes de confirmar',
    contexto: '$1.5M registrados y todavía sin confirmar.',
    botonPrimario: { etiqueta: 'Ver gastos pendientes', onClick: vi.fn() },
    ...overrides,
  };
}

function render(resultado: UseRequiereDecisionResultado) {
  return renderToStaticMarkup(<RequiereDecision resultado={resultado} />);
}

describe('RequiereDecision — estados', () => {
  it('cargando sin nada todavía: pinta un skeleton del tamaño final, no un spinner de pantalla completa', () => {
    const html = render(resultadoBase({ cargando: true }));
    expect(html).toContain('Requiere tu decisión');
    expect(html).toContain('animate-pulse');
    expect(html).not.toMatch(/Nada pendiente de ti/);
  });

  it('vacío (cargó y no hay nada): colapsa a una sola línea verde con check', () => {
    const html = render(resultadoBase());
    expect(html).toContain('Nada pendiente de ti');
    expect(html).toContain('text-primary');
    // No debe quedar un card vacío ocupando espacio.
    expect(html).not.toContain('border-primary/10 bg-white');
  });

  it('con una fila: título en negrita, contexto en gris, botón primario visible', () => {
    const html = render(resultadoBase({ filas: [fila()], totalFilas: 1 }));
    expect(html).toContain('2 gastos pendientes de confirmar');
    expect(html).toContain('$1.5M registrados y todavía sin confirmar.');
    expect(html).toContain('font-bold');
    expect(html).toContain('Ver gastos pendientes');
  });

  it('severidad alta usa la barra roja (destructive); media usa la ámbar (warning)', () => {
    // El botón trae su propio `aria-invalid:border-destructive` de base (no
    // relacionado con la severidad de la fila), así que se compara la clase
    // COMPLETA de la barra vertical, no una subcadena suelta.
    const htmlAlta = render(resultadoBase({ filas: [fila({ id: 'a', severidad: 'alta', titulo: 'Aplicaciones colgadas' })] }));
    expect(htmlAlta).toContain('border-l-4 border-destructive');
    expect(htmlAlta).not.toContain('border-l-4 border-warning');

    const htmlMedia = render(resultadoBase({ filas: [fila({ id: 'm', severidad: 'media' })] }));
    expect(htmlMedia).toContain('border-l-4 border-warning');
    expect(htmlMedia).not.toContain('border-l-4 border-destructive');
  });

  it('ganado con rol de escritura: primario "Confirmar aquí" + secundario "Descartar", ambos presentes', () => {
    const html = render(
      resultadoBase({
        filas: [
          fila({
            id: 'ganado-pendientes',
            tipo: 'ganado_pendiente',
            titulo: '2 movimientos de ganado pendientes de confirmar',
            contexto: 'El más viejo lleva 9 días. Sin confirmar, el inventario de 369 cabezas no se mueve.',
            botonPrimario: { etiqueta: 'Confirmar aquí', onClick: vi.fn() },
            botonSecundario: { etiqueta: 'Descartar', onClick: vi.fn() },
          }),
        ],
      }),
    );
    expect(html).toContain('Confirmar aquí');
    expect(html).toContain('Descartar');
    expect(html).toContain('369 cabezas');
  });

  it('fila informativa sin botones (módulo sin rol de escritura, §8 del plan): se muestra sin acción', () => {
    const html = render(
      resultadoBase({
        filas: [fila({ id: 'ganado-pendientes', tipo: 'ganado_pendiente', botonPrimario: undefined, botonSecundario: undefined })],
      }),
    );
    expect(html).toContain('2 gastos pendientes de confirmar'); // el título de la fixture, sin tocar
    expect(html).not.toMatch(/<button/);
  });

  it('errores de fuente se muestran como línea aparte, sin bloquear las filas que sí cargaron', () => {
    const html = render(
      resultadoBase({
        filas: [fila()],
        errores: [{ fuente: 'ganado', mensaje: 'No se pudo leer ganado' }],
      }),
    );
    expect(html).toContain('No se pudo leer ganado');
    expect(html).toContain('2 gastos pendientes de confirmar');
  });

  it('sólo errores, sin filas: NO es el estado vacío -- no debe decir "Nada pendiente de ti"', () => {
    const html = render(resultadoBase({ errores: [{ fuente: 'aplicaciones', mensaje: 'No se pudo leer aplicaciones' }] }));
    expect(html).toContain('No se pudo leer aplicaciones');
    expect(html).not.toContain('Nada pendiente de ti');
  });

  it('el diálogo de ganado abierto no rompe el render (Radix Portal no aparece en SSR estático, y no debe fallar)', () => {
    expect(() =>
      render(
        resultadoBase({
          dialogoGanado: {
            movimiento: {
              id: 'm1',
              tipo: 'compra',
              estado: 'pendiente',
              fecha: '2026-08-08',
              potrero_origen_id: null,
              potrero_destino_id: null,
              novillos_delta: 5,
              toros_delta: 0,
              peso_promedio_kg: null,
              transaccion_ganado_id: null,
              notas: null,
              created_at: '2026-08-08T10:00:00.000Z',
              created_by: null,
            },
            fincas: [],
            potreros: [],
          },
        }),
      ),
    ).not.toThrow();
  });
});
