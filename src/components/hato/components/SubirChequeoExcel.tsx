// ARCHIVO: components/hato/components/SubirChequeoExcel.tsx
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

import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useSubirChequeoExcel } from '../hooks/useSubirChequeoExcel';
import { useRevisionChequeo } from '../hooks/useRevisionChequeo';
import { ChequeoDiffReview } from './ChequeoDiffReview';
import { CrearAnimalDialog } from './CrearAnimalDialog';
import type { FilaDiffChequeo } from '@/utils/importHato/diffChequeo';

export function SubirChequeoExcel({
  open,
  onOpenChange,
  onCompletado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompletado?: () => void;
}) {
  const {
    subir,
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
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setArchivo(null);
      setVeterinario('');
      setFilaParaFicha(null);
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
    setArchivo(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) seleccionarArchivo(file);
  };

  const handleSubir = async () => {
    if (!archivo) return;
    try {
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
              <div
                onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  dragActive ? 'border-green-200 bg-green-50' : 'border-gray-300'
                }`}
              >
                {!archivo ? (
                  <>
                    <Upload className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm text-gray-600 mb-3">Arrastra el .xlsx del chequeo aquí o selecciónalo</p>
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) seleccionarArchivo(file);
                      }}
                    />
                    <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                      Seleccionar archivo
                    </Button>
                  </>
                ) : (
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
                )}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
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
                <Button type="button" onClick={handleSubir} disabled={!archivo || loading}>
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {loading ? 'Procesando...' : 'Subir y revisar'}
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
