// ARCHIVO: components/hato/ChequeosList.tsx
// DESCRIPCIÓN: Ruta `/hato-lechero/chequeos` (S4, plan §7.5). Lista de
// chequeos ya cargados + botón para subir un chequeo nuevo (B0/V10 -- el
// ÚNICO camino de entrada del chequeo desde D-4, 2026-07-22: no hay
// internet en la finca).
//
// `ChequeoCapturaGrid` (B1, captura manual en grilla) NO se implementa en
// esta sesión -- ver la decisión D-4 del dueño (2026-07-22, plan §8):
// "B1 ChequeoCapturaGrid se elimina del alcance. La ruta
// /hato-lechero/chequeos/:id ya no necesita una grilla editable de
// captura; sí una vista de revisión del diff antes de comprometer." Esa
// nota reemplaza explícitamente al bullet de alcance de S4 que todavía
// mencionaba la grilla como entregable -- se documenta también en el
// reporte de esta sesión.
//
// Figma alignment spec §5 (Wave 2a) agrega: `HatoPageHeader` compartido y
// filas clicables -> `/hato-lechero/chequeos/:id` (`ChequeoDetalle.tsx`) --
// "de lo contrario es una lista inútil" (palabras del dueño).
//
// Fase 1 de `docs/plan_chequeo_captura_foto.md` (2026-07-29): la planilla
// exportada desde acá pasa a ser INCREMENTAL. `filaPlanillaPrellenada` ya no
// manda `null` fijo en Sexo cría / Fecha Servicio / Toro / Estado -- las
// cuatro se arrastran del último chequeo conocido (`ultimo_estado_chequeo`
// hoy solo existe para una minoría de vacas, así que esa columna sale mayormente
// en blanco al arrancar: es correcto, se llena chequeo a chequeo).
//
// Fase 2 del mismo plan: son DOS artefactos con dos trabajos, y por eso hay
// DOS botones (nunca un menú de "formato", que esconde la diferencia):
//   - **PDF** = para IMPRIMIR y escribir a mano en el corral. Horizontal,
//     letra 11pt, recuadro por celda, etiquetas legibles ("Hembra (retenida
//     #206)"). No se re-parsea nunca.
//   - **.xlsx** = respaldo de MÁQUINA. Conserva los códigos crudos (`A 206`)
//     y es el que se vuelve a subir por el flujo B0/V10.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, AlertTriangle, Upload, FileSpreadsheet, ChevronRight, FileDown, Printer, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useHatoChequeos, type ChequeoListItem } from './hooks/useHatoChequeos';
import { ordenarPorValor, type DireccionOrdenAnimales as DireccionOrden } from '@/utils/ordenarAnimalesHato';
import { useAnimalesParaPlanillaChequeo } from './hooks/useAnimalesParaPlanillaChequeo';
import { SubirChequeoExcel } from './components/SubirChequeoExcel';
import { CapturaArchivo } from './components/CapturaArchivo';
import { HatoPageHeader } from './components/HatoPageHeader';
import { formatShortDate, formatNumber } from '@/utils/format';
import {
  descargarPlanillaChequeo,
  construirTituloHojaChequeo,
  construirNombreHojaChequeo,
  isoATextoDDMMYYYY,
  textoCeldaToro,
  textoCeldaEstado,
  textoCeldaEstadoRegistrado,
  type FilaPlanillaChequeo,
} from '@/utils/hato/exportarPlanillaChequeo';
import {
  descargarPlanillaChequeoPDF,
  etiquetaSexoCria,
} from '@/utils/hato/exportarPlanillaChequeoPDF';
import type { AnimalParaPlanillaChequeo } from './hooks/useAnimalesParaPlanillaChequeo';
import { obtenerFechaHoy } from '@/utils/fechas';

/**
 * B5.1 -- planilla PRE-LLENADA para el PRÓXIMO chequeo (aún sin fecha real:
 * D-4, no hay internet en la finca, así que el chequeo nunca se agenda en la
 * app). El título/nombre de hoja usan la fecha de HOY como placeholder --
 * quien transcriba las notas del veterinario debe corregir la celda del
 * título a la fecha real del examen antes de volver a subir el archivo
 * (misma columna que gobierna la fecha de cualquier chequeo, ver
 * `parseFechaChequeo`).
 *
 * Fase 1 de `docs/plan_chequeo_captura_foto.md`: la planilla es INCREMENTAL
 * -- se pre-llena TODO lo que el sistema ya sabe, incluidas Sexo cría, Fecha
 * Servicio, Toro y Estado, que antes salían en `null` fijo desde acá aunque
 * la vista ya expusiera tres de las cuatro. Ese arrastre es el punto: Martha
 * solo anota lo que cambió, no vuelve a transcribir el chequeo anterior.
 * Único campo que sigue siempre vacío: `Tratamiento` (no hay de dónde
 * arrastrarlo -- vive en `hato_tratamientos`, otro flujo).
 *
 * Los valores se escriben en su forma CRUDA, re-parseable (`sx_raw`
 * verbatim, `Toro `/`Ins ` vía `textoCeldaToro`, `ok`/`rech` vía
 * `textoCeldaEstado`): este `.xlsx` es el artefacto de máquina, la etiqueta
 * legible es del PDF de la Fase 2. `null` -> celda vacía SIEMPRE, nunca `0`
 * ni un valor inventado.
 */
function filaPlanillaPrellenada(animal: AnimalParaPlanillaChequeo): FilaPlanillaChequeo {
  return {
    numero: animal.numero,
    nombre: animal.nombre,
    pl: animal.pl,
    numPartos: animal.numPartos,
    ultimaCria: isoATextoDDMMYYYY(animal.ultimoPartoFecha),
    // `sexoCriaRaw` (no `sexoCria`): el código SX crudo del MISMO parto del
    // que sale `ultimaCria`, así que fecha y sexo nunca se contradicen.
    sexoCria: animal.sexoCriaRaw,
    fechaServicio: isoATextoDDMMYYYY(animal.ultimoServicioFecha),
    toro: textoCeldaToro(animal.toroNombre, animal.tipoServicio),
    // "Estado registrado" (D-E, N22): lo que el motor de 5 estados cree HOY
    // -- misma etiqueta en el `.xlsx` y en el PDF (a diferencia de `Sexo
    // cría`, no hay un código crudo distinto que preservar: nadie escribe
    // encima de esta columna).
    estadoRegistrado: textoCeldaEstadoRegistrado(animal.estadoReproductivo),
    estado: textoCeldaEstado(animal.ultimoEstadoChequeo),
    secar: isoATextoDDMMYYYY(animal.fechaSecar),
    partoProbable: isoATextoDDMMYYYY(animal.fechaProbableParto),
    tratamiento: null,
  };
}

/**
 * MISMA fila que el `.xlsx` (misma fuente de datos, mismo orden de columnas),
 * cambiando UNA cosa: `Sexo cría` lleva la etiqueta legible en vez del código
 * crudo. Es la única diferencia de CONTENIDO entre los dos artefactos, y vive
 * acá -- en el llamador, que es quien sabe qué artefacto está produciendo --
 * para que ninguno de los dos exportadores tenga que conocer al otro.
 *
 * `etiquetaSexoCria` devuelve `null` cuando no hay sexo NI destino: la celda
 * sale vacía, nunca con un texto que parezca dato.
 */
function filaPlanillaPdf(animal: AnimalParaPlanillaChequeo): FilaPlanillaChequeo {
  return {
    ...filaPlanillaPrellenada(animal),
    sexoCria: etiquetaSexoCria({
      sexoCria: animal.sexoCria,
      criaDestino: animal.criaDestino,
      sexoCriaRaw: animal.sexoCriaRaw,
    }),
  };
}

type ColumnaOrdenableChequeos = 'fecha' | 'veterinario' | 'totalVacas';

function CabeceraOrdenableChequeos({
  label,
  columna,
  ordenActual,
  onOrdenar,
  align = 'left',
}: {
  label: string;
  columna: ColumnaOrdenableChequeos;
  ordenActual: { columna: ColumnaOrdenableChequeos; direccion: DireccionOrden };
  onOrdenar: (columna: ColumnaOrdenableChequeos) => void;
  align?: 'left' | 'right';
}) {
  const activa = ordenActual.columna === columna;
  return (
    <th className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onOrdenar(columna)}
        className={`inline-flex items-center gap-1 hover:text-gray-900 ${activa ? 'text-gray-900' : ''}`}
      >
        {label}
        {activa ? (
          ordenActual.direccion === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronsUpDown className="w-3 h-3 text-gray-300" />
        )}
      </button>
    </th>
  );
}

const EXTRACTORES_CHEQUEOS: Record<ColumnaOrdenableChequeos, (c: ChequeoListItem) => string | number | null> = {
  fecha: (c) => c.fecha,
  veterinario: (c) => c.veterinario,
  totalVacas: (c) => c.totalVacas,
};

export function ChequeosList() {
  const { chequeos, loading, error, reload } = useHatoChequeos();
  const { animales: animalesParaPlanilla, loading: cargandoAnimales } = useAnimalesParaPlanillaChequeo();
  const [mostrarSubida, setMostrarSubida] = useState(false);
  // UI audit (2026-08-06): antes el botón exterior solo abría el diálogo
  // VACÍO, y recién ADENTRO se repetía la misma elección "¿foto o archivo?"
  // -- un paso intermedio redundante. Ahora el botón exterior ES el
  // desplegable (D-8), y lo elegido aquí se pasa como selección inicial al
  // diálogo. Se limpian al cerrar para que "Subir el primer chequeo" (el
  // botón del estado vacío, que no pasa por acá) siga abriendo el diálogo
  // en blanco como antes.
  const [fotosParaSubir, setFotosParaSubir] = useState<File[]>([]);
  const [archivoParaSubir, setArchivoParaSubir] = useState<File | null>(null);
  const [exportando, setExportando] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  // Más reciente primero por defecto -- mismo orden que ya traía la query
  // (T2, ronda agosto 2026: encabezados ahora interactivos).
  const [orden, setOrden] = useState<{ columna: ColumnaOrdenableChequeos; direccion: DireccionOrden }>({
    columna: 'fecha',
    direccion: 'desc',
  });
  const handleOrdenar = (columna: ColumnaOrdenableChequeos) => {
    setOrden((prev) =>
      prev.columna === columna
        ? { columna, direccion: prev.direccion === 'asc' ? 'desc' : 'asc' }
        : { columna, direccion: columna === 'veterinario' ? 'asc' : 'desc' },
    );
  };
  const chequeosOrdenados = useMemo(
    () => ordenarPorValor(chequeos, EXTRACTORES_CHEQUEOS[orden.columna], orden.direccion),
    [chequeos, orden],
  );

  const handleImprimirPlanillaPDF = async () => {
    setExportandoPdf(true);
    try {
      // Misma fecha placeholder y mismo título que el `.xlsx`
      // (`construirTituloHojaChequeo`): el PDF y el respaldo NUNCA pueden
      // mostrar fechas distintas del mismo chequeo.
      const hoy = obtenerFechaHoy();
      await descargarPlanillaChequeoPDF(
        {
          tituloDocumento: construirTituloHojaChequeo(hoy),
          subtitulo: `${animalesParaPlanilla.length} vacas activas · las columnas en gris son de referencia, escriba solo en las blancas`,
          filas: animalesParaPlanilla.map(filaPlanillaPdf),
        },
        `planilla-proximo-chequeo-${hoy}.pdf`,
      );
      toast.success('Planilla lista para imprimir. Corrija la fecha del título si el chequeo es otro día.');
    } catch {
      toast.error('No se pudo generar el PDF de la planilla.');
    } finally {
      setExportandoPdf(false);
    }
  };

  const handleExportarPlanilla = async () => {
    setExportando(true);
    try {
      // `obtenerFechaHoy()` -- NUNCA `new Date().toISOString().slice(0, 10)`,
      // que es UTC y ya es "mañana" en Bogotá después de las 19:00.
      const hoy = obtenerFechaHoy();
      await descargarPlanillaChequeo(
        {
          tituloHoja: construirTituloHojaChequeo(hoy),
          nombreHoja: construirNombreHojaChequeo(hoy),
          filas: animalesParaPlanilla.map(filaPlanillaPrellenada),
        },
        `planilla-proximo-chequeo-${hoy}.xlsx`,
      );
      toast.success('Planilla exportada. Actualiza la fecha del título con la del chequeo real antes de subirla.');
    } catch {
      toast.error('No se pudo exportar la planilla.');
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-background p-4 lg:p-8">
      <div className="max-w-5xl mx-auto w-full">
        <HatoPageHeader
          breadcrumb="Hato Lechero"
          section="Chequeos"
          title="Chequeos"
          subtitle="Chequeo veterinario bimestral — sube el Excel que Martha ya diligencia"
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={handleImprimirPlanillaPDF}
                disabled={exportandoPdf || cargandoAnimales}
                title="Hoja horizontal, letra grande y una casilla por dato: para imprimir y escribir a mano en el corral"
              >
                {exportandoPdf ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Printer className="w-4 h-4 mr-2" />
                )}
                Planilla para imprimir (PDF)
              </Button>
              <Button
                variant="outline"
                onClick={handleExportarPlanilla}
                disabled={exportando || cargandoAnimales}
                title="Respaldo editable con los códigos originales -- es el archivo que se vuelve a subir al sistema"
              >
                {exportando ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4 mr-2" />
                )}
                Respaldo editable (.xlsx)
              </Button>
              <CapturaArchivo
                label="Subir chequeo"
                acceptArchivo=".xlsx,.xls"
                labelOpcionArchivo="Subir archivo .xlsx"
                onFotos={(files) => {
                  setArchivoParaSubir(null);
                  setFotosParaSubir(files);
                  setMostrarSubida(true);
                }}
                onArchivo={(files) => {
                  setFotosParaSubir([]);
                  setArchivoParaSubir(files[0]);
                  setMostrarSubida(true);
                }}
              />
            </div>
          }
        />

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-6 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : chequeos.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <FileSpreadsheet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-4">Todavía no se ha cargado ningún chequeo.</p>
            <Button
              onClick={() => {
                setFotosParaSubir([]);
                setArchivoParaSubir(null);
                setMostrarSubida(true);
              }}
              variant="outline"
            >
              <Upload className="w-4 h-4 mr-2" />
              Subir el primer chequeo
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <CabeceraOrdenableChequeos label="Fecha" columna="fecha" ordenActual={orden} onOrdenar={handleOrdenar} />
                    <CabeceraOrdenableChequeos label="Veterinario" columna="veterinario" ordenActual={orden} onOrdenar={handleOrdenar} />
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Fuente</th>
                    <CabeceraOrdenableChequeos label="Vacas" columna="totalVacas" ordenActual={orden} onOrdenar={handleOrdenar} align="right" />
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Estado</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500" />
                  </tr>
                </thead>
                <tbody>
                  {chequeosOrdenados.map((c, i) => (
                    <tr key={c.id} className={`border-t border-gray-100 hover:bg-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-3 py-2.5 whitespace-nowrap font-medium">
                        <Link to={`/hato-lechero/chequeos/${c.id}`} className="hover:text-primary">
                          {formatShortDate(c.fecha)}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{c.veterinario ?? '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap capitalize">{c.fuente}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatNumber(c.totalVacas)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap capitalize">{c.estado}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-right">
                        <Link
                          to={`/hato-lechero/chequeos/${c.id}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Ver detalle <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <SubirChequeoExcel
          open={mostrarSubida}
          onOpenChange={(abierto) => {
            setMostrarSubida(abierto);
            if (!abierto) {
              setFotosParaSubir([]);
              setArchivoParaSubir(null);
            }
          }}
          fotosIniciales={fotosParaSubir}
          archivoInicial={archivoParaSubir}
          onCompletado={reload}
        />
      </div>
    </div>
  );
}
