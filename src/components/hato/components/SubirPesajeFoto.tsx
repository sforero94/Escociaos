// ARCHIVO: components/hato/components/SubirPesajeFoto.tsx
// DESCRIPCIÓN: S5 de `docs/plan_hato_ronda_agosto_2026.md` -- diálogo que
// sube 1..6 fotos de la planilla MENSUAL de pesaje ya diligenciada, muestra
// el diff por (vaca, semana) (`RevisionPesajeFoto`) y aprueba lo confirmado
// (posiblemente corregido a mano, D-6) contra `POST /hato/pesaje/commit`.
//
// Gemelo, simplificado, de `SubirChequeoExcel.tsx`: sin ruta `.xlsx`
// alterna (D-8, esta planilla siempre entra por foto/imagen -- "archivo" es
// otra FUENTE de la misma foto, no otro formato, mismo patrón que
// `ProduccionQuincenalForm.tsx` usa para la liquidación de El Pomar).
// `anio`/`mes` son REQUERIDOS antes de subir: sin ellos el servidor no
// puede resolver a qué fecha corresponde cada columna de semana.

import { useState } from 'react';
import { Camera, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useSubirPesajeFoto } from '../hooks/useSubirPesajeFoto';
import type { CeldaParaCommit } from '../hooks/useSubirPesajeFoto';
import { RevisionPesajeFoto, claveCeldaPesaje, type CeldaEditablePesaje } from './RevisionPesajeFoto';
import { CapturaArchivo } from './CapturaArchivo';
import { SEMANAS_PESAJE, type CeldaDiffPesaje } from '@/utils/importHato/ocrPesaje';

const MAX_FOTOS = 6; // mismo tope que valida el servidor (hato-pesaje-foto.ts).

/** Construye el estado editable inicial a partir del diff -- una entrada
 * por (vaca, semana) con fecha real, arrancando en lo que leyó el OCR.
 * `undefined` (no `null`) porque `NumberInput` espera esa forma para
 * mostrar el placeholder en vez de un 0. */
function valoresIniciales(diff: CeldaDiffPesaje[]): Map<string, CeldaEditablePesaje> {
  const mapa = new Map<string, CeldaEditablePesaje>();
  for (const celda of diff) {
    mapa.set(claveCeldaPesaje(celda.animalId, celda.semana), {
      litrosAm: celda.litrosAm ?? undefined,
      litrosPm: celda.litrosPm ?? undefined,
      noConfiable: celda.noConfiable,
    });
  }
  return mapa;
}

export function SubirPesajeFoto({
  open,
  onOpenChange,
  anioInicial,
  mesInicial,
  onCompletado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anioInicial: number;
  mesInicial: number;
  onCompletado?: () => void;
}) {
  const { subirFotos, comprometer, limpiar, loading, error, resultado, comprometiendo, errorCommit, commitResultado } =
    useSubirPesajeFoto();
  const { profile } = useAuth();
  // Mismo conjunto de roles que la RLS de escritura de `hato_*` (migración 053).
  const puedeEscribir = profile?.rol === 'Administrador' || profile?.rol === 'Gerencia';

  const [fotos, setFotos] = useState<File[]>([]);
  const [avisoFotos, setAvisoFotos] = useState<string | null>(null);
  const [valores, setValores] = useState<Map<string, CeldaEditablePesaje>>(new Map());

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFotos([]);
      setAvisoFotos(null);
      setValores(new Map());
      limpiar();
      onCompletado?.();
    }
    onOpenChange(nextOpen);
  };

  const agregarFotos = (nuevas: File[]) => {
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

  const handleSubir = async () => {
    if (fotos.length === 0) return;
    try {
      const resp = await subirFotos(fotos, anioInicial, mesInicial);
      setValores(valoresIniciales(resp.diff));
    } catch {
      // El error ya queda en el hook (`error`), se muestra abajo.
    }
  };

  const handleEditarCelda = (animalId: string, semana: (typeof SEMANAS_PESAJE)[number], campo: 'am' | 'pm', valor: number | undefined) => {
    setValores((prev) => {
      const clave = claveCeldaPesaje(animalId, semana);
      const actual = prev.get(clave) ?? { litrosAm: undefined, litrosPm: undefined, noConfiable: false };
      const siguiente = new Map(prev);
      siguiente.set(clave, { ...actual, [campo === 'am' ? 'litrosAm' : 'litrosPm']: valor });
      return siguiente;
    });
  };

  const celdasParaCommit: CeldaParaCommit[] = resultado
    ? resultado.diff
        .map((c) => {
          const editado = valores.get(claveCeldaPesaje(c.animalId, c.semana));
          return {
            animalId: c.animalId,
            fecha: c.fecha,
            litrosAm: editado?.litrosAm ?? null,
            litrosPm: editado?.litrosPm ?? null,
          };
        })
        .filter((c) => c.litrosAm !== null || c.litrosPm !== null)
    : [];

  const handleAprobar = async () => {
    if (celdasParaCommit.length === 0) return;
    try {
      await comprometer(celdasParaCommit, anioInicial, mesInicial);
    } catch {
      // El error/las celdas rechazadas ya quedan en el hook, se muestran abajo.
    }
  };

  const motivoSoloLectura = !puedeEscribir
    ? 'Tu rol puede revisar el pesaje pero no aprobarlo: escribir en el Hato Lechero requiere Administrador o Gerencia.'
    : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size={resultado ? 'xl' : 'md'}>
        <DialogHeader>
          <DialogTitle>Cargar pesaje mensual por foto</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {!resultado && (
            <>
              <div className="flex items-center gap-3">
                <CapturaArchivo
                  onFotos={agregarFotos}
                  onArchivo={agregarFotos}
                  acceptArchivo="image/*"
                  label="Cargar planilla"
                  labelOpcionArchivo="Subir imagen"
                />
                {fotos.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {fotos.length} página{fotos.length > 1 ? 's' : ''} lista{fotos.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {fotos.length > 0 && (
                <ul className="space-y-1">
                  {fotos.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2">
                      <span className="text-sm text-gray-900">Página {i + 1}</span>
                      <span className="text-xs text-gray-500">{(f.size / 1024).toFixed(0)} KB</span>
                      <button
                        type="button"
                        onClick={() => setFotos((p) => p.filter((_, j) => j !== i))}
                        className="ml-auto text-gray-400 hover:text-gray-900"
                        aria-label={`Quitar página ${i + 1}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {fotos.length === 0 && (
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
                  <Camera className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-600">Elige &quot;Cargar planilla&quot; arriba para tomar o subir las fotos.</p>
                </div>
              )}
            </>
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

          {resultado?.ocr && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <p className="font-medium text-gray-900">
                Lectura de {resultado.ocr.resumen.fotosLeidas} de {resultado.ocr.resumen.fotosRecibidas} foto(s):{' '}
                {resultado.ocr.resumen.filasConfirmadas} de {resultado.ocr.resumen.vacasEnRoster} vacas reconocidas
              </p>
              {resultado.ocr.resumen.celdasNoConfiables > 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  {resultado.ocr.resumen.celdasNoConfiables} celda(s) quedaron marcadas con letra dudosa (⚠) — revísalas abajo.
                </p>
              )}
              {resultado.ocr.paginasNoLeidas.map((p, i) => (
                <p key={i} className="text-xs text-red-700 mt-1">{p}</p>
              ))}
              {!resultado.ocr.almacenamiento.ok && (
                <p className="text-xs text-amber-700 mt-1">
                  Las fotos no se pudieron guardar como respaldo — puedes continuar, pero no quedará la evidencia de lo que decía el papel.
                </p>
              )}
            </div>
          )}

          {commitResultado && (
            <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                Pesaje guardado — {commitResultado.guardados} celda(s) ({commitResultado.creados} nueva(s),{' '}
                {commitResultado.actualizados} actualizada(s)).
                {commitResultado.celdasRechazadas.length > 0 &&
                  ` ${commitResultado.celdasRechazadas.length} celda(s) se rechazaron: el hato cambió desde la vista previa.`}
              </p>
            </div>
          )}

          {errorCommit && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>{errorCommit}</p>
              </div>
            </div>
          )}

          {motivoSoloLectura && resultado && (
            <p className="text-xs text-gray-500">{motivoSoloLectura}</p>
          )}

          {resultado && !commitResultado && (
            <RevisionPesajeFoto
              resultado={resultado}
              valores={valores}
              onEditarCelda={handleEditarCelda}
              editable={puedeEscribir && !comprometiendo}
            />
          )}
        </DialogBody>
        <DialogFooter>
          {!resultado ? (
            <>
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleSubir} disabled={loading || fotos.length === 0}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {loading ? 'Leyendo las fotos...' : 'Subir y revisar'}
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
                disabled={!puedeEscribir || comprometiendo || celdasParaCommit.length === 0}
                title={motivoSoloLectura ?? undefined}
              >
                {comprometiendo && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {comprometiendo ? 'Guardando...' : `Aprobar (${celdasParaCommit.length})`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
