// ARCHIVO: components/hato/components/ChequeoDiffReview.tsx
// DESCRIPCIÓN: VENTANA DE CORRECCIÓN del chequeo (Fase 3a de
// `docs/plan_chequeo_captura_foto.md`, decisión D-C del dueño 2026-07-29).
// Antes era puramente presentacional: mostraba el diff de
// `POST /hato/chequeo/preview` y, si el sistema no había entendido una celda,
// la única salida era volver al Excel, corregirlo y re-subirlo.
//
// Ahora se puede corregir aquí mismo:
//   * Editar los valores NORMALIZADOS de cada fila. Cada tecleo re-diffea en
//     cliente con el MISMO motor puro (`construirDiffChequeo`) contra el
//     estado fresco del hato -- ver `hooks/useRevisionChequeo.ts` -- así que la
//     clasificación de la fila se actualiza en vivo y lo que se envía al
//     commit son las filas CORREGIDAS.
//   * Adjudicar una colisión de chapeta corrigiendo la caravana de la fila que
//     corresponda. Nada se adjudica solo: la fila ambigua sigue bloqueada
//     hasta que una persona decide.
//   * Crear la ficha de un animal `nuevo` sin salir del flujo (reusa
//     `CrearAnimalDialog`, el mismo alta de `AnimalesList`) y volver a pedir el
//     estado del hato para que la fila pase a ser escribible. El commit rechaza
//     `nuevo` SIEMPRE, por diseño -- no se fuerza, se resuelve.
//
// Lo que NO cambia y no se negocia:
//   * el crudo (`*_raw`) nunca se sobreescribe -- toda corrección deja un issue
//     `CORRECCIÓN MANUAL` visible acá y persistido en
//     `hato_chequeo_vacas.normalizacion_issues` (ver `utils/hatoCorreccionChequeo.ts`);
//   * `nuevo`/`no_reconocido` no se aprueban por ningún atajo;
//   * ningún issue de normalización se oculta, tenga o no corrección encima;
//   * una chapeta provisional (800-999) NO se vuelve escribible corrigiendo
//     celdas: ese animal necesita su renumeración real primero.
//
// Layout: tabla de una fila por vaca, pensada para pantalla grande (es donde
// se confirma un chequeo de ~35 filas) y con scroll horizontal propio en
// móvil, donde el plan sólo espera la SUBIDA, no la corrección.

import { useState } from 'react';
import { AlertTriangle, Info, PencilLine, RotateCcw, UserPlus, Loader2 } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EstadoChip } from './EstadoChip';
import { chipClasificacionDiff, chipNumeroProvisional } from '@/utils/hatoUi';
import {
  CAMPOS_CORRECCION_CHEQUEO,
  CAMPOS_NO_CORREGIBLES,
  PREFIJO_ISSUE_CORRECCION_MANUAL,
  esClasificacionAprobable,
  valorParaEdicion,
  type CampoCorreccionChequeo,
  type CorreccionesFilaTexto,
  type MetaCampoCorreccion,
} from '@/utils/hatoCorreccionChequeo';
import type { PreviewChequeoRespuesta } from '../hooks/useSubirChequeoExcel';
import type { RevisionChequeo } from '../hooks/useRevisionChequeo';
import type { FilaDiffChequeo, ClasificacionFilaDiff } from '@/utils/importHato/diffChequeo';
import type { FilaChequeoNormalizada } from '@/utils/importHato/tipos';

// Render de `numero` unificado con el resto del módulo (F/U4,
// docs/hato/sesiones-b5-d7-e3.md): null -> "Sin caravana" (nunca "Sin
// número" ni en blanco), provisional (800-999) -> chip reusado de
// `hatoUi.ts` (nunca un texto ámbar inline propio) -- mismos helpers que
// `AnimalLabel.tsx`/`GenealogiaArbol.tsx`.
function etiquetaNumero(numero: number | null): string {
  return numero != null ? `#${numero}` : 'Sin caravana';
}

type FiltroFilas = 'todas' | 'atencion' | 'cambios' | 'sin_cambio';

const FILTROS: { valor: FiltroFilas; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'atencion', etiqueta: 'Requieren atención' },
  { valor: 'cambios', etiqueta: 'Con cambios' },
  { valor: 'sin_cambio', etiqueta: 'Sin cambios' },
];

const CAMPOS_POR_CLAVE = new Map<CampoCorreccionChequeo, MetaCampoCorreccion>(
  CAMPOS_CORRECCION_CHEQUEO.map((c) => [c.campo, c]),
);

/** Orden de las columnas editables de la tabla. Deliberadamente NO es el
 * orden de aplicación de `CAMPOS_CORRECCION_CHEQUEO` (ahí `toro` va antes de
 * `tipoServicio` porque el orden de aplicación importa); acá manda el orden de
 * la planilla, que es el que Martha lee. */
const COLUMNAS: { campo: CampoCorreccionChequeo; ancho: string; titulo: string }[] = [
  { campo: 'numero', ancho: 'w-20', titulo: '#' },
  { campo: 'nombre', ancho: 'w-32', titulo: 'Nombre' },
  { campo: 'pl', ancho: 'w-16', titulo: 'PL' },
  { campo: 'numPartos', ancho: 'w-16', titulo: 'Partos' },
  { campo: 'sx', ancho: 'w-20', titulo: 'SX' },
  { campo: 'fechaServicio', ancho: 'w-32', titulo: 'F. Servicio' },
  { campo: 'toro', ancho: 'w-24', titulo: 'Toro' },
  { campo: 'tipoServicio', ancho: 'w-24', titulo: 'Tipo serv.' },
  { campo: 'estado', ancho: 'w-28', titulo: 'Estado' },
];

const TOTAL_COLUMNAS = COLUMNAS.length + 2; // + clasificación + acciones

const CLASE_CELDA_BASE = 'w-full px-2 py-1 text-xs border rounded bg-white focus:outline-none focus:ring-2 disabled:opacity-50';

function claseCelda(corregido: boolean, conError: boolean): string {
  if (conError) return `${CLASE_CELDA_BASE} border-red-200 bg-red-50`;
  if (corregido) return `${CLASE_CELDA_BASE} border-amber-200 bg-amber-50`;
  return `${CLASE_CELDA_BASE} border-gray-200`;
}

interface CeldaProps {
  meta: MetaCampoCorreccion;
  fila: FilaChequeoNormalizada;
  numeroFila: number;
  /** Texto tecleado por el humano para este campo, si tocó el campo. */
  tecleado: string | undefined;
  corregido: boolean;
  mensajeError: string | undefined;
  editable: boolean;
  onCorregir: (fila: number, campo: CampoCorreccionChequeo, texto: string) => void;
}

function CeldaCorregible({
  meta,
  fila,
  numeroFila,
  tecleado,
  corregido,
  mensajeError,
  editable,
  onCorregir,
}: CeldaProps) {
  // Mientras el humano no toque el campo, el input muestra el valor
  // NORMALIZADO vigente (que puede venir de otra corrección de la misma fila,
  // p. ej. el tipo de servicio que dedujo el texto del toro).
  const valor = tecleado ?? valorParaEdicion(fila, meta.campo);
  const clase = claseCelda(corregido, mensajeError !== undefined);
  const titulo = mensajeError ?? meta.ayuda;

  if (meta.tipo === 'seleccion') {
    return (
      <select
        className={clase}
        value={valor}
        title={titulo}
        disabled={!editable}
        aria-label={`${meta.etiqueta} de la fila ${numeroFila}`}
        onChange={(e) => onCorregir(numeroFila, meta.campo, e.target.value)}
      >
        {(meta.opciones ?? []).map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      // `type="date"` para fechas (ISO nativo, sin ambigüedad d/m/a) y texto
      // para todo lo demás -- incluidos los numéricos, que se interpretan con
      // `parseValorNumerico`, el mismo parser del archivo, en vez de dejar que
      // el navegador decida. `type="number"` además cambia valores al hacer
      // scroll (bug prohibido por CLAUDE.md).
      type={meta.tipo === 'fecha' ? 'date' : 'text'}
      className={clase}
      value={valor}
      title={titulo}
      disabled={!editable}
      aria-label={`${meta.etiqueta} de la fila ${numeroFila}`}
      placeholder="—"
      onChange={(e) => onCorregir(numeroFila, meta.campo, e.target.value)}
    />
  );
}

interface FilaProps {
  diff: FilaDiffChequeo;
  fila: FilaChequeoNormalizada;
  correccionesTexto: CorreccionesFilaTexto | undefined;
  camposCorregidos: CampoCorreccionChequeo[];
  erroresPorCampo: Map<CampoCorreccionChequeo, string>;
  editable: boolean;
  onCorregir: (fila: number, campo: CampoCorreccionChequeo, texto: string) => void;
  onDeshacer: (fila: number) => void;
  onCrearFicha: (diff: FilaDiffChequeo) => void;
}

function FilaDiffEditable({
  diff,
  fila,
  correccionesTexto,
  camposCorregidos,
  erroresPorCampo,
  editable,
  onCorregir,
  onDeshacer,
  onCrearFicha,
}: FilaProps) {
  const corregidos = new Set(camposCorregidos);
  const issuesCorreccion = fila.issues.filter((i) => i.motivo.startsWith(PREFIJO_ISSUE_CORRECCION_MANUAL));
  const issuesParseo = fila.issues.filter((i) => !i.motivo.startsWith(PREFIJO_ISSUE_CORRECCION_MANUAL));
  const hayDetalle =
    diff.motivoNoReconocido !== null ||
    diff.diferencias.length > 0 ||
    fila.issues.length > 0 ||
    erroresPorCampo.size > 0 ||
    diff.clasificacion === 'nuevo';

  return (
    <>
      <tr className="border-t border-gray-100 bg-white">
        <td className="px-2 py-1 align-middle whitespace-nowrap">
          <div className="flex flex-wrap items-center gap-1">
            <EstadoChip chip={chipClasificacionDiff(diff.clasificacion)} />
            {diff.numeroEsProvisional && <EstadoChip chip={chipNumeroProvisional()} />}
          </div>
          <p className="text-xs text-gray-400">fila {diff.fila}</p>
        </td>
        {COLUMNAS.map(({ campo }) => (
          <td key={campo} className="px-2 py-1 align-middle">
            <CeldaCorregible
              meta={CAMPOS_POR_CLAVE.get(campo)!}
              fila={fila}
              numeroFila={diff.fila}
              tecleado={correccionesTexto?.[campo]}
              corregido={corregidos.has(campo)}
              mensajeError={erroresPorCampo.get(campo)}
              editable={editable}
              onCorregir={onCorregir}
            />
          </td>
        ))}
        <td className="px-2 py-1 align-middle whitespace-nowrap text-right">
          {camposCorregidos.length > 0 && (
            <button
              type="button"
              onClick={() => onDeshacer(diff.fila)}
              disabled={!editable}
              title="Descartar las correcciones de esta fila y volver a lo que decía el archivo"
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Deshacer
            </button>
          )}
        </td>
      </tr>

      {hayDetalle && (
        <tr className="bg-gray-50">
          <td colSpan={TOTAL_COLUMNAS} className="px-3 py-2">
            <div className="space-y-1">
              {diff.motivoNoReconocido && (
                <p className="text-xs text-red-600">
                  <AlertTriangle className="w-4 h-4 inline-flex flex-shrink-0" /> {diff.motivoNoReconocido}
                  {diff.numeroEsProvisional && (
                    <>
                      {' '}
                      Este animal necesita primero su renumeración real (Hato → ficha del animal → Editar); corregir
                      celdas acá no lo vuelve escribible.
                    </>
                  )}
                </p>
              )}

              {diff.clasificacion === 'nuevo' && (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-blue-800">
                    La caravana {etiquetaNumero(diff.numero)} no tiene ficha en el hato, así que el commit no la puede
                    escribir. Crea la ficha (caravana física por debajo de 800) y el diff se recalcula.
                  </p>
                  <button
                    type="button"
                    onClick={() => onCrearFicha(diff)}
                    disabled={!editable}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    Crear ficha del animal
                  </button>
                </div>
              )}

              {[...erroresPorCampo.entries()].map(([campo, mensaje]) => (
                <p key={campo} className="text-xs text-red-600">
                  <AlertTriangle className="w-4 h-4 inline-flex flex-shrink-0" /> {mensaje} La corrección no se aplicó:
                  se conserva el valor anterior hasta que se pueda leer.
                </p>
              ))}

              {diff.diferencias.length > 0 && (
                <ul className="text-xs text-gray-600 space-y-1">
                  {diff.diferencias.map((d) => (
                    <li key={d.campo}>
                      <span className="font-medium">{d.campo}:</span> {String(d.anterior ?? '—')} →{' '}
                      <span className="text-amber-700">{String(d.nuevo ?? '—')}</span>
                    </li>
                  ))}
                </ul>
              )}

              {issuesCorreccion.map((issue, i) => (
                <p key={`c${i}`} className="text-xs text-amber-700">
                  <PencilLine className="w-4 h-4 inline-flex flex-shrink-0" /> {issue.motivo}
                </p>
              ))}

              {issuesParseo.map((issue, i) => (
                <p key={`p${i}`} className="text-xs text-gray-400">
                  ⚠ {issue.motivo}
                </p>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function ChequeoDiffReview({
  resultado,
  revision,
  editable,
  motivoSoloLectura,
  onCrearFicha,
}: {
  resultado: PreviewChequeoRespuesta;
  revision: RevisionChequeo;
  /** `false` = solo lectura (rol sin permiso de escritura del módulo, o el
   * estado del hato no se pudo leer y sin él no hay con qué re-clasificar). */
  editable: boolean;
  motivoSoloLectura?: string | null;
  onCrearFicha: (diff: FilaDiffChequeo) => void;
}) {
  const [filtro, setFiltro] = useState<FiltroFilas>('todas');
  const {
    diff,
    filasCorregidas,
    correcciones,
    camposCorregidosPorFila,
    erroresCorreccion,
    resumenCorrecciones,
    derivasDesdePreview,
    torosNuevos,
    cargandoEstado,
    errorEstado,
    corregirCampo,
    deshacerFila,
  } = revision;
  const { resumen, colisionesEnHoja } = diff;

  const filasPorNumero = new Map(filasCorregidas.map((f) => [f.fila, f]));
  const erroresPorFila = new Map<number, Map<CampoCorreccionChequeo, string>>();
  for (const error of erroresCorreccion) {
    if (!erroresPorFila.has(error.fila)) erroresPorFila.set(error.fila, new Map());
    erroresPorFila.get(error.fila)!.set(error.campo, error.mensaje);
  }

  const requiereAtencion = (f: FilaDiffChequeo) =>
    !esClasificacionAprobable(f.clasificacion) ||
    f.issues.length > 0 ||
    erroresPorFila.has(f.fila);

  const coincideFiltro = (f: FilaDiffChequeo, clasificacion: ClasificacionFilaDiff) => {
    switch (filtro) {
      case 'todas':
        return true;
      case 'atencion':
        return requiereAtencion(f);
      case 'cambios':
        return clasificacion === 'cambio';
      case 'sin_cambio':
        return clasificacion === 'sin_cambio';
      default:
        return true;
    }
  };

  // Orden ESTABLE por número de fila del archivo -- nunca agrupado por
  // clasificación: una fila que se reclasifica al corregirla no puede saltar de
  // sitio y hacerle perder el foco a quien está escribiendo.
  const filasVisibles = [...diff.filas]
    .sort((a, b) => a.fila - b.fila)
    .filter((f) => coincideFiltro(f, f.clasificacion));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
          <p className="text-lg font-semibold text-gray-900">{resumen.nuevos}</p>
          <p className="text-xs text-gray-500">Nuevas</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
          <p className="text-lg font-semibold text-gray-900">{resumen.cambios}</p>
          <p className="text-xs text-gray-500">Con cambios</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
          <p className="text-lg font-semibold text-gray-900">{resumen.sinCambio}</p>
          <p className="text-xs text-gray-500">Sin cambios</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center">
          <p className="text-lg font-semibold text-red-700">{resumen.noReconocidos}</p>
          <p className="text-xs text-red-600">No reconocidas</p>
        </div>
      </div>

      {cargandoEstado && (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
          Leyendo el estado actual del hato para poder recalcular el diff mientras corriges…
        </div>
      )}

      {errorEstado && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">No se pudo leer el estado del hato — la corrección queda deshabilitada</p>
            <p className="text-xs">{errorEstado}</p>
            <p className="text-xs">
              Sin el estado fresco no se puede recalcular la clasificación de una fila corregida, y aprobar a ciegas no
              es una opción. Lo que sí se puede aprobar es el diff tal como lo devolvió el servidor.
            </p>
          </div>
        </div>
      )}

      {!editable && motivoSoloLectura && (
        <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>{motivoSoloLectura}</p>
        </div>
      )}

      {derivasDesdePreview.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">El hato cambió desde que se generó esta vista previa</p>
            <ul className="mt-1 space-y-1 text-xs">
              {derivasDesdePreview.map((d) => (
                <li key={d.fila}>
                  {etiquetaNumero(d.numero)} (fila {d.fila}): {d.antes} → {d.despues}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              Ya se está usando la clasificación NUEVA, que es la que el commit va a revalidar.
            </p>
          </div>
        </div>
      )}

      {colisionesEnHoja.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Chapetas repetidas en esta hoja con nombres distintos</p>
            <ul className="mt-1 space-y-1">
              {colisionesEnHoja.map((c) => (
                <li key={c.numero}>
                  #{c.numero}: {c.nombres.join(' / ')}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              Ninguna de las filas involucradas se adjudica sola. Corrige la caravana (columna <strong>#</strong>) de la
              fila que no corresponda a esa chapeta y las dos vuelven a ser aprobables.
            </p>
          </div>
        </div>
      )}

      {erroresCorreccion.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>
            {erroresCorreccion.length} corrección(es) no se pueden interpretar. No se aplicaron ni se convirtieron en
            "sin dato": corrígelas o deshazlas — no se puede aprobar con una corrección a medias.
          </p>
        </div>
      )}

      {torosNuevos.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>
            Al aprobar se darán de alta en el catálogo de toros: <strong>{torosNuevos.join(', ')}</strong>. Si alguno es
            un nombre mal leído, corrígelo en la columna Toro antes de aprobar.
          </p>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p>
            Nada se ha guardado todavía. Al aprobar se escriben solo las filas <strong>Con cambios</strong> y{' '}
            <strong>Sin cambios</strong>, con las correcciones que hagas acá. Las <strong>Nuevas</strong> necesitan que
            crees la ficha del animal; las <strong>No reconocidas</strong> se resuelven corrigiendo la caravana o
            renumerando al animal — ninguna de las dos se aprueba en silencio.
          </p>
          <p className="mt-1 text-xs">
            Corregir un valor NO borra lo que decía el archivo: el crudo se guarda intacto y la corrección queda
            registrada como decisión humana en la fila. Sin corrección posible acá:{' '}
            {CAMPOS_NO_CORREGIBLES.map((c) => `${c.etiqueta} (${c.motivo})`).join(' · ')}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={filtro}
          onValueChange={(v) => v && setFiltro(v as FiltroFilas)}
        >
          {FILTROS.map((f) => (
            <ToggleGroupItem key={f.valor} value={f.valor} className="text-xs px-3">
              {f.etiqueta}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs text-gray-500">
          {filasVisibles.length} de {resumen.totalFilas} fila(s)
          {resumenCorrecciones.camposCorregidos > 0 && (
            <>
              {' · '}
              <span className="text-amber-700">
                {resumenCorrecciones.camposCorregidos} corrección(es) en {resumenCorrecciones.filasCorregidas} fila(s)
              </span>
            </>
          )}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-28">
                  Clasificación
                </th>
                {COLUMNAS.map((c) => (
                  <th
                    key={c.campo}
                    title={CAMPOS_POR_CLAVE.get(c.campo)!.ayuda}
                    className={`px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${c.ancho}`}
                  >
                    {c.titulo}
                  </th>
                ))}
                <th className="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 w-24" />
              </tr>
            </thead>
            <tbody>
              {filasVisibles.map((filaDiff) => {
                const fila = filasPorNumero.get(filaDiff.fila);
                if (!fila) return null;
                return (
                  <FilaDiffEditable
                    key={filaDiff.fila}
                    diff={filaDiff}
                    fila={fila}
                    correccionesTexto={correcciones[filaDiff.fila]}
                    camposCorregidos={camposCorregidosPorFila[filaDiff.fila] ?? []}
                    erroresPorCampo={erroresPorFila.get(filaDiff.fila) ?? new Map()}
                    editable={editable}
                    onCorregir={corregirCampo}
                    onDeshacer={deshacerFila}
                    onCrearFicha={onCrearFicha}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
        {filasVisibles.length === 0 && (
          <p className="px-3 py-3 text-sm text-gray-500">Ninguna fila coincide con este filtro.</p>
        )}
      </div>

      {(resultado.terneras.length > 0 || resultado.subtablas.length > 0) && (
        <p className="text-xs text-gray-500">
          Además se leyeron {resultado.terneras.length} filas de TERNERAS y {resultado.subtablas.length} de sub-tablas
          embebidas — fuera del alcance de este diff (dominio distinto), se preservan para revisión aparte.
        </p>
      )}
    </div>
  );
}
