// ARCHIVO: components/hato/components/SubirChequeoExcel.tsx
//
// Fase 3b -- DOS RUTAS DE ENTRADA, un solo flujo. El modo por defecto es
// **foto**: Martha fotografía la planilla impresa que llenó a mano y las
// imágenes van a `POST /hato/chequeo/foto`. El `.xlsx` queda como respaldo.
// Ambos endpoints devuelven la MISMA forma de respuesta, así que de la vista
// previa en adelante (corrección, fecha, aprobación) el código no distingue de
// dónde vino el chequeo -- el OCR reemplaza la lectura de la grilla, no el
// pipeline. El `<input capture="environment">` abre la cámara trasera en el
// celular; las fotos se ACUMULAN (una por página) porque la cámara móvil
// devuelve una a la vez.
//
// D-8 (ronda agosto 2026, S2): la elección "¿foto o archivo?" pasó de DOS
// botones sueltos a UN botón con dropdown (`CapturaArchivo.tsx`, compartido
// con S4/S5) -- pedido explícito de Santiago ("solo uno para cargar chequeo
// que abra un dropdown"). El drag & drop se conserva como atajo de escritorio
// en un ÚNICO drop zone que huele el tipo de archivo soltado (imagen ->
// fotos, `.xlsx` -> archivo) en vez de dos zonas separadas por modo.
//
// UI audit (2026-08-06): ese dropdown vivía DOS VECES -- una vez en el botón
// exterior de `ChequeosList.tsx` (que solo abría este diálogo vacío) y otra
// vez acá adentro, obligando a elegir "¿foto o archivo?" dos veces para una
// sola decisión. Ahora `ChequeosList.tsx` ES el dropdown y pasa lo elegido
// como `fotosIniciales`/`archivoInicial`: el diálogo abre con la selección
// ya cargada, lista para "Subir y revisar". El `CapturaArchivo` de acá adentro
// se conserva -- sigue haciendo falta para agregar páginas de más a un
// chequeo de varias hojas, o para cambiar de opinión sin cerrar el diálogo.
//
// El bloque `resultado.ocr` se renderiza SIEMPRE que venga: sin él, una vaca
// que el OCR no encontró se vería idéntica a una vaca sin cambios, que es
// exactamente el fallo silencioso que el módulo prohíbe.
//
// DESCRIPCIÓN: Diálogo B0/V10 -- sube el .xlsx del chequeo, lo envía a
// `POST /hato/chequeo/preview` y muestra la VENTANA DE CORRECCIÓN
// (`ChequeoDiffReview`, editable desde la Fase 3a de
// `docs/plan_chequeo_captura_foto.md`), y expone el botón "Aprobar" que llama a
// `POST /hato/chequeo/commit` (revalida el diff contra el estado fresco del
// hato y escribe en una sola transacción -- ver
// `src/supabase/functions/server/hato-chequeo-commit.ts`). Sigue el patrón
// `Dialog + DialogContent size + DialogBody` obligatorio (CLAUDE.md, Dialog
// Size System) y el patrón de subida de `ImportarProductosCSV.tsx` (drag &
// drop + selección manual).
//
// Fase 3a -- tres cosas que este archivo aporta al flujo de corrección:
//   1. **La fecha del chequeo es editable y validada** (`useRevisionChequeo`).
//      La planilla exportada usa la fecha de HOY como placeholder en el título,
//      así que hasta ahora un chequeo podía guardarse con fecha equivocada sin
//      ninguna red de seguridad. Esa fecha se propaga a TODAS las filas, no
//      solo a la cabecera: es la que ancla los eventos y `meses_prenez`.
//   2. **Se aprueban las filas CORREGIDAS** (`revision.filasAprobables`), no
//      las del archivo. Es seguro por construcción: el commit revalida con
//      `construirDiffChequeo` sobre lo que recibe, no re-parsea el `.xlsx`.
//   3. **Escritura gateada a Administrador/Gerencia** (misma RLS del módulo,
//      migración 053). Otros roles ven la revisión completa en solo lectura, con
//      el motivo dicho en pantalla -- nunca un botón que falla con 403.

import { useEffect, useState } from 'react';
import { FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, X, Camera } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useSubirChequeoExcel } from '../hooks/useSubirChequeoExcel';
import { useRevisionChequeo } from '../hooks/useRevisionChequeo';
import { ChequeoDiffReview } from './ChequeoDiffReview';
import { CrearAnimalDialog } from './CrearAnimalDialog';
import { CapturaArchivo } from './CapturaArchivo';
import type { FilaDiffChequeo } from '@/utils/importHato/diffChequeo';

/** Tope de fotos por chequeo -- el MISMO que valida el servidor
 * (`hato-chequeo-foto.ts`). Duplicarlo aquí es a propósito: así el usuario se
 * entera antes de subir 20MB para recibir un rechazo. */
const MAX_FOTOS = 6;

export function SubirChequeoExcel({
  open,
  onOpenChange,
  onCompletado,
  fotosIniciales,
  archivoInicial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompletado?: () => void;
  /** Selección ya hecha por el disparador exterior (`ChequeosList.tsx`, D-8
   * de la ronda agosto 2026): si viene con contenido, el diálogo abre
   * directo con esa página lista en vez de pedir la misma elección otra vez. */
  fotosIniciales?: File[];
  archivoInicial?: File | null;
}) {
  const {
    subir,
    subirFotos,
    comprometer,
    limpiar,
    loading,
    error,
    resultado,
    comprometiendo,
    errorCommit,
    filasRechazadas,
    commitResultado,
  } = useSubirChequeoExcel();
  const revision = useRevisionChequeo(resultado);
  const { profile } = useAuth();
  // Mismo conjunto de roles que la RLS de escritura de `hato_*` (migración
  // 053) y que exige el endpoint de commit.
  const puedeEscribir = profile?.rol === 'Administrador' || profile?.rol === 'Gerencia';

  const [archivo, setArchivo] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [veterinario, setVeterinario] = useState('');
  const [filaParaFicha, setFilaParaFicha] = useState<FilaDiffChequeo | null>(null);
  // Fase 3b -- ruta por FOTO. `foto` es el modo por defecto: es el camino que
  // el flujo nuevo quiere (Martha fotografía la planilla que llenó a mano) y
  // el `.xlsx` queda como respaldo, no al revés. `null` = todavía no eligió
  // nada (recién abierto el diálogo, ver `CapturaArchivo`/D-8).
  const [modo, setModo] = useState<'foto' | 'excel' | null>('foto');
  const [fotos, setFotos] = useState<File[]>([]);
  const [avisoFotos, setAvisoFotos] = useState<string | null>(null);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setArchivo(null);
      setFotos([]);
      setAvisoFotos(null);
      setVeterinario('');
      setFilaParaFicha(null);
      setModo('foto');
      limpiar();
      onCompletado?.();
    }
    onOpenChange(nextOpen);
  };

  const filasAprobables = revision.filasAprobables.length;
  const hayErroresCorreccion = revision.erroresCorreccion.length > 0;
  const editable = puedeEscribir && revision.puedeEditar;
  const motivoSoloLectura = !puedeEscribir
    ? 'Tu rol puede revisar el chequeo pero no corregirlo ni aprobarlo: escribir en el Hato Lechero requiere Administrador o Gerencia (la misma regla que aplica la base de datos).'
    : null;

  const bloqueoAprobacion = !resultado
    ? null
    : !puedeEscribir
      ? 'Se requiere rol Administrador o Gerencia para aprobar.'
      : revision.errorFechaChequeo
        ? revision.errorFechaChequeo
        : hayErroresCorreccion
          ? 'Hay correcciones que no se pueden interpretar — corrígelas o deshazlas antes de aprobar.'
          : filasAprobables === 0
            ? 'No hay filas aprobables: las Nuevas necesitan ficha y las No reconocidas necesitan resolverse.'
            : null;

  const handleAprobar = async () => {
    if (bloqueoAprobacion) return;
    try {
      await comprometer({
        veterinario: veterinario.trim() || undefined,
        // La fecha VALIDADA (ya propagada a las filas por la revisión) y las
        // filas CORREGIDAS -- nunca las del archivo.
        fecha: revision.fechaChequeoValida ?? undefined,
        filas: revision.filasAprobables,
      });
    } catch {
      // El error/las filas rechazadas ya quedan en el hook (`errorCommit`/
      // `filasRechazadas`), se muestran abajo.
    }
  };

  const seleccionarArchivo = (file: File) => {
    if (!/\.xlsx?$/i.test(file.name)) return;
    setModo('excel');
    setArchivo(file);
  };

  /** Acumula en vez de reemplazar: en el celular la cámara devuelve UNA foto
   * por vez, así que la planilla de 2 páginas se arma con dos toques. El tope
   * de 6 es el mismo del servidor -- se avisa en vez de descartar en silencio. */
  const agregarFotos = (nuevas: File[]) => {
    setModo('foto');
    setFotos((previas) => {
      const total = [...previas, ...nuevas];
      if (total.length > MAX_FOTOS) {
        setAvisoFotos(`Solo se envían las primeras ${MAX_FOTOS} fotos; descarta alguna si necesitas otra.`);
        return total.slice(0, MAX_FOTOS);
      }
      setAvisoFotos(null);
      return total;
    });
  };

  // Selección ya hecha por el disparador exterior -- se siembra UNA vez por
  // apertura (nunca en cada render, o reabrir con el mismo `open` re-agregaría
  // las mismas fotos). `handleClose` ya deja el formulario en blanco al
  // cerrar, así que esto solo corre sobre un estado limpio.
  useEffect(() => {
    if (!open) return;
    if (archivoInicial) seleccionarArchivo(archivoInicial);
    else if (fotosIniciales && fotosIniciales.length > 0) agregarFotos(fotosIniciales);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Drop zone ÚNICA (D-8): huele el tipo de lo soltado en vez de exigir que
   * el usuario haya elegido antes un modo -- imagen -> fotos, `.xlsx` ->
   * archivo. Lo que no matchea ninguno de los dos se ignora en silencio
   * (mismo criterio que `seleccionarArchivo`, que ya descartaba extensiones
   * no-`.xlsx`). */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const soltados = Array.from(e.dataTransfer.files ?? []);
    const imagenes = soltados.filter((f) => f.type.startsWith('image/'));
    if (imagenes.length > 0) {
      agregarFotos(imagenes);
      return;
    }
    const archivoSoltado = soltados.find((f) => /\.xlsx?$/i.test(f.name));
    if (archivoSoltado) seleccionarArchivo(archivoSoltado);
  };

  const handleSubir = async () => {
    try {
      if (modo === 'foto') {
        if (fotos.length === 0) return;
        await subirFotos(fotos);
        return;
      }
      if (!archivo) return;
      await subir(archivo);
    } catch {
      // El error ya queda en el hook (`error`), se muestra abajo.
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent size={resultado ? 'xl' : 'md'}>
          <DialogHeader>
            <DialogTitle>Subir chequeo veterinario</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {!resultado && (
              <div className="flex items-center gap-3">
                <CapturaArchivo
                  onFotos={agregarFotos}
                  onArchivo={(files) => seleccionarArchivo(files[0])}
                  acceptArchivo=".xlsx,.xls"
                  label="Cargar chequeo"
                  labelOpcionArchivo="Subir archivo .xlsx"
                />
                {modo === 'foto' && fotos.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {fotos.length} página{fotos.length > 1 ? 's' : ''} lista{fotos.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}

            {!resultado && (
              <div
                onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  dragActive ? 'border-green-200 bg-green-50' : 'border-gray-300'
                }`}
              >
                {modo === 'excel' && archivo ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileSpreadsheet className="w-8 h-8 text-primary" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">{archivo.name}</p>
                      <p className="text-xs text-gray-500">{(archivo.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setArchivo(null)}
                      className="text-gray-400 hover:text-gray-900"
                      aria-label="Quitar archivo"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : fotos.length > 0 ? (
                  <ul className="space-y-1">
                    {fotos.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center justify-center gap-3">
                        <span className="text-sm text-gray-900">Página {i + 1}</span>
                        <span className="text-xs text-gray-500">{(f.size / 1024).toFixed(0)} KB</span>
                        <button
                          type="button"
                          onClick={() => setFotos((p) => p.filter((_, j) => j !== i))}
                          className="text-gray-400 hover:text-gray-900"
                          aria-label={`Quitar página ${i + 1}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <>
                    <Camera className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm text-gray-600">
                      Elige "Cargar chequeo" arriba, o arrastra las fotos de la planilla (o el .xlsx de respaldo) aquí.
                    </p>
                  </>
                )}
              </div>
            )}

            {avisoFotos && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {avisoFotos}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Calidad de la lectura por foto. Se muestra SIEMPRE que venga,
                antes del diff: una vaca que el OCR no encontró se vería
                idéntica a una vaca sin cambios, y ese es justo el fallo
                silencioso que el módulo prohíbe. */}
            {resultado?.ocr && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
                <p className="font-medium text-gray-900">
                  Lectura de {resultado.ocr.resumen.fotosLeidas} de {resultado.ocr.resumen.fotosRecibidas} foto(s):{' '}
                  {resultado.ocr.resumen.filasConfirmadas} de {resultado.ocr.resumen.vacasEnRoster} vacas reconocidas
                </p>

                {resultado.ocr.resumen.celdasNoConfiables > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    {resultado.ocr.resumen.celdasNoConfiables} celda(s) quedaron vacías por letra dudosa — revísalas y
                    escríbelas a mano abajo.
                  </p>
                )}

                {resultado.ocr.vacasSinLeer.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-red-700">
                      No aparecieron en ninguna foto ({resultado.ocr.vacasSinLeer.length}) — ¿falta fotografiar una
                      página?
                    </p>
                    <p className="text-xs text-gray-600">
                      {resultado.ocr.vacasSinLeer.map((v) => v.nombre ?? `#${v.numero ?? '?'}`).join(' · ')}
                    </p>
                  </div>
                )}

                {resultado.ocr.filasNoLeidas.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-red-700">
                      Filas que no se pudieron identificar ({resultado.ocr.filasNoLeidas.length}) — no se asignan a
                      ninguna vaca
                    </p>
                    <ul className="text-xs text-gray-600 space-y-1 mt-1">
                      {resultado.ocr.filasNoLeidas.map((f, i) => (
                        <li key={i}>
                          Página {f.pagina}: leyó &quot;{f.nombreImpreso ?? '—'}&quot; / #{f.numeroImpreso ?? '—'} ({f.motivo})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {resultado.ocr.paginasNoLeidas.map((p, i) => (
                  <p key={i} className="text-xs text-red-700 mt-1">{p}</p>
                ))}

                {!resultado.ocr.almacenamiento.ok && (
                  <p className="text-xs text-amber-700 mt-1">
                    Las fotos no se pudieron guardar como respaldo — puedes continuar, pero no quedará la evidencia de
                    lo que decía el papel.
                  </p>
                )}
              </div>
            )}

            {commitResultado && (
              <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  Chequeo guardado — {commitResultado.filasEscritas} fila(s), {commitResultado.eventosEscritos} evento(s)
                  {commitResultado.torosCreados > 0 && ` (${commitResultado.torosCreados} toro(s) nuevo(s) en el catálogo)`}.
                </p>
              </div>
            )}

            {errorCommit && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>{errorCommit}</p>
                </div>
                {filasRechazadas && filasRechazadas.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs list-disc">
                    {filasRechazadas.map((f) => (
                      <li key={f.fila}>
                        {f.numero != null ? `#${f.numero}` : `fila ${f.fila}`}: {f.motivo}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {resultado && !commitResultado && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fecha-chequeo">Fecha del chequeo</Label>
                    <Input
                      id="fecha-chequeo"
                      type="date"
                      value={revision.fechaChequeoTexto}
                      onChange={(e) => revision.setFechaChequeoTexto(e.target.value)}
                      disabled={comprometiendo || !puedeEscribir}
                    />
                    {revision.errorFechaChequeo ? (
                      <p className="text-xs text-red-600">{revision.errorFechaChequeo}</p>
                    ) : revision.resumenCorrecciones.fechaChequeoFijadaAMano ? (
                      <p className="text-xs text-amber-700">
                        Fijada a mano: el archivo traía {resultado.chequeoFecha ?? 'sin fecha'}. Queda registrada como
                        corrección humana en cada fila.
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500">
                        Leída del título de la hoja. La planilla se exporta con la fecha de hoy como placeholder —
                        confírmala contra el papel.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="veterinario-chequeo">Veterinario (opcional)</Label>
                    <Input
                      id="veterinario-chequeo"
                      value={veterinario}
                      onChange={(e) => setVeterinario(e.target.value)}
                      placeholder="Nombre del veterinario"
                      disabled={comprometiendo || !puedeEscribir}
                    />
                  </div>
                </div>
              </div>
            )}

            {resultado && (
              <ChequeoDiffReview
                resultado={resultado}
                revision={revision}
                editable={editable && !comprometiendo}
                motivoSoloLectura={motivoSoloLectura}
                onCrearFicha={setFilaParaFicha}
              />
            )}
          </DialogBody>
          <DialogFooter>
            {!resultado ? (
              <>
                <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={loading}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleSubir}
                  disabled={loading || (modo === 'foto' ? fotos.length === 0 : !archivo)}
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {loading
                    ? modo === 'foto'
                      ? 'Leyendo las fotos...'
                      : 'Procesando...'
                    : 'Subir y revisar'}
                </Button>
              </>
            ) : commitResultado ? (
              <Button type="button" onClick={() => handleClose(false)}>
                Cerrar
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={comprometiendo}>
                  Cerrar
                </Button>
                <Button
                  type="button"
                  onClick={handleAprobar}
                  disabled={bloqueoAprobacion !== null || comprometiendo}
                  title={bloqueoAprobacion ?? undefined}
                >
                  {comprometiendo && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {comprometiendo ? 'Aprobando...' : `Aprobar (${filasAprobables})`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alta de la ficha de una fila `nuevo`, sin salir del flujo: MISMA alta
          que `AnimalesList` (`CrearAnimalDialog` + `useCrearHatoAnimal`), solo
          pre-llenada con lo que ya trae la planilla. Al crear se vuelve a leer
          el estado del hato: eso es lo que reclasifica la fila a escribible --
          el commit rechaza `nuevo` siempre, por diseño. Va como HERMANO del
          diálogo de subida (no dentro de su `Dialog`), que es la forma en que
          Radix apila dos modales sin que cerrar el de arriba cierre el de
          abajo. */}
      <CrearAnimalDialog
        open={filaParaFicha !== null}
        onOpenChange={(abierto) => { if (!abierto) setFilaParaFicha(null); }}
        prellenado={{
          numero: filaParaFicha?.numero ?? null,
          nombre: filaParaFicha?.nombre ?? null,
          // Una fila del chequeo describe una vaca adulta (la planilla lista
          // solo el hato, decisión D-A) -- se puede cambiar en el formulario.
          etapa: 'vaca',
        }}
        onCreado={() => {
          setFilaParaFicha(null);
          revision.recargarEstado();
        }}
      />
    </>
  );
}
