// Motor del Flujo de Caja mensual. Lógica pura, sin Supabase.
//
// Base: FECHA DE REGISTRO del movimiento. El sistema no almacena fecha de pago,
// así que esto es el movimiento de la plata tal como quedó registrada — no una
// conciliación bancaria. La UI lo dice explícitamente.
//
// Asimetría deliberada respecto al P&G: la COMPRA de ganado sí es salida de
// caja aquí (aunque no sea gasto en el P&G), y va en su propia línea rotulada
// para que nadie la confunda con un costo del período.

import type {
  AdvertenciaReporte,
  DatosCrudosReportes,
  LineaFlujo,
  ReporteFlujoCaja,
  VistaReporte,
} from '@/types/reportesFinancieros';
import { MESES_LABEL, anioDeFecha, mesDeFecha } from '@/utils/periodosReporte';
import { esConfirmado } from '@/utils/clasificacionCostos';
import {
  advertenciaPendientes,
  detectarDuplicadosGanado,
  redondearPesos,
  resolverAlcance,
} from '@/utils/reportesFinancierosComun';

const N_MESES = 12;

class AcumuladorFlujo {
  private readonly mapa = new Map<string, LineaFlujo>();

  sumar(spec: Omit<LineaFlujo, 'meses' | 'total'>, mes: number, valor: number): void {
    let linea = this.mapa.get(spec.id);
    if (!linea) {
      linea = { ...spec, meses: new Array(N_MESES).fill(0), total: 0 };
      this.mapa.set(spec.id, linea);
    }
    linea.meses[mes] += valor;
    linea.total += valor;
  }

  ordenadas(prefijo: string): LineaFlujo[] {
    return [...this.mapa.values()]
      .filter((l) => l.id.startsWith(prefijo))
      .sort((a, b) => b.total - a.total);
  }
}

export function construirFlujoCaja(
  datos: DatosCrudosReportes,
  vista: VistaReporte
): ReporteFlujoCaja {
  const anio = datos.anio;
  const alcance = resolverAlcance(datos, vista);
  const advertencias: AdvertenciaReporte[] = [];

  const duplicados = detectarDuplicadosGanado(datos);
  advertencias.push(...duplicados.advertencias);

  const acumulador = new AcumuladorFlujo();
  const entradas = new Array(N_MESES).fill(0);
  const salidas = new Array(N_MESES).fill(0);

  const enElAnio = (fecha: string) => anioDeFecha(fecha) === anio;

  // ── ENTRADAS ─────────────────────────────────────────────────────────────
  for (const ing of datos.ingresos) {
    if (!enElAnio(ing.fecha)) continue;
    if (!alcance.negocioIds.has(ing.negocio_id)) continue;
    if (duplicados.ingresosExcluidos.has(ing.id)) continue;

    const mes = mesDeFecha(ing.fecha) - 1;
    const etiqueta =
      vista === 'global'
        ? alcance.nombrePorNegocio.get(ing.negocio_id) ?? 'Sin negocio'
        : ing.categoria_nombre ?? 'Sin categoría';

    acumulador.sumar(
      {
        id: `ent_${vista === 'global' ? ing.negocio_id : ing.categoria_id ?? 'sin'}`,
        nivel: 1,
        tipo: 'detalle',
        etiqueta,
        signo: 'entrada',
        origen: { fuente: 'fin_ingresos', negocio_id: ing.negocio_id },
      },
      mes,
      ing.valor
    );
    entradas[mes] += ing.valor;
  }

  // ── SALIDAS: gastos confirmados ──────────────────────────────────────────
  const gastosVista = datos.gastos.filter(
    (g) => alcance.negocioIds.has(g.negocio_id) && !duplicados.gastosExcluidos.has(g.id)
  );

  for (const gasto of gastosVista) {
    if (!enElAnio(gasto.fecha) || !esConfirmado(gasto)) continue;

    const mes = mesDeFecha(gasto.fecha) - 1;
    acumulador.sumar(
      {
        id: `sal_${gasto.categoria_id ?? 'sin'}`,
        nivel: 1,
        tipo: 'detalle',
        etiqueta: gasto.categoria_nombre ?? 'Sin categoría',
        signo: 'salida',
        origen: { fuente: 'fin_gastos', categoria_id: gasto.categoria_id ?? undefined },
      },
      mes,
      gasto.valor
    );
    salidas[mes] += gasto.valor;
  }

  // ── Ganado: entra por venta, sale por compra ─────────────────────────────
  if (alcance.incluyeGanado) {
    for (const t of datos.ganado) {
      if (!enElAnio(t.fecha)) continue;
      const mes = mesDeFecha(t.fecha) - 1;

      if (t.tipo === 'venta') {
        acumulador.sumar(
          {
            id: 'ent_ganado',
            nivel: 1,
            tipo: 'detalle',
            etiqueta: 'Venta de ganado',
            signo: 'entrada',
            origen: { fuente: 'fin_transacciones_ganado' },
          },
          mes,
          t.valor_total
        );
        entradas[mes] += t.valor_total;
      } else {
        acumulador.sumar(
          {
            id: 'sal_ganado',
            nivel: 1,
            tipo: 'detalle',
            etiqueta: 'Compra de ganado (inversión en inventario)',
            signo: 'salida',
            origen: { fuente: 'fin_transacciones_ganado' },
          },
          mes,
          t.valor_total
        );
        salidas[mes] += t.valor_total;
      }
    }
  }

  // ── Totales ──────────────────────────────────────────────────────────────
  const saldoInicial = leerSaldoInicial(datos, anio);
  const flujoNeto = entradas.map((e, i) => e - salidas[i]);

  const flujoAcumulado: number[] = [];
  let corrido = saldoInicial.valor;
  for (const neto of flujoNeto) {
    corrido += neto;
    flujoAcumulado.push(corrido);
  }

  // ── Advertencias ─────────────────────────────────────────────────────────
  const pendientes = gastosVista.filter((g) => enElAnio(g.fecha) && !esConfirmado(g));
  const advPendientes = advertenciaPendientes(
    pendientes.reduce((s, g) => s + g.valor, 0),
    pendientes.length
  );
  if (advPendientes) advertencias.push(advPendientes);

  if (datos.truncado) {
    advertencias.push({
      codigo: 'datos_truncados',
      severidad: 'warning',
      mensaje: 'La consulta alcanzó el límite de filas y el reporte puede estar incompleto.',
    });
  }

  // ── Ensamblaje ───────────────────────────────────────────────────────────
  const lineas: LineaFlujo[] = [];

  lineas.push(totalLinea('total_entradas', 'ENTRADAS', entradas, 'entrada'));
  lineas.push(...acumulador.ordenadas('ent_'));

  lineas.push(totalLinea('total_salidas', 'SALIDAS', salidas, 'salida'));
  lineas.push(...acumulador.ordenadas('sal_'));

  lineas.push(totalLinea('flujo_neto', 'FLUJO NETO DEL MES', flujoNeto, 'neto', 'resultado'));
  lineas.push(
    totalLinea(
      'flujo_acumulado',
      saldoInicial.esSupuesto ? 'FLUJO ACUMULADO DEL PERÍODO' : 'SALDO DE CAJA',
      flujoAcumulado,
      'neto',
      'resultado',
      // El acumulado no es una suma de meses: su "total" es el cierre de diciembre.
      flujoAcumulado[N_MESES - 1]
    )
  );

  return {
    version: 1,
    vista,
    vista_nombre: alcance.nombreVista,
    anio,
    meses_label: MESES_LABEL,
    lineas,
    totales: {
      entradas: entradas.map(redondearPesos),
      salidas: salidas.map(redondearPesos),
      flujo_neto: flujoNeto.map(redondearPesos),
      flujo_acumulado: flujoAcumulado.map(redondearPesos),
    },
    saldo_inicial: saldoInicial.valor,
    saldo_inicial_es_supuesto: saldoInicial.esSupuesto,
    advertencias,
  };
}

function totalLinea(
  id: string,
  etiqueta: string,
  meses: number[],
  signo: LineaFlujo['signo'],
  tipo: LineaFlujo['tipo'] = 'subtotal',
  totalExplicito?: number
): LineaFlujo {
  return {
    id,
    nivel: 0,
    tipo,
    etiqueta,
    meses: meses.map(redondearPesos),
    total: redondearPesos(totalExplicito ?? meses.reduce((s, v) => s + v, 0)),
    signo,
  };
}

/**
 * Saldo inicial de caja. Mientras no exista el parámetro, vale 0 y la última
 * fila se rotula "Flujo acumulado del período": un saldo que arranca en cero
 * cada enero invita a conciliarlo contra el banco y siempre estaría mal.
 */
function leerSaldoInicial(
  datos: DatosCrudosReportes,
  anio: number
): { valor: number; esSupuesto: boolean } {
  const param =
    datos.parametros.find((p) => p.clave === 'saldo_inicial_caja' && p.anio === anio) ??
    datos.parametros.find((p) => p.clave === 'saldo_inicial_caja' && p.anio == null);

  return param ? { valor: param.valor, esSupuesto: false } : { valor: 0, esSupuesto: true };
}
