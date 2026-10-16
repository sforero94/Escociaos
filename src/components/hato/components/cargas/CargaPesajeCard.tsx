// ARCHIVO: components/hato/components/cargas/CargaPesajeCard.tsx
// DESCRIPCIÓN: tarjeta "Pesaje de las vacas" de Cargas v2. Telegram /pesaje
// es la puerta normal (D3); esta tarjeta muestra qué llegó en cada día de
// pesaje del mes, deja abrir el detalle mañana/tarde para corregir, y deja
// la foto de la planilla y la planilla en blanco como RESPALDO.
//
// El selector de mes se conserva (corrección del dueño del 2026-08-06 en
// `PesajeLecheCard`): hay que poder imprimir la planilla de un mes que no
// es el actual. Un solo control gobierna la lista, la foto y el PDF.

import { useEffect, useMemo, useState } from 'react';
import { Droplet, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fechasPesajeMensuales } from '@/utils/calculosHato';
import { descargarPlanillaPesajePDF } from '@/utils/hato/exportarPlanillaPesajePDF';
import { fechasPorSemanaDelMes } from '@/utils/hato/exportarPlanillaPesaje';
import { describirUltimaCaptura } from '@/utils/hato/capturasFoto';
import { etiquetaDiaPesaje, semanasPesajeDelMes, type PendienteCarga } from '@/utils/hato/produccionV2';
import { formatShortDate } from '@/utils/format';
import { mensajeErrorCargaDiferida } from '@/utils/errorCargaDiferida';
import type { PesajeLecheVaca } from '@/utils/hatoProduccion';
import { useProduccionHato } from '../../hooks/useProduccionHato';
import { useUltimaCapturaFoto } from '../../hooks/useUltimaCapturaFoto';
import { CapturaArchivo } from '../CapturaArchivo';
import { SubirPesajeFoto } from '../SubirPesajeFoto';
import { FilaCargaAMedias } from './FilaCargaAMedias';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const FUENTE: Record<string, string> = { telegram: 'Telegram', foto: 'foto', web: 'web', importacion: 'importación' };

export function CargaPesajeCard({
  hoy,
  diaPesaje,
  pesajes,
  onAbrirFecha,
  onGuardado,
  aMedias = [],
  onVerFoto,
}: {
  hoy: string;
  diaPesaje: { iso: number; nombre: string } | null;
  pesajes: PesajeLecheVaca[];
  onAbrirFecha: (fecha: string) => void;
  onGuardado: () => void;
  /** Planillas subidas que no dejaron litros (`cargasAMedias`). */
  aMedias?: PendienteCarga[];
  onVerFoto?: (p: PendienteCarga) => void;
}) {
  const hook = useProduccionHato();
  const { captura, recargar: recargarCaptura } = useUltimaCapturaFoto('pesaje');
  const [periodo, setPeriodo] = useState(hoy.slice(0, 7));
  const [anioTexto, mesTexto] = periodo.split('-');
  const anio = parseInt(anioTexto, 10);
  const mes = parseInt(mesTexto, 10);
  const periodoValido = Number.isFinite(anio) && Number.isFinite(mes) && mes >= 1 && mes <= 12;

  const [exportando, setExportando] = useState(false);
  const [dialogo, setDialogo] = useState<{ modo: 'foto' | 'manual'; fotos: File[] } | null>(null);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);

  useEffect(() => {
    if (dialogo) setDialogoAbierto(true);
  }, [dialogo]);

  // «Continuar» una planilla a medias: la grilla a mano de su mes.
  const continuar = (p: PendienteCarga) => {
    if (p.anio == null || p.mes == null) return;
    setPeriodo(`${p.anio}-${String(p.mes).padStart(2, '0')}`);
    setDialogo({ modo: 'manual', fotos: [] });
  };

  const semanas = useMemo(() => {
    if (!periodoValido || !diaPesaje) return [];
    return semanasPesajeDelMes(fechasPesajeMensuales(anio, mes, diaPesaje.iso), pesajes, hoy);
  }, [periodoValido, diaPesaje, anio, mes, pesajes, hoy]);

  const descripcionCaptura = describirUltimaCaptura(captura, captura ? formatShortDate(captura.creadoEn) : '');

  const exportarPdf = async () => {
    setExportando(true);
    try {
      const [config, vacas] = await Promise.all([hook.fetchDiaPesajeSemanal(), hook.fetchRosterPesaje()]);
      const animales = vacas.filter((v): v is typeof v & { nombre: string } => Boolean(v.nombre?.trim()));
      await descargarPlanillaPesajePDF(
        { anio, mes, fechasPorSemana: fechasPorSemanaDelMes(anio, mes, config.iso), animales },
        `planilla-pesaje-${anio}-${String(mes).padStart(2, '0')}.pdf`,
      );
      toast.success('Planilla lista para imprimir.');
    } catch (err) {
      console.error('[planilla pesaje] fallo generando el PDF', err);
      toast.error(mensajeErrorCargaDiferida(err, 'No se pudo generar el PDF de la planilla'));
    } finally {
      setExportando(false);
    }
  };

  return (
    <section id="carga-pesaje" className="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
          <Droplet className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Pesaje de las vacas</h2>
          <p className="text-xs text-gray-500">
            Cada {diaPesaje?.nombre ?? 'semana'} · planilla del mes con 5 pesajes
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Entra por Telegram con <strong className="text-gray-700">/pesaje</strong>. Aquí revisas lo que llegó.
      </p>

      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
        Mes
        <Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-40" />
      </label>

      <div className="flex flex-col gap-1.5">
        {!diaPesaje ? (
          <p className="text-sm text-gray-400">Sin día de pesaje configurado.</p>
        ) : (
          semanas.map((s) =>
            s.estado === 'proximo' ? (
              <div key={s.fecha} className="flex h-11 items-center justify-between rounded-md border border-gray-100 px-3 text-sm text-gray-400">
                <span>{etiquetaDiaPesaje(s.fecha)}</span>
                <span>Próximo</span>
              </div>
            ) : s.estado === 'falta' ? (
              <div key={s.fecha} className="flex h-11 items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 text-sm text-amber-800">
                <span>{etiquetaDiaPesaje(s.fecha)}</span>
                <span className="font-medium text-amber-700">Sin pesaje</span>
              </div>
            ) : (
              <button
                key={s.fecha}
                type="button"
                onClick={() => onAbrirFecha(s.fecha)}
                className="flex h-11 items-center justify-between rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              >
                <span>{etiquetaDiaPesaje(s.fecha)}</span>
                <span className="font-medium text-green-700">
                  ✓ {s.nVacas} vacas{s.fuente ? ` · ${FUENTE[s.fuente] ?? s.fuente}` : ''}
                </span>
              </button>
            ),
          )
        )}
      </div>
      <p className="text-xs text-gray-500">Toca un día cargado para ver o corregir mañana y tarde por vaca.</p>

      <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold text-gray-700">Si Telegram no funcionó</p>
        {aMedias.map((p) => (
          <FilaCargaAMedias key={p.clave} pendiente={p} onVerFoto={(x) => onVerFoto?.(x)} onContinuar={continuar} />
        ))}
        <p className={`text-xs ${descripcionCaptura.tono === 'alerta' ? 'text-amber-700' : 'text-gray-500'}`}>{descripcionCaptura.texto}</p>
        <CapturaArchivo
          label="Subir foto de la planilla"
          acceptArchivo="image/*"
          labelOpcionArchivo="Subir imagen"
          disabled={!periodoValido}
          multipleArchivo
          onFotos={(files) => setDialogo({ modo: 'foto', fotos: files })}
          onArchivo={(files) => setDialogo({ modo: 'foto', fotos: files })}
          onManual={() => setDialogo({ modo: 'manual', fotos: [] })}
          className="w-full"
        />
        <Button variant="ghost" className="text-primary" onClick={exportarPdf} disabled={exportando || !periodoValido}>
          {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          Imprimir planilla en blanco de {periodoValido ? MESES[mes - 1] : 'este mes'}
        </Button>
      </div>

      {periodoValido && (
        <SubirPesajeFoto
          open={dialogoAbierto}
          onOpenChange={(o) => {
            setDialogoAbierto(o);
            if (!o) {
              setDialogo(null);
              void recargarCaptura();
            }
          }}
          anioInicial={anio}
          mesInicial={mes}
          modoInicial={dialogo?.modo ?? 'foto'}
          fotosIniciales={dialogo?.fotos ?? []}
          onCompletado={() => {
            void recargarCaptura();
            onGuardado();
          }}
        />
      )}
    </section>
  );
}
