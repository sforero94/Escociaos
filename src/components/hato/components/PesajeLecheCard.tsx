// ARCHIVO: components/hato/components/PesajeLecheCard.tsx
// DESCRIPCIÓN: UI rework de Producción (2026-08-06, "un desastre que genera
// una carga cognitiva inmensa") -- reemplaza los DOS bloques siempre
// visibles que apilaba la pestaña Registrar (`PesajeSemanalGrid`, grilla
// manual de 35 vacas; `CargaPesajeMensual`, el bloque de PDF + foto) por UNA
// tarjeta pequeña, siempre del mismo tamaño: título, línea de estado
// ("Mensual · se pesa los <día>" / "Última carga: <fecha>") y dos acciones.
// Renombrado desde `CargaPesajeMensual.tsx` (antes solo cubría el PDF + la
// carga por foto) -- ahora también es el punto de entrada del modo
// "Ingresar a mano" (tercera opción del desplegable `Registrar`, decisión
// del dueño: reutilizar la grilla de `SubirPesajeFoto`/`RevisionPesajeFoto`
// en vez de una segunda UI de captura -- ver `pesajeManual.ts`).
//
// El roster que exporta el PDF sigue siendo SIEMPRE el vigente en el
// momento de exportar (`etapa='vaca' AND estado='activa'`,
// `useProduccionHato.fetchVacasActivas` -- MISMO universo que ya usa el
// grid semanal).
//
// El selector de mes SÍ vive en la tarjeta (corrección del dueño,
// 2026-08-06): la primera versión de este rework lo había movido dentro del
// diálogo de carga para no agregarle controles a la tarjeta, y eso dejó sin
// salida el caso más frecuente -- imprimir la planilla de un mes que no es
// el actual. Un solo control gobierna las DOS acciones: el mes que se elige
// es el que se imprime y el que trae por defecto "Registrar", así no hay dos
// meses distintos en pantalla al mismo tiempo.

import { useEffect, useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProduccionHato } from '../hooks/useProduccionHato';
import { SubirPesajeFoto } from './SubirPesajeFoto';
import { CapturaArchivo } from './CapturaArchivo';
import { descargarPlanillaPesajePDF } from '@/utils/hato/exportarPlanillaPesajePDF';
import { fechasPorSemanaDelMes } from '@/utils/hato/exportarPlanillaPesaje';
import { formatLongDate } from '@/utils/format';
import { obtenerFechaHoy } from '@/utils/fechas';

/** Mes actual como `AAAA-MM`, el formato que espera `<input type="month">`.
 * Vía `obtenerFechaHoy()` (hora local) -- nunca `toISOString()`, que en
 * Bogotá ya es el día siguiente después de las 19:00 y el 31 de un mes
 * saltaría al mes que viene. */
function mesActualIso(): string {
  return obtenerFechaHoy().slice(0, 7);
}

export function PesajeLecheCard({ ultimaCarga, onGuardado }: { ultimaCarga: string | null; onGuardado?: () => void }) {
  const hook = useProduccionHato();

  const [periodo, setPeriodo] = useState(mesActualIso);
  const [anioTexto, mesTexto] = periodo.split('-');
  const anio = parseInt(anioTexto, 10);
  const mes = parseInt(mesTexto, 10);
  const periodoValido = Number.isFinite(anio) && Number.isFinite(mes) && mes >= 1 && mes <= 12;

  const [diaPesajeNombre, setDiaPesajeNombre] = useState<string | null>(null);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [dialogoOpen, setDialogoOpen] = useState(false);
  const [modoDialogo, setModoDialogo] = useState<'foto' | 'manual'>('foto');
  const [fotosParaSubir, setFotosParaSubir] = useState<File[]>([]);

  // Nombre del día de pesaje (migración 064) -- SIEMPRE leído de
  // `hato_config.dia_pesaje_semanal`, nunca un "miércoles" hardcodeado
  // (CLAUDE.md). Una vez por montaje: la tarjeta vive mientras dura la
  // pestaña, el valor no cambia entre renders.
  useEffect(() => {
    hook
      .fetchDiaPesajeSemanal()
      .then((config) => setDiaPesajeNombre(config.nombre || null))
      .catch(() => setDiaPesajeNombre(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirDialogo = (modo: 'foto' | 'manual', fotos: File[]) => {
    setModoDialogo(modo);
    setFotosParaSubir(fotos);
    setDialogoOpen(true);
  };

  const handleExportarPdf = async () => {
    setExportandoPdf(true);
    try {
      const [config, vacas] = await Promise.all([hook.fetchDiaPesajeSemanal(), hook.fetchRosterPesaje()]);
      const fechasPorSemana = fechasPorSemanaDelMes(anio, mes, config.iso);
      // `HatoVacaActiva.nombre` es `string | null` (columna nullable); una
      // vaca activa sin nombre no puede imprimirse en la planilla (D-1, el
      // nombre ES la identidad) -- se excluye en vez de imprimir una fila
      // sin ancla, misma regla que `construirRosterPlanilla` (chequeo).
      const animales = vacas.filter((v): v is typeof v & { nombre: string } => Boolean(v.nombre?.trim()));
      await descargarPlanillaPesajePDF(
        { anio, mes, fechasPorSemana, animales },
        `planilla-pesaje-${anio}-${String(mes).padStart(2, '0')}.pdf`,
      );
      toast.success('Planilla lista para imprimir.');
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo generar el PDF de la planilla.';
      toast.error(mensaje);
    } finally {
      setExportandoPdf(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">Pesaje de leche</h3>
      <p className="text-xs text-gray-500">
        Mensual{diaPesajeNombre ? ` · se pesa los ${diaPesajeNombre}` : ''}
      </p>
      <p className="text-xs text-gray-500 mb-3">
        {ultimaCarga ? `Última carga: ${formatLongDate(ultimaCarga)}` : 'Sin cargas registradas'}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="periodo-planilla" className="text-xs font-medium text-gray-600">
            Mes
          </label>
          <Input
            id="periodo-planilla"
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="w-40"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExportarPdf}
          disabled={exportandoPdf || !periodoValido}
        >
          {exportandoPdf ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Printer className="w-4 h-4 mr-1.5" />}
          Planilla en blanco (PDF)
        </Button>

        <CapturaArchivo
          label="Registrar"
          acceptArchivo="image/*"
          labelOpcionArchivo="Subir imagen"
          disabled={!periodoValido}
          // Ver la nota en `SubirPesajeFoto.tsx`: la planilla es de UNA hoja
          // pero se fotografía por mitades, así que las dos imágenes tienen
          // que poder elegirse de una sola vez desde la galería.
          multipleArchivo
          onFotos={(files) => abrirDialogo('foto', files)}
          onArchivo={(files) => abrirDialogo('foto', files)}
          onManual={() => abrirDialogo('manual', [])}
        />
      </div>

      <SubirPesajeFoto
        open={dialogoOpen}
        onOpenChange={(o) => {
          setDialogoOpen(o);
          if (!o) setFotosParaSubir([]);
        }}
        anioInicial={anio}
        mesInicial={mes}
        modoInicial={modoDialogo}
        fotosIniciales={fotosParaSubir}
        onCompletado={onGuardado}
      />
    </div>
  );
}
