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
//
// UI rework de Producción (2026-08-06, `PesajeLecheCard.tsx`): además de la
// ruta foto, este diálogo abre en un MODO MANUAL (`modoInicial='manual'`) --
// salta la subida y arranca directo en la grilla en blanco
// (`useSubirPesajeFoto.iniciarManual`, ver `pesajeManual.ts`), sin llamar al
// OCR. Decisión del dueño: "RevisionPesajeFoto ya tiene celdas editables,
// así que la revisión post-OCR es captura manual" -- se reutiliza la MISMA
// grilla en vez de escribir una segunda UI de captura. `fotosIniciales`
// sigue el mismo patrón que `SubirChequeoExcel.tsx` (`ChequeosList.tsx` ya
// lo hace para el chequeo): la tarjeta exterior elige "Tomar foto"/"Subir
// archivo" y pasa la selección ya hecha, este diálogo solo la pre-carga.

import { useState, useEffect } from 'react';
import { Camera, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useSubirPesajeFoto } from '../hooks/useSubirPesajeFoto';
import type { CeldaParaCommit } from '../hooks/useSubirPesajeFoto';
import { useProduccionHato } from '../hooks/useProduccionHato';
import { RevisionPesajeFoto, claveCeldaPesaje, type CeldaEditablePesaje } from './RevisionPesajeFoto';
import { CapturaArchivo } from './CapturaArchivo';
import { fechasPorSemanaDelMes } from '@/utils/hato/exportarPlanillaPesaje';
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
  modoInicial = 'foto',
  fotosIniciales,
  onCompletado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anioInicial: number;
  mesInicial: number;
  /** 'manual' salta la subida de fotos: arranca directo en la grilla en
   * blanco, sin llamar al OCR (ver cabecera del archivo). */
  modoInicial?: 'foto' | 'manual';
  /** Selección ya hecha por el disparador exterior (`PesajeLecheCard.tsx`,
   * mismo patrón que `SubirChequeoExcel.tsx`): si viene con contenido, el
   * diálogo abre con esas páginas ya en la lista, listas para "Subir y
   * revisar". */
  fotosIniciales?: File[];
  onCompletado?: () => void;
}) {
  const { subirFotos, iniciarManual, comprometer, limpiar, loading, error, resultado, comprometiendo, errorCommit, commitResultado } =
    useSubirPesajeFoto();
  const produccion = useProduccionHato();
  const { profile } = useAuth();
  // Mismo conjunto de roles que la RLS de escritura de `hato_*` (migración 053).
  const puedeEscribir = profile?.rol === 'Administrador' || profile?.rol === 'Gerencia';

  const [fotos, setFotos] = useState<File[]>([]);
  const [avisoFotos, setAvisoFotos] = useState<string | null>(null);
  const [valores, setValores] = useState<Map<string, CeldaEditablePesaje>>(new Map());

  // Mes editable DENTRO del diálogo -- arranca en lo que trae la tarjeta
  // (`anioInicial`/`mesInicial`, normalmente el mes actual) pero se puede
  // corregir antes de subir/empezar (p. ej. un backlog de un mes anterior),
  // sin necesitar un selector permanente en la tarjeta pequeña.
  const [mesSeleccionado, setMesSeleccionado] = useState(() => `${anioInicial}-${String(mesInicial).padStart(2, '0')}`);
  const [cargandoManual, setCargandoManual] = useState(false);
  const [errorManual, setErrorManual] = useState<string | null>(null);

  const [anioTexto, mesTexto] = mesSeleccionado.split('-');
  const anioSel = parseInt(anioTexto, 10);
  const mesSel = parseInt(mesTexto, 10);
  const mesValido = Number.isInteger(anioSel) && Number.isInteger(mesSel) && mesSel >= 1 && mesSel <= 12;

  const titulo = modoInicial === 'manual' ? 'Ingresar pesaje a mano' : 'Cargar pesaje mensual por foto';

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFotos([]);
      setAvisoFotos(null);
      setValores(new Map());
      setErrorManual(null);
      limpiar();
      onCompletado?.();
    }
    onOpenChange(nextOpen);
  };

  // Se siembra UNA vez por apertura (mismo patrón que `SubirChequeoExcel.tsx`
  // -- nunca en cada render, o reabrir con el mismo `open` re-agregaría las
  // mismas fotos): reinicia el mes al que trae la tarjeta y precarga la
  // selección de foto/archivo ya hecha afuera, si vino con algo.
  useEffect(() => {
    if (!open) return;
    setMesSeleccionado(`${anioInicial}-${String(mesInicial).padStart(2, '0')}`);
    setErrorManual(null);
    if (fotosIniciales && fotosIniciales.length > 0) {
      setFotos((previas) => {
        const total = [...previas, ...fotosIniciales];
        if (total.length > MAX_FOTOS) {
          setAvisoFotos(`Solo se envían las primeras ${MAX_FOTOS} fotos; descarta alguna si necesitas otra.`);
          return total.slice(0, MAX_FOTOS);
        }
        return total;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleComenzarManual = async () => {
    if (!mesValido) return;
    setCargandoManual(true);
    setErrorManual(null);
    try {
      const [config, vacas] = await Promise.all([produccion.fetchDiaPesajeSemanal(), produccion.fetchRosterPesaje()]);
      const fechasPorSemana = fechasPorSemanaDelMes(anioSel, mesSel, config.iso);
      // Misma regla que `PesajeLecheCard.tsx`/`construirRosterPlanilla`: una
      // vaca activa sin nombre no puede anclar una fila (D-1, el nombre ES
      // la identidad de esta planilla) -- se excluye, nunca se imprime en blanco.
      const animales = vacas.filter((v): v is typeof v & { nombre: string } => Boolean(v.nombre?.trim()));
      iniciarManual(anioSel, mesSel, animales, fechasPorSemana);
    } catch (err) {
      setErrorManual(err instanceof Error ? err.message : 'No se pudo preparar la grilla de pesaje.');
    } finally {
      setCargandoManual(false);
    }
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
    if (fotos.length === 0 || !mesValido) return;
    try {
      const resp = await subirFotos(fotos, anioSel, mesSel);
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
      await comprometer(celdasParaCommit, resultado?.anio ?? anioSel, resultado?.mes ?? mesSel);
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
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {!resultado && (
            <div className="space-y-1.5">
              <Label htmlFor="mes-pesaje-dialogo">Mes</Label>
              <Input
                id="mes-pesaje-dialogo"
                type="month"
                value={mesSeleccionado}
                onChange={(e) => setMesSeleccionado(e.target.value)}
                className="w-auto"
                disabled={loading || cargandoManual}
              />
            </div>
          )}

          {!resultado && modoInicial === 'manual' && (
            <p className="text-sm text-gray-600">
              Vas a digitar los pesajes de este mes directamente, sin foto -- vacía por defecto, corrige el mes arriba si no es el correcto.
            </p>
          )}

          {!resultado && modoInicial !== 'manual' && (
            <>
              <div className="flex items-center gap-3">
                <CapturaArchivo
                  onFotos={agregarFotos}
                  onArchivo={agregarFotos}
                  acceptArchivo="image/*"
                  label="Cargar planilla"
                  labelOpcionArchivo="Subir imagen"
                  // La planilla cabe en UNA hoja, pero se fotografía por
                  // partes (35 filas en una toma salen ilegibles para el
                  // modelo). Sin esto, el selector de la galería deja elegir
                  // UNA sola imagen y la segunda mitad no hay cómo subirla
                  // salvo repitiendo la operación.
                  multipleArchivo
                />
                {fotos.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {fotos.length} foto{fotos.length > 1 ? 's' : ''} lista{fotos.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {fotos.length > 0 && (
                <ul className="space-y-1">
                  {fotos.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2">
                      <span className="text-sm text-gray-900">Foto {i + 1}</span>
                      <span className="text-xs text-gray-500">{(f.size / 1024).toFixed(0)} KB</span>
                      <button
                        type="button"
                        onClick={() => setFotos((p) => p.filter((_, j) => j !== i))}
                        className="ml-auto text-gray-400 hover:text-gray-900"
                        aria-label={`Quitar foto ${i + 1}`}
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
                  <p className="mt-1 text-xs text-gray-500">
                    Puedes subir varias: por ejemplo la mitad de arriba y la de abajo. Si una vaca sale en las dos, el
                    sistema lo detecta.
                  </p>
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

          {errorManual && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {errorManual}
            </div>
          )}

          {/* Se oculta en modo manual: `ocr.resumen.fotosRecibidas` queda en
              0 a propósito (`useSubirPesajeFoto.iniciarManual`) -- no hubo
              ninguna foto que resumir. */}
          {resultado?.ocr && resultado.ocr.resumen.fotosRecibidas > 0 && (
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
          {!resultado && modoInicial === 'manual' ? (
            <>
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={cargandoManual}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleComenzarManual} disabled={cargandoManual || !mesValido}>
                {cargandoManual && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {cargandoManual ? 'Preparando...' : 'Comenzar'}
              </Button>
            </>
          ) : !resultado ? (
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
