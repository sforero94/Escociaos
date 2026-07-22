import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/utils/format';
import type { LineaPyG, ReportePyG } from '@/types/reportesFinancieros';

interface Props {
  reporte: ReportePyG;
}

/**
 * Formatea una celda respetando el contrato: los valores son positivos y el
 * signo lo lleva `esResta`. Devolver el texto ya con signo evita que la tabla
 * y el PDF se contradigan.
 */
export function formatearCelda(linea: LineaPyG, indice: number): { texto: string; negativo: boolean } {
  if (linea.sinDato?.[indice]) return { texto: '—', negativo: false };

  const bruto = linea.valores[indice];
  if (linea.formato === 'porcentaje') {
    return { texto: `${bruto.toFixed(1)}%`, negativo: bruto < 0 };
  }
  if (linea.formato === 'unidades') {
    return { texto: formatNumber(bruto), negativo: false };
  }

  const conSigno = linea.esResta ? -bruto : bruto;
  const texto = `${conSigno < 0 ? '-' : ''}${formatCurrency(Math.abs(conSigno))}`;
  return { texto, negativo: conSigno < 0 };
}

function claseFila(linea: LineaPyG): string {
  const base =
    linea.tipo === 'subtotal'
      ? 'fila-subtotal'
      : linea.tipo === 'resultado'
        ? 'fila-resultado'
        : linea.tipo === 'seccion'
          ? 'fila-seccion'
          : linea.tipo === 'indicador'
            ? 'fila-indicador'
            : 'fila-detalle';

  return linea.nivel === 2 ? `${base} fila-nivel-2` : base;
}

export function TablaPyG({ reporte }: Props) {
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  const alternar = (id: string) => {
    setExpandidas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  };

  const tieneHijos = (id: string) => reporte.lineas.some((l) => l.padre_id === id && l.nivel === 2);

  // Los conceptos (nivel 2) solo se muestran si su categoría está expandida.
  const visibles = reporte.lineas.filter(
    (linea) => linea.nivel !== 2 || (linea.padre_id != null && expandidas.has(linea.padre_id))
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="tabla-scroll">
        <table className="tabla-financiera">
          <thead>
            <tr className="fila-seccion">
              <th className="col-etiqueta">Concepto</th>
              {reporte.periodos.map((periodo) => (
                <th key={periodo.key} className="celda-num col-periodo" title={periodo.descripcion}>
                  {periodo.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((linea) => {
              const expandible = linea.nivel === 1 && tieneHijos(linea.id);
              const abierta = expandidas.has(linea.id);

              return (
                <tr key={linea.id} className={claseFila(linea)}>
                  <td className={`col-etiqueta ${linea.nivel === 1 ? 'sangria-1' : linea.nivel === 2 ? 'sangria-2' : ''}`}>
                    {expandible ? (
                      <button
                        type="button"
                        className="toggle-concepto"
                        onClick={() => alternar(linea.id)}
                        aria-expanded={abierta}
                      >
                        {abierta ? (
                          <ChevronDown className="w-4 h-4 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 flex-shrink-0" />
                        )}
                        <span>{linea.etiqueta}</span>
                      </button>
                    ) : (
                      linea.etiqueta
                    )}
                  </td>

                  {reporte.periodos.map((periodo, i) => {
                    const { texto, negativo } = formatearCelda(linea, i);
                    return (
                      <td
                        key={periodo.key}
                        className={`celda-num col-periodo ${negativo ? 'valor-negativo' : ''}`}
                      >
                        {linea.tipo === 'seccion' ? '' : texto}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          {reporte.modo === 'cosecha'
            ? 'Cada cosecha carga los gastos del semestre en que se trabajó esa fruta. Pasa el cursor sobre el encabezado para ver el rango exacto.'
            : 'Columnas acumuladas desde enero. Solo incluye gastos confirmados.'}
        </p>
      </div>
    </div>
  );
}
