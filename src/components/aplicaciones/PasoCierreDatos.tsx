import { useState } from 'react';
import {
  Calendar,
  DollarSign,
  Users,
  FileText,
  Droplets,
  Truck,
  Wrench,
  Cloud,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { Aplicacion, JornalesPorActividad } from '../../types/aplicaciones';

interface PasoCierreDatosProps {
  aplicacion: Aplicacion;
  fechaFinal: string;
  onFechaFinalChange: (fecha: string) => void;
  valorJornal: number;
  onValorJornalChange: (valor: number) => void;
  jornales: JornalesPorActividad;
  onJornalesChange: (jornales: JornalesPorActividad) => void;
  jornalesPorLote: { [loteId: string]: JornalesPorActividad };
  onJornalesPorLoteChange: (jornalesPorLote: { [loteId: string]: JornalesPorActividad }) => void;
  observaciones: {
    generales: string;
    meteorologicas: string;
    problemas: string;
    ajustes: string;
  };
  onObservacionesChange: (observaciones: any) => void;
  movimientos: any[]; // Agregar movimientos para calcular costos
}

export function PasoCierreDatos({
  aplicacion,
  fechaFinal,
  onFechaFinalChange,
  valorJornal,
  onValorJornalChange,
  jornales,
  onJornalesChange,
  jornalesPorLote,
  onJornalesPorLoteChange,
  observaciones,
  onObservacionesChange,
  movimientos,
}: PasoCierreDatosProps) {
  const [mostrarJornalesPorLote, setMostrarJornalesPorLote] = useState(false);

  const calcularDiasAplicacion = (): number => {
    const fechaInicio = new Date(aplicacion.fecha_inicio);
    const fechaFin = new Date(fechaFinal);
    const diferencia = fechaFin.getTime() - fechaInicio.getTime();
    return Math.ceil(diferencia / (1000 * 60 * 60 * 24)) + 1;
  };

  const totalJornales =
    jornales.aplicacion + jornales.mezcla + jornales.transporte + (jornales.otros || 0);

  const costoManoObraTotal = totalJornales * valorJornal;

  const formatearMoneda = (valor: number): string => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(valor);
  };

  const fechaMinimaFinal = aplicacion.fecha_inicio;
  const fechaMaximaFinal = new Date().toISOString().split('T')[0];

  const esFechaValida = fechaFinal >= fechaMinimaFinal && fechaFinal <= fechaMaximaFinal;

  return (
    <div className="space-y-6">
      {/* TÍTULO */}
      <div>
        <h3 className="text-xl text-foreground mb-2">Datos del Cierre</h3>
        <p className="text-brand-brown/70">
          Completa la información necesaria para formalizar el cierre de la aplicación.
        </p>
      </div>

      {/* SECCIÓN 1: FECHAS */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Calendar className="w-5 h-5 text-primary" />
          </div>
          <h4 className="text-foreground">Fechas de Ejecución</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Fecha Inicio (readonly) */}
          <div>
            <label className="block text-sm text-brand-brown/70 mb-2">Fecha de Inicio</label>
            <input
              type="date"
              value={aplicacion.fecha_inicio}
              disabled
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-foreground cursor-not-allowed"
            />
          </div>

          {/* Fecha Final */}
          <div>
            <label className="block text-sm text-brand-brown/70 mb-2">
              Fecha de Finalización <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={fechaFinal}
              onChange={(e) => onFechaFinalChange(e.target.value)}
              min={fechaMinimaFinal}
              max={fechaMaximaFinal}
              className={`w-full px-4 py-2 border rounded-lg text-foreground focus:outline-none focus:ring-2 transition-all ${
                esFechaValida
                  ? 'border-gray-300 focus:ring-primary/20 focus:border-primary'
                  : 'border-red-300 focus:ring-red-200 focus:border-red-500'
              }`}
            />
            {!esFechaValida && fechaFinal && (
              <p className="text-xs text-red-600 mt-1">
                Fecha inválida. Debe ser entre {aplicacion.fecha_inicio} y hoy.
              </p>
            )}
          </div>

          {/* Días de Aplicación (calculado) */}
          <div>
            <label className="block text-sm text-brand-brown/70 mb-2">Días de Aplicación</label>
            <div className="px-4 py-2 bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 rounded-lg">
              <div className="text-2xl text-foreground">
                {esFechaValida ? calcularDiasAplicacion() : '-'}
              </div>
              <div className="text-xs text-brand-brown/70">días</div>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: JORNALES */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <h4 className="text-foreground">Mano de Obra y Jornales</h4>
        </div>

        <div className="space-y-4">
          {/* Valor del Jornal */}
          <div>
            <label className="block text-sm text-brand-brown/70 mb-2">
              Valor del Jornal (COP) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-brown/40" />
              <input
                type="number"
                value={valorJornal}
                onChange={(e) => onValorJornalChange(Number(e.target.value))}
                min="0"
                step="1000"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="Ej: 60000"
              />
            </div>
          </div>

          {/* Distribución de Jornales */}
          <div>
            <label className="block text-sm text-brand-brown/70 mb-3">
              Distribución de Jornales por Actividad <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Aplicación */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Droplets className="w-4 h-4 text-primary" />
                  <label className="text-sm text-foreground">Aplicación</label>
                </div>
                <input
                  type="number"
                  value={jornales.aplicacion}
                  onChange={(e) =>
                    onJornalesChange({ ...jornales, aplicacion: Number(e.target.value) })
                  }
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="0"
                />
              </div>

              {/* Mezcla */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wrench className="w-4 h-4 text-blue-600" />
                  <label className="text-sm text-foreground">Mezcla</label>
                </div>
                <input
                  type="number"
                  value={jornales.mezcla}
                  onChange={(e) =>
                    onJornalesChange({ ...jornales, mezcla: Number(e.target.value) })
                  }
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 transition-all"
                  placeholder="0"
                />
              </div>

              {/* Transporte */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="w-4 h-4 text-purple-600" />
                  <label className="text-sm text-foreground">Transporte</label>
                </div>
                <input
                  type="number"
                  value={jornales.transporte}
                  onChange={(e) =>
                    onJornalesChange({ ...jornales, transporte: Number(e.target.value) })
                  }
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-500 transition-all"
                  placeholder="0"
                />
              </div>

              {/* Otros */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-orange-600" />
                  <label className="text-sm text-foreground">Otros</label>
                </div>
                <input
                  type="number"
                  value={jornales.otros || 0}
                  onChange={(e) =>
                    onJornalesChange({ ...jornales, otros: Number(e.target.value) })
                  }
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-500 transition-all"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Resumen de Costos */}
          <div className="bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20 rounded-xl p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-brand-brown/70 mb-1">Total Jornales</div>
                <div className="text-xl text-foreground">{totalJornales}</div>
              </div>
              <div>
                <div className="text-xs text-brand-brown/70 mb-1">Valor por Jornal</div>
                <div className="text-xl text-foreground">{formatearMoneda(valorJornal)}</div>
              </div>
              <div>
                <div className="text-xs text-brand-brown/70 mb-1">Costo Mano de Obra</div>
                <div className="text-2xl text-primary">
                  {formatearMoneda(costoManoObraTotal)}
                </div>
              </div>
            </div>
          </div>

          {/* Jornales por Lote (Opcional - Colapsable) */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <button
              type="button"
              onClick={() => setMostrarJornalesPorLote(!mostrarJornalesPorLote)}
              className="flex items-center gap-2 text-sm text-primary hover:text-foreground transition-colors font-medium"
            >
              {mostrarJornalesPorLote ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              Distribuir jornales por lote (opcional)
            </button>
            <p className="text-xs text-brand-brown/60 mt-1 ml-6">
              Si deseas un control más detallado, puedes especificar los jornales utilizados en cada lote
            </p>

            {mostrarJornalesPorLote && (
              <div className="mt-4 space-y-3">
                {aplicacion.configuracion?.lotes_seleccionados?.map((lote) => {
                  const loteId = lote.id || lote.lote_id;
                  const jornalesLote = jornalesPorLote[loteId] || {
                    aplicacion: 0,
                    mezcla: 0,
                    transporte: 0,
                    otros: 0,
                  };

                  return (
                    <div
                      key={loteId}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="text-sm text-foreground font-medium">
                          {lote.nombre || `Lote ${loteId}`}
                        </h5>
                        <span className="text-xs text-brand-brown/60">
                          {lote.conteo_arboles?.total || 0} árboles
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {/* Aplicación */}
                        <div>
                          <label className="block text-xs text-brand-brown/70 mb-1">
                            Aplicación
                          </label>
                          <input
                            type="number"
                            value={jornalesLote.aplicacion}
                            onChange={(e) => {
                              const updated = {
                                ...jornalesPorLote,
                                [loteId]: {
                                  ...jornalesLote,
                                  aplicacion: Number(e.target.value),
                                },
                              };
                              onJornalesPorLoteChange(updated);
                            }}
                            min="0"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            placeholder="0"
                          />
                        </div>

                        {/* Mezcla */}
                        <div>
                          <label className="block text-xs text-brand-brown/70 mb-1">
                            Mezcla
                          </label>
                          <input
                            type="number"
                            value={jornalesLote.mezcla}
                            onChange={(e) => {
                              const updated = {
                                ...jornalesPorLote,
                                [loteId]: {
                                  ...jornalesLote,
                                  mezcla: Number(e.target.value),
                                },
                              };
                              onJornalesPorLoteChange(updated);
                            }}
                            min="0"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                            placeholder="0"
                          />
                        </div>

                        {/* Transporte */}
                        <div>
                          <label className="block text-xs text-brand-brown/70 mb-1">
                            Transporte
                          </label>
                          <input
                            type="number"
                            value={jornalesLote.transporte}
                            onChange={(e) => {
                              const updated = {
                                ...jornalesPorLote,
                                [loteId]: {
                                  ...jornalesLote,
                                  transporte: Number(e.target.value),
                                },
                              };
                              onJornalesPorLoteChange(updated);
                            }}
                            min="0"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-500"
                            placeholder="0"
                          />
                        </div>

                        {/* Otros */}
                        <div>
                          <label className="block text-xs text-brand-brown/70 mb-1">
                            Otros
                          </label>
                          <input
                            type="number"
                            value={jornalesLote.otros || 0}
                            onChange={(e) => {
                              const updated = {
                                ...jornalesPorLote,
                                [loteId]: {
                                  ...jornalesLote,
                                  otros: Number(e.target.value),
                                },
                              };
                              onJornalesPorLoteChange(updated);
                            }}
                            min="0"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-500"
                            placeholder="0"
                          />
                        </div>
                      </div>

                      {/* Subtotal de este lote */}
                      <div className="mt-2 pt-2 border-t border-gray-300 flex justify-between items-center">
                        <span className="text-xs text-brand-brown/70">Total lote:</span>
                        <span className="text-sm text-foreground font-medium">
                          {jornalesLote.aplicacion +
                            jornalesLote.mezcla +
                            jornalesLote.transporte +
                            (jornalesLote.otros || 0)}{' '}
                          jornales
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECCIÓN 3: OBSERVACIONES */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <FileText className="w-5 h-5 text-purple-600" />
          </div>
          <h4 className="text-foreground">Observaciones y Notas de Campo</h4>
        </div>

        <div className="space-y-4">
          {/* Observaciones Generales */}
          <div>
            <label className="block text-sm text-brand-brown/70 mb-2">
              Observaciones Generales
            </label>
            <textarea
              value={observaciones.generales}
              onChange={(e) =>
                onObservacionesChange({ ...observaciones, generales: e.target.value })
              }
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
              placeholder="Notas generales sobre la aplicación..."
            />
          </div>

          {/* Condiciones Meteorológicas */}
          <div>
            <label className="block text-sm text-brand-brown/70 mb-2 flex items-center gap-2">
              <Cloud className="w-4 h-4" />
              Condiciones Meteorológicas
            </label>
            <textarea
              value={observaciones.meteorologicas}
              onChange={(e) =>
                onObservacionesChange({ ...observaciones, meteorologicas: e.target.value })
              }
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
              placeholder="Ej: Días soleados, temperatura promedio 22°C, sin lluvias..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Problemas Encontrados */}
            <div>
              <label className="block text-sm text-brand-brown/70 mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Problemas Encontrados
              </label>
              <textarea
                value={observaciones.problemas}
                onChange={(e) =>
                  onObservacionesChange({ ...observaciones, problemas: e.target.value })
                }
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                placeholder="Ej: Obstrucción en boquilla del equipo..."
              />
            </div>

            {/* Ajustes Realizados */}
            <div>
              <label className="block text-sm text-brand-brown/70 mb-2 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Ajustes Realizados
              </label>
              <textarea
                value={observaciones.ajustes}
                onChange={(e) =>
                  onObservacionesChange({ ...observaciones, ajustes: e.target.value })
                }
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                placeholder="Ej: Se aumentó la dosis en lote 5 por alta incidencia..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* VALIDACIÓN */}
      {totalJornales === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-900">
              <strong>Debes registrar al menos un jornal</strong>
            </p>
            <p className="text-yellow-800 text-sm mt-1">
              Ingresa la cantidad de jornales utilizados en cada actividad para continuar.
            </p>
          </div>
        </div>
      )}

      {esFechaValida && totalJornales > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-green-900">
              <strong>Datos completos</strong>
            </p>
            <p className="text-green-800 text-sm mt-1">
              Puedes continuar al siguiente paso para revisar los cálculos automáticos.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}