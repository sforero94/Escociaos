import { formatCurrency } from '@/utils/format';
import type { LineaFlujo, ReporteFlujoCaja } from '@/types/reportesFinancieros';

interface Props {
  reporte: ReporteFlujoCaja;
}

/** Las salidas se pintan restando; los valores guardados son siempre positivos. */
export function formatearCeldaFlujo(linea: LineaFlujo, valor: number): { texto: string; negativo: boolean } {
  const conSigno = linea.signo === 'salida' ? -valor : valor;
  return {
    texto: `${conSigno < 0 ? '-' : ''}${formatCurrency(Math.abs(conSigno))}`,
    negativo: conSigno < 0,
  };
}

function claseFila(linea: LineaFlujo): string {
  if (linea.tipo === 'resultado') return 'fila-resultado';
  if (linea.tipo === 'subtotal') return 'fila-subtotal';
  return 'fila-detalle';
}

export function TablaFlujoCaja({ reporte }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="tabla-scroll">
        {/* `tabla-flujo` ajusta ancho y tamaño de fuente para que las 12
            columnas de meses no se encabalguen (ver globals.css). */}
        <table className="tabla-financiera tabla-flujo">
          <thead>
            <tr className="fila-seccion">
              <th className="col-etiqueta">Concepto</th>
              {reporte.meses_label.map((mes) => (
                <th key={mes} className="celda-num col-mes">
                  {mes}
                </th>
              ))}
              <th className="celda-num col-total">Total</th>
            </tr>
          </thead>
          <tbody>
            {reporte.lineas.map((linea) => (
              <tr key={linea.id} className={claseFila(linea)}>
                <td className={`col-etiqueta ${linea.nivel === 1 ? 'sangria-1' : ''}`}>
                  {linea.etiqueta}
                </td>

                {linea.meses.map((valor, i) => {
                  const { texto, negativo } = formatearCeldaFlujo(linea, valor);
                  return (
                    <td
                      key={`${linea.id}-${i}`}
                      className={`celda-num col-mes ${negativo ? 'valor-negativo' : ''}`}
                    >
                      {valor === 0 && linea.tipo === 'detalle' ? '—' : texto}
                    </td>
                  );
                })}

                {/* En `flujo_acumulado` el total NO es la suma de los meses:
                    el motor lo fija al cierre de diciembre. */}
                <td
                  className={`celda-num col-total ${
                    formatearCeldaFlujo(linea, linea.total).negativo ? 'valor-negativo' : ''
                  }`}
                >
                  {formatearCeldaFlujo(linea, linea.total).texto}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Movimientos por fecha de registro. El sistema no almacena fecha de pago: este reporte no es
          una conciliación bancaria. La compra de ganado es salida de caja pero no es gasto en el
          P&amp;G — es inversión en inventario.
          {reporte.saldo_inicial_es_supuesto &&
            ' No hay saldo inicial de caja cargado, así que la última fila muestra el flujo acumulado del año, no el saldo bancario.'}
        </p>
      </div>
    </div>
  );
}
