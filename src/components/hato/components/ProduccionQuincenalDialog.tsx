import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, Save, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatNumber, formatShortDate, formatCurrency } from '@/utils/format';
import { resolverQuincena, rangoQuincena, calcularProductividad } from '@/utils/calculosHato';
import {
  calcularPrecioUnitarioQuincena,
  calcularPrecioBrutoLitro,
  calcularNetoConIca,
  aplicaRetencionIcaLeche,
} from '@/utils/hatoProduccion';
import { useProduccionHato, type HatoProduccionQuincenalConIngreso } from '../hooks/useProduccionHato';
import { useFinCatalogosVenta } from '../hooks/useFinCatalogosVenta';
import { useOcrLiquidacionPomar } from '../hooks/useOcrLiquidacionPomar';
import { CapturaArchivo } from './CapturaArchivo';
import { obtenerFechaHoy } from '@/utils/fechas';

// Defaults del dueño para la venta quincenal a El Pomar (D-8,
// docs/plan_hato_ronda_agosto_2026.md §4 S4) -- resueltos por NOMBRE contra
// los catálogos ya cargados (`fin_compradores`/`fin_medios_pago`/
// `fin_regiones`), nunca un id hardcodeado. Si el catálogo no tiene el
// nombre esperado, se REPORTA (toast) y el campo queda para elegir a mano
// -- nunca se crea la fila del catálogo en silencio.
const COMPRADOR_DEFAULT = 'El Pomar';
const MEDIO_PAGO_DEFAULT = 'Cuenta Fovemsa';
const REGION_DEFAULT = 'Subachoque';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// `obtenerFechaHoy()` -- NUNCA `new Date().toISOString().slice(0, 10)`, que
// es UTC y ya es "mañana" en Bogotá después de las 19:00.
const hoyIso = () => obtenerFechaHoy();

export interface ProduccionQuincenalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** Selección ya hecha por el disparador exterior (`VentaQuincenalCard.tsx`,
   * mismo patrón que `SubirChequeoExcel.tsx`/`SubirPesajeFoto.tsx`): si
   * viene con contenido, el OCR de la liquidación corre solo, sin que el
   * usuario tenga que volver a elegir "Cargar factura" dentro del
   * diálogo. */
  fotosIniciales?: File[];
}

/**
 * Producción quincenal — litros al camión por quincena (V3/D2), enlazada
 * 1:1 con su `fin_ingresos` (migración 070, RPC `fn_hato_guardar_quincena_
 * venta` — plan `docs/plan_hato_produccion_rework.md` §3/§6 SOW 3). Dato
 * distinto del pesaje semanal por vaca — ninguno de los dos alimenta al
 * otro (decisión del dueño, segunda ronda 2026-07-22).
 *
 * "Registro único" (plan §2.0): esta tarjeta captura EN UN SOLO guardado
 * los litros/vacas de Producción Y el valor/comprador/medio de pago del
 * ingreso — una sola escritura atómica vía `.rpc()`, nunca dos INSERT/
 * UPDATE sueltos. La fecha del ingreso (pago del Pomar) es un hecho
 * DISTINTO del periodo de producción (año/mes/quincena) — el Pomar paga
 * después de que cierra la quincena, así que no se valida una contra la
 * otra (ver la migración 070 para el detalle completo).
 *
 * Una quincena `origen_dato='derivado_mensual'` (backfill, SOW 4) es
 * read-only aquí: el RPC la rechaza explícitamente, así que el formulario
 * ni siquiera intenta editarla — se corrige desde `/finanzas/ingresos`.
 *
 * UI rework de Producción (2026-08-06): antes vivía siempre visible e
 * inline en la pestaña Registrar; ahora es un diálogo que `VentaQuincenalCard`
 * mantiene SIEMPRE montado (mismo patrón que `SubirChequeoExcel.tsx`) y
 * abre/cierra vía `open`/`onOpenChange` -- los refs frágiles de más abajo
 * (`ocrPendiente`, `defaultsIngresoRef`) NUNCA se recrean al abrir/cerrar el
 * diálogo porque el componente no se desmonta con él, solo con la pestaña.
 */
export function ProduccionQuincenalDialog({ open, onOpenChange, onSaved, fotosIniciales }: ProduccionQuincenalDialogProps) {
  const hook = useProduccionHato();
  const catalogos = useFinCatalogosVenta();
  const ocr = useOcrLiquidacionPomar();

  const inicial = resolverQuincena(hoyIso());
  const [anio, setAnio] = useState(inicial.anio);
  const [mes, setMes] = useState(inicial.mes);
  const [quincena, setQuincena] = useState<1 | 2>(inicial.quincena);

  const [registroId, setRegistroId] = useState<string | null>(null);
  const [origenDato, setOrigenDato] = useState<HatoProduccionQuincenalConIngreso['origen_dato'] | null>(null);
  const [litrosTotal, setLitrosTotal] = useState<number | undefined>(undefined);
  const [litrosPomar, setLitrosPomar] = useState<number | undefined>(undefined);
  const [numVacasOrdeno, setNumVacasOrdeno] = useState<number | undefined>(undefined);
  const [notas, setNotas] = useState('');

  // Campos del `fin_ingresos` enlazado — NOT NULL en la tabla (CLAUDE.md R5)
  // salvo comprador. `fechaIngreso` es la fecha de PAGO del Pomar, no el
  // periodo de producción — se captura por separado a propósito. Default =
  // fecha de carga (decisión del dueño, D-8/S4).
  const [fechaIngreso, setFechaIngreso] = useState(hoyIso());
  // Bruto de la liquidación (D-11) -- el neto/ICA se calculan, nunca se
  // capturan directamente. Antes de la migración 085 este campo se llamaba
  // "valor" y era el neto capturado a mano; ver hatoProduccion.ts.
  const [valorBruto, setValorBruto] = useState<number | undefined>(undefined);
  const [regionId, setRegionId] = useState('');
  const [medioPagoId, setMedioPagoId] = useState('');
  const [compradorId, setCompradorId] = useState('');

  // Retención de ICA (D-11) -- SIEMPRE leída en vivo de `hato_config`,
  // nunca hardcodeada. Solo alimenta el PREVIEW antes de guardar; el valor
  // que se persiste sale del RPC, que lee la misma clave en el servidor.
  const [retencionIca, setRetencionIca] = useState<number | null>(null);
  const [retencionIcaError, setRetencionIcaError] = useState<string | null>(null);

  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [confirmEliminarOpen, setConfirmEliminarOpen] = useState(false);
  const [historial, setHistorial] = useState<HatoProduccionQuincenalConIngreso[]>([]);

  const rango = rangoQuincena(anio, mes, quincena);
  const soloLectura = origenDato === 'derivado_mensual';

  // Defaults del dueño ya resueltos a id, mantenidos en una referencia para
  // que `resetIngreso` los pueda leer sin capturarlos en un cierre viejo
  // (`cargarRegistro` tiene sus dependencias fijadas a mano en
  // [anio, mes, quincena]). Se rellenan en el efecto de más abajo.
  const defaultsIngresoRef = useRef<{ compradorId: string; medioPagoId: string; regionId: string }>({
    compradorId: '',
    medioPagoId: '',
    regionId: '',
  });

  // Limpiar el bloque financiero al cambiar de periodo NO significa dejarlo
  // en blanco: la venta quincenal siempre es a El Pomar, por Cuenta Fovemsa y
  // en Subachoque. Antes esto vaciaba los tres campos y los defaults solo se
  // aplicaban una vez al montar, así que después de la primera navegación
  // había que volver a elegirlos a mano en cada quincena.
  const resetIngreso = () => {
    setFechaIngreso(hoyIso());
    setValorBruto(undefined);
    setRegionId(defaultsIngresoRef.current.regionId);
    setMedioPagoId(defaultsIngresoRef.current.medioPagoId);
    setCompradorId(defaultsIngresoRef.current.compradorId);
  };

  // Retención de ICA -- una sola vez al montar (no depende del periodo
  // seleccionado, es una tasa global de hato_config).
  useEffect(() => {
    hook
      .fetchRetencionIcaLeche()
      .then(setRetencionIca)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        setRetencionIcaError(msg);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Defaults del dueño (comprador/medio de pago/región) -- SOLO para un
  // registro NUEVO (nunca pisa lo que ya está guardado ni lo que Gerencia
  // ya haya elegido a mano) y solo una vez que los catálogos cargaron.
  // Resueltos por NOMBRE; si un nombre no existe en el catálogo, se
  // reporta (nunca se crea en silencio) y ese campo queda vacío para
  // elegir a mano.
  const defaultsAvisados = useRef(false);
  useEffect(() => {
    if (catalogos.loading) return;

    const porNombre = <T extends { id: string; nombre: string }>(lista: T[], nombre: string) =>
      lista.find((x) => x.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());

    const faltantes: string[] = [];
    const comprador = porNombre(catalogos.compradores, COMPRADOR_DEFAULT);
    if (!comprador) faltantes.push(`comprador "${COMPRADOR_DEFAULT}"`);
    const medioPago = porNombre(catalogos.mediosPago, MEDIO_PAGO_DEFAULT);
    if (!medioPago) faltantes.push(`medio de pago "${MEDIO_PAGO_DEFAULT}"`);
    const region = porNombre(catalogos.regiones, REGION_DEFAULT);
    if (!region) faltantes.push(`región "${REGION_DEFAULT}"`);

    // La referencia se mantiene fresca siempre: es la que `resetIngreso` lee
    // en cada cambio de periodo.
    defaultsIngresoRef.current = {
      compradorId: comprador?.id ?? '',
      medioPagoId: medioPago?.id ?? '',
      regionId: region?.id ?? '',
    };

    // Aplicar sobre un registro NUEVO y solo donde el usuario no haya elegido
    // ya algo a mano (`prev ||`). Nunca pisa lo que se cargó de un registro
    // existente.
    if (!registroId) {
      if (comprador) setCompradorId((prev) => prev || comprador.id);
      if (medioPago) setMedioPagoId((prev) => prev || medioPago.id);
      if (region) setRegionId((prev) => prev || region.id);
    }

    // El aviso de catálogo incompleto se da UNA vez por sesión del
    // formulario: el efecto ahora corre en cada cambio de periodo y repetirlo
    // sería ruido.
    if (faltantes.length > 0 && !defaultsAvisados.current) {
      defaultsAvisados.current = true;
      toast.warning(`No se encontraron en el catálogo: ${faltantes.join(', ')} -- selecciónalos a mano.`);
    }
  }, [catalogos.loading, catalogos.compradores, catalogos.mediosPago, catalogos.regiones, registroId]);

  // Valores leídos por OCR que todavía no se pueden escribir en el formulario.
  //
  // El problema que resuelve: `cargarRegistro` se re-dispara cada vez que
  // cambian anio/mes/quincena, y para un periodo que aún no existe en la base
  // limpia litros y el bloque financiero. Como leer una liquidación SIEMPRE
  // cambia el periodo (es justo el dato que trae el papel), las tres llamadas
  // del OCR entraban en el mismo lote de render y la recarga posterior --
  // asíncrona, y por lo tanto siempre después -- borraba lo recién escrito.
  // El síntoma era exacto: el aviso de "liquidación leída" salía y los campos
  // quedaban vacíos.
  //
  // La solución NO es dejar de limpiar al cambiar de periodo: eso es correcto
  // y evita que los valores de una quincena se filtren a otra cuando el
  // usuario navega a mano. Lo que se hace es dejar la lectura en espera y
  // aplicarla DESPUÉS de que la recarga del periodo destino termine.
  const ocrPendiente = useRef<{
    anio: number;
    mes: number;
    quincena: 1 | 2;
    litros: number | null;
    bruto: number | null;
    fechaPago: string | null;
  } | null>(null);

  const cargarRegistro = useCallback(async () => {
    setCargando(true);
    try {
      const existente = await hook.fetchQuincena(anio, mes, quincena);
      if (existente) {
        setRegistroId(existente.id);
        setOrigenDato(existente.origen_dato);
        setLitrosTotal(existente.litros_total ?? undefined);
        setLitrosPomar(existente.litros_pomar_confirmado ?? undefined);
        setNumVacasOrdeno(existente.num_vacas_ordeno ?? undefined);
        setNotas(existente.notas ?? '');
        if (existente.finIngreso) {
          setFechaIngreso(existente.finIngreso.fecha);
          // El bruto no se guarda directo -- se reconstruye desde
          // precio_bruto_litro × litros (migración 085). Una fila 'medido'
          // guardada por este RPC SIEMPRE trae precio_bruto_litro; el
          // fallback al neto es defensivo (fila teórica sin esa columna).
          const litros = existente.litros_total;
          const brutoReconstruido =
            existente.precio_bruto_litro != null && litros != null
              ? existente.precio_bruto_litro * litros
              : existente.finIngreso.valor;
          setValorBruto(brutoReconstruido);
          setRegionId(existente.finIngreso.region_id);
          setMedioPagoId(existente.finIngreso.medio_pago_id);
          setCompradorId(existente.finIngreso.comprador_id ?? '');
        } else {
          // El embed no llegó (RLS u otro motivo) -- el registro existe
          // pero no se puede prellenar el lado financiero; deja el
          // formulario en blanco en vez de fingir datos.
          resetIngreso();
        }
      } else {
        setRegistroId(null);
        setOrigenDato(null);
        setLitrosTotal(undefined);
        setLitrosPomar(undefined);
        setNumVacasOrdeno(undefined);
        setNotas('');
        resetIngreso();
      }

      // Aplicación de la lectura OCR en espera -- va DESPUÉS de la limpieza
      // (o de la carga del registro existente), que es exactamente lo que el
      // orden anterior no garantizaba. Solo se aplica si la lectura es para
      // ESTE periodo: si el usuario ya navegó a otro mientras el OCR corría,
      // se descarta en vez de contaminar una quincena que no le corresponde.
      const pendiente = ocrPendiente.current;
      if (pendiente && pendiente.anio === anio && pendiente.mes === mes && pendiente.quincena === quincena) {
        ocrPendiente.current = null;
        if (existente?.origen_dato === 'derivado_mensual') {
          // Fila de backfill: es de solo lectura y el RPC rechaza editarla.
          // Escribir aquí los valores del papel daría la impresión de que se
          // pueden guardar, y no se pueden.
          toast.warning(
            'Esa quincena es un registro derivado del histórico mensual y es de solo lectura -- la liquidación no se aplicó.',
          );
        } else {
          if (pendiente.litros != null) {
            setLitrosTotal(pendiente.litros);
            // La liquidación LA EMITE El Pomar: su "cantidad" es, por
            // definición, el litraje que el Pomar confirma. Capturarlo dos
            // veces a mano invitaría a que los dos números se separen.
            setLitrosPomar(pendiente.litros);
          }
          if (pendiente.bruto != null) setValorBruto(pendiente.bruto);
          if (pendiente.fechaPago) setFechaIngreso(pendiente.fechaPago);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Error cargando quincena: ${msg}`);
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, mes, quincena]);

  const cargarHistorial = useCallback(async () => {
    try {
      setHistorial(await hook.fetchHistorialQuincenal(8));
    } catch (err: unknown) {
      console.error('Error cargando historial de producción quincenal:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargarRegistro();
  }, [cargarRegistro]);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  const handleGuardar = async () => {
    if (soloLectura) return;
    if (litrosTotal === undefined || litrosTotal === null) {
      toast.error('Ingresa los litros totales de la quincena');
      return;
    }
    if (!valorBruto || valorBruto <= 0) {
      toast.error('Ingresa el valor bruto de la liquidación');
      return;
    }
    if (!regionId) {
      toast.error('Selecciona una región');
      return;
    }
    if (!medioPagoId) {
      toast.error('Selecciona un medio de pago');
      return;
    }

    setGuardando(true);
    try {
      const resultado = await hook.guardarQuincena({
        quincenaId: registroId,
        anio,
        mes,
        quincena,
        fechaInicio: rango.fechaInicio,
        fechaFin: rango.fechaFin,
        litrosTotal,
        litrosPomarConfirmado: litrosPomar ?? null,
        numVacasOrdeno: numVacasOrdeno ?? null,
        notas: notas.trim() || null,
        finIngreso: {
          fecha: fechaIngreso,
          valorBruto,
          regionId,
          medioPagoId,
          compradorId: compradorId || null,
          nombre: null,
        },
      });
      // El toast confirma lo que el SERVIDOR calculó (RPC, migración 085),
      // nunca el preview del cliente -- son dos cálculos independientes
      // que deben coincidir, pero solo uno de los dos persiste.
      const mensajeIca = resultado.icaAplicada
        ? ` (ICA retenida: ${formatCurrency(resultado.ica)}, neto: ${formatCurrency(resultado.neto)})`
        : ' (sin retención de ICA -- periodo anterior a julio 2026)';
      toast.success(`${registroId ? 'Quincena actualizada' : 'Quincena registrada'}${mensajeIca}`);
      await Promise.all([cargarRegistro(), cargarHistorial()]);
      onSaved?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate') || msg.includes('23505')) {
        toast.error('Ya existe un registro para esa quincena — recarga la página');
      } else {
        toast.error(`Error al guardar: ${msg}`);
      }
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async () => {
    if (!registroId) return;
    setEliminando(true);
    try {
      await hook.eliminarQuincena(registroId);
      toast.success('Quincena eliminada (junto con su ingreso enlazado)');
      await Promise.all([cargarRegistro(), cargarHistorial()]);
      onSaved?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Error al eliminar: ${msg}`);
    } finally {
      setEliminando(false);
      setConfirmEliminarOpen(false);
    }
  };

  const handleOcrLeido = useCallback(
    async (archivos: File[]) => {
      try {
        const respuesta = await ocr.leerArchivos(archivos);
        const doc = respuesta.documento;

        const anioDetectado = doc.periodoInicio?.slice(0, 4) ?? doc.periodoFin?.slice(0, 4) ?? null;
        const anioDestino = anioDetectado ? parseInt(anioDetectado, 10) : anio;
        const mesDestino = doc.mes ?? mes;
        const quincenaDestino = doc.quincena ?? quincena;

        // Preferimos el subtotal leído (es el bruto real de la
        // liquidación); si el modelo no lo pudo leer pero sí precio y
        // cantidad, lo derivamos -- nunca al revés (el subtotal impreso es
        // el dato de la fila, precio×cantidad es una reconstrucción).
        const brutoLeido =
          doc.subtotal ??
          (doc.precioPromedioLitro != null && doc.cantidadLitros != null
            ? doc.precioPromedioLitro * doc.cantidadLitros
            : null);

        // Los valores NO se escriben aquí: cambiar el periodo dispara la
        // recarga, que limpia el formulario y borraría lo que se escriba en
        // este mismo lote. Quedan en espera y `cargarRegistro` los aplica
        // cuando termina de cargar el periodo destino. Ver el comentario de
        // `ocrPendiente`.
        ocrPendiente.current = {
          anio: anioDestino,
          mes: mesDestino,
          quincena: quincenaDestino,
          litros: doc.cantidadLitros,
          bruto: brutoLeido,
          // Fecha de pago: el fin del periodo liquidado es la referencia real
          // del documento. Si el papel no lo trae, `resetIngreso` ya deja hoy.
          fechaPago: doc.periodoFin ?? null,
        };

        setAnio(anioDestino);
        setMes(mesDestino);
        setQuincena(quincenaDestino);

        // Si el periodo leído es el que ya está en pantalla, el efecto de
        // recarga no se re-dispara (las tres dependencias quedan iguales) y
        // nadie aplicaría la lectura -- se fuerza la recarga a mano.
        if (anioDestino === anio && mesDestino === mes && quincenaDestino === quincena) {
          void cargarRegistro();
        }

        const advertencias = [...respuesta.ocr.advertencias];
        if (doc.camposNoConfiables.length > 0) {
          advertencias.push(`revisa a mano: ${doc.camposNoConfiables.join(', ')} (lectura de baja confianza)`);
        }
        if (advertencias.length > 0) {
          toast.warning(`Liquidación leída con observaciones -- ${advertencias.join(' · ')}`);
        } else {
          toast.success('Liquidación leída -- revisa los valores antes de guardar');
        }
      } catch {
        // El hook ya deja el mensaje en `ocr.error`, mostrado en la UI.
      }
    },
    // `anio`/`mes`/`quincena` se leen para decidir el periodo destino cuando
    // el papel no lo trae, y para saber si hay que forzar la recarga: sin
    // ellas en las dependencias la función capturaría valores viejos si el
    // usuario cambia de periodo entre renders.
    [ocr, anio, mes, quincena, cargarRegistro],
  );

  // Selección ya hecha por el disparador exterior (`VentaQuincenalCard.tsx`)
  // -- se siembra UNA vez por apertura, mismo patrón que
  // `SubirChequeoExcel.tsx`/`SubirPesajeFoto.tsx` (`[open]` como única
  // dependencia: nunca en cada render, o reabrir con el mismo `open`
  // relanzaría el mismo OCR). El componente NUNCA se desmonta al cerrar el
  // diálogo (`VentaQuincenalCard` lo mantiene siempre montado), así que esto
  // reutiliza `handleOcrLeido` tal cual -- la secuencia de `ocrPendiente`
  // sigue siendo la misma que si el usuario hubiera hecho clic en "Cargar
  // liquidación" con el diálogo ya abierto.
  useEffect(() => {
    if (!open) return;
    if (fotosIniciales && fotosIniciales.length > 0) void handleOcrLeido(fotosIniciales);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const productividad = calcularProductividad(litrosTotal ?? null, numVacasOrdeno ?? null);
  // ICA/neto (D-11/D-12) -- SOLO preview del cliente; lo que persiste
  // siempre sale del RPC. `aplicaRetencionIcaLeche` decide si el periodo
  // seleccionado cae en o después de julio 2026; antes de esa fecha el
  // preview no retiene nada (ica=0, neto=bruto), igual que hará el RPC.
  const netoConIca =
    valorBruto != null && valorBruto > 0 && retencionIca != null
      ? calcularNetoConIca(valorBruto, aplicaRetencionIcaLeche(anio, mes) ? retencionIca : 0)
      : null;
  const precioBrutoLitro = calcularPrecioBrutoLitro(valorBruto ?? null, litrosTotal ?? null);
  const precioUnitario = calcularPrecioUnitarioQuincena(netoConIca?.neto ?? null, litrosTotal ?? null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <DialogTitle>Producción quincenal (litros al camión)</DialogTitle>
              <DialogDescription>
                Total que recoge el Pomar en la quincena — un solo registro con la venta enlazada.
              </DialogDescription>
            </div>
            {!soloLectura && (
              <div className="flex flex-col items-end gap-1.5">
                <CapturaArchivo
                  label="Cargar factura"
                  acceptArchivo="application/pdf,image/*"
                  labelOpcionArchivo="Subir PDF o imagen"
                  multipleFotos={false}
                  multipleArchivo={false}
                  disabled={ocr.loading || guardando}
                  onFotos={(files) => handleOcrLeido(files)}
                  onArchivo={(files) => handleOcrLeido(files)}
                />
                {ocr.loading && (
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <Loader2 className="w-4 h-4 animate-spin" /> Leyendo liquidación…
                  </p>
                )}
                {/* `max-w-xs` y no 200px: los mensajes de
                    `respuestaEdgeFunction.ts` son frases accionables
                    completas ("...avisa a soporte"), no códigos de error --
                    a 200px se partían en ~8 líneas. */}
                {ocr.error && <p className="text-xs text-red-600 max-w-xs text-right">{ocr.error}</p>}
              </div>
            )}
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4">
        <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="q-anio">Año</Label>
            <Select value={String(anio)} onValueChange={(v) => setAnio(parseInt(v, 10))}>
              <SelectTrigger id="q-anio" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[inicial.anio - 1, inicial.anio, inicial.anio + 1].map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="q-mes">Mes</Label>
            <Select value={String(mes)} onValueChange={(v) => setMes(parseInt(v, 10))}>
              <SelectTrigger id="q-mes" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((nombre, idx) => (
                  <SelectItem key={idx + 1} value={String(idx + 1)}>{nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="q-quincena">Quincena</Label>
            <Select value={String(quincena)} onValueChange={(v) => setQuincena(v === '1' ? 1 : 2)}>
              <SelectTrigger id="q-quincena" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1ª (1-15)</SelectItem>
                <SelectItem value="2">2ª (16-fin)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-gray-400">
            {formatShortDate(rango.fechaInicio)} – {formatShortDate(rango.fechaFin)}
            {registroId && !soloLectura && <span className="ml-2 text-blue-600 font-medium">registro existente</span>}
            {soloLectura && <span className="ml-2 text-amber-600 font-medium">derivado de mensual — solo lectura</span>}
          </p>
        </div>

        {cargando ? (
          <div className="flex items-center py-4 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando…
          </div>
        ) : soloLectura ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-700">
            Esta quincena viene de la partición de un ingreso mensual histórico (backfill) y es de solo lectura.
            Para corregirla, edita el ingreso mensual desde <span className="font-medium">Finanzas → Ingresos</span>.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Litros totales *</Label>
                <NumberInput value={litrosTotal} onChange={setLitrosTotal} decimals={1} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Litros confirmados por el Pomar</Label>
                <NumberInput value={litrosPomar} onChange={setLitrosPomar} decimals={1} placeholder="—" />
              </div>
              <div className="space-y-1.5">
                <Label>Vacas en ordeño</Label>
                <NumberInput value={numVacasOrdeno} onChange={setNumVacasOrdeno} decimals={0} placeholder="—" />
              </div>
            </div>

            {productividad !== null && (
              <p className="text-xs text-gray-500">
                Productividad: <span className="font-medium text-foreground">{formatNumber(productividad, 1)} L/vaca</span>
              </p>
            )}

            {/* Venta enlazada — campos NOT NULL de fin_ingresos (CLAUDE.md R5,
                migración 070). "fecha" es la fecha de PAGO del Pomar, distinta
                del periodo de producción de arriba -- nunca se validan entre sí. */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Venta (fin_ingresos)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="q-fecha-ingreso">Fecha de pago *</Label>
                  <Input
                    id="q-fecha-ingreso"
                    type="date"
                    value={fechaIngreso}
                    onChange={(e) => setFechaIngreso(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Valor bruto (liquidación) *</Label>
                  <NumberInput value={valorBruto} onChange={setValorBruto} decimals={0} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>Precio bruto (calculado)</Label>
                  <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                    {precioBrutoLitro != null ? `${formatCurrency(precioBrutoLitro)} / L` : '—'}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Precio neto (calculado)</Label>
                  <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                    {precioUnitario != null ? `${formatCurrency(precioUnitario)} / L` : '—'}
                  </div>
                </div>
              </div>

              {/* ICA (D-11/D-12) — ambos campos son SOLO PREVIEW: lo que
                  persiste sale del RPC, que recalcula del lado del
                  servidor con hato_config.retencion_ica_leche leída en el
                  mismo instante del guardado. */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>ICA retenida (calculado)</Label>
                  <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                    {netoConIca != null ? formatCurrency(netoConIca.ica) : '—'}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Valor neto (calculado)</Label>
                  <div className="flex items-center h-9 px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                    {netoConIca != null ? formatCurrency(netoConIca.neto) : '—'}
                  </div>
                </div>
                <div className="space-y-1.5 flex items-end">
                  {retencionIcaError ? (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" /> No se pudo leer la retención de ICA
                    </p>
                  ) : !aplicaRetencionIcaLeche(anio, mes) ? (
                    <p className="text-xs text-gray-400">Periodo anterior a julio 2026 — sin retención de ICA (D-12).</p>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="q-region">Región *</Label>
                  <Select value={regionId || undefined} onValueChange={setRegionId} disabled={catalogos.loading}>
                    <SelectTrigger id="q-region">
                      <SelectValue placeholder="Seleccionar región" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogos.regiones.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="q-medio-pago">Medio de pago *</Label>
                  <Select value={medioPagoId || undefined} onValueChange={setMedioPagoId} disabled={catalogos.loading}>
                    <SelectTrigger id="q-medio-pago">
                      <SelectValue placeholder="Seleccionar medio de pago" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogos.mediosPago.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="q-comprador">Comprador</Label>
                  <Select value={compradorId || undefined} onValueChange={setCompradorId} disabled={catalogos.loading}>
                    <SelectTrigger id="q-comprador">
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogos.compradores.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="q-notas">Notas</Label>
              <Textarea
                id="q-notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Opcional"
                rows={2}
              />
            </div>
          </>
        )}
      </div>

      {historial.length > 0 && (
        <div className="border-t border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Quincena</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Litros</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Pomar</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Vacas</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">L/vaca</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Bruto</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">ICA</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Neto</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h, i) => {
                  const prod = calcularProductividad(h.litros_total, h.num_vacas_ordeno);
                  // Bruto/ICA (D-11/D-12, migración 085) -- `null` para toda
                  // fila anterior a esa migración ("sin dato, nunca 0"): ni
                  // derivado_mensual (nunca tuvo bruto) ni una fila medido
                  // capturada antes de que existiera precio_bruto_litro.
                  const bruto =
                    h.precio_bruto_litro != null && h.litros_total != null
                      ? h.precio_bruto_litro * h.litros_total
                      : null;
                  const neto = h.finIngreso?.valor ?? null;
                  const ica = bruto != null && neto != null ? bruto - neto : null;
                  return (
                    <tr key={h.id} className={`border-t border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {MESES[h.mes - 1]} {h.anio} · {h.quincena}ª
                        {h.origen_dato === 'derivado_mensual' && (
                          <Badge variant="outline" className="ml-2 bg-amber-50 text-amber-700 border-amber-200">
                            derivado de mensual
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {h.litros_total != null ? formatNumber(h.litros_total, 1) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {h.litros_pomar_confirmado != null ? formatNumber(h.litros_pomar_confirmado, 1) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{h.num_vacas_ordeno ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {prod !== null ? formatNumber(prod, 1) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {bruto != null ? formatCurrency(bruto) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {ica != null ? formatCurrency(ica) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {neto != null ? formatCurrency(neto) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </DialogBody>
        <DialogFooter className="sm:justify-between">
          {cargando || soloLectura ? (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          ) : (
            <>
              {registroId ? (
                <Button
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => setConfirmEliminarOpen(true)}
                  disabled={guardando || cargando || eliminando}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
                  Cancelar
                </Button>
              )}
              <Button onClick={handleGuardar} disabled={guardando || cargando || eliminando}>
                {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {registroId ? 'Actualizar quincena' : 'Registrar quincena'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={confirmEliminarOpen}
        onOpenChange={setConfirmEliminarOpen}
        title="¿Eliminar esta quincena?"
        description="Se elimina la quincena y su venta enlazada (fin_ingresos) en una sola operación. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={handleEliminar}
        destructive
      />
    </Dialog>
  );
}
