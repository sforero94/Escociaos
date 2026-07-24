// ARCHIVO: components/configuracion/AjustesHato.tsx
// DESCRIPCIÓN: Tab "Hato" dentro de Configuración global (Épica H, S10,
// docs/plan_hato_lechero_module.md §6/§8). Edita `hato_config` -- las
// condicionales que el motor de fechas (`calculosHato.ts`) y el futuro motor
// de alertas (§7.3) leen en vivo, NUNCA como constantes de código. Gateado a
// Gerencia por el caller (`ConfiguracionDashboard.tsx`, mismo patrón que
// "usuarios"/"telegram" -- `isGerencia && <TabsTrigger .../>`), consistente
// con la RLS de `hato_config` (058: SELECT authenticated, escritura
// `es_usuario_gerencia()`).
//
// Toda la forma/serialización vive en `utils/ajustesHatoValidacion.ts`
// (pura, testeada en `__tests__/ajustesHatoValidacion.test.ts`) -- este
// componente solo junta estado de formulario + el hook de I/O
// (`useAjustesHato.ts`).

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Plus, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useAjustesHato } from './hooks/useAjustesHato';
import type { AjustesHatoForm } from '@/utils/ajustesHatoValidacion';

const DIAS_SEMANA: { iso: number; nombre: string; label: string }[] = [
  { iso: 1, nombre: 'lunes', label: 'Lunes' },
  { iso: 2, nombre: 'martes', label: 'Martes' },
  { iso: 3, nombre: 'miercoles', label: 'Miércoles' },
  { iso: 4, nombre: 'jueves', label: 'Jueves' },
  { iso: 5, nombre: 'viernes', label: 'Viernes' },
  { iso: 6, nombre: 'sabado', label: 'Sábado' },
  { iso: 7, nombre: 'domingo', label: 'Domingo' },
];

const UMBRALES: {
  campo: keyof Pick<
    AjustesHatoForm,
    | 'mesesGestacionDefault'
    | 'umbralPartosReemplazo'
    | 'ventanaProximaSecarDias'
    | 'ventanaProximoParirDias'
    | 'diasPartoProximoAlerta'
    | 'diasServicioSinConfirmacion'
    | 'diasRechequeoDue'
    | 'diasEsperaVoluntariaPostParto'
  >;
  label: string;
  ayuda: string;
}[] = [
  { campo: 'mesesGestacionDefault', label: 'Meses de gestación (default)', ayuda: 'PP = fecha de servicio + estos meses (B2).' },
  { campo: 'umbralPartosReemplazo', label: 'Umbral de partos — próxima a reemplazo', ayuda: 'A partir de cuántos partos se marca "próxima a reemplazo" (A7).' },
  { campo: 'ventanaProximaSecarDias', label: 'Ventana "próximas a secar" (días)', ayuda: 'Ventana del tablero (E1), no de las alertas.' },
  { campo: 'ventanaProximoParirDias', label: 'Ventana "próximas a parir" (días)', ayuda: 'Ventana del tablero (E1), no de las alertas.' },
  { campo: 'diasPartoProximoAlerta', label: 'Días — alerta de parto próximo', ayuda: 'Ventana de la alerta parto_proximo (§7.3), distinta de la del tablero.' },
  { campo: 'diasServicioSinConfirmacion', label: 'Días — servicio sin confirmación', ayuda: 'Desde el servicio, sin celo/aborto/parto, antes de alertar.' },
  { campo: 'diasRechequeoDue', label: 'Días — rechequeo pendiente', ayuda: 'Desde el último chequeo del hato antes de marcar rechequeo vencido.' },
  { campo: 'diasEsperaVoluntariaPostParto', label: 'Días — espera voluntaria post-parto', ayuda: 'Tras el parto, una vaca vacía se considera normal hasta este umbral (default provisional, sin confirmar con el dueño).' },
];

function normalizarRaza(valor: string): string {
  return valor.trim().toLowerCase();
}

export function AjustesHato() {
  const { user } = useAuth();
  const { form: formGuardado, cargando, guardando, error, cargar, guardar } = useAjustesHato();
  const [local, setLocal] = useState<AjustesHatoForm | null>(null);
  const [nuevaRaza, setNuevaRaza] = useState('');

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Sincroniza el estado local editable cada vez que llega un formulario
  // recién cargado o recién guardado -- nunca pisa una edición en curso del
  // usuario (solo corre cuando `formGuardado` cambia de referencia).
  useEffect(() => {
    if (formGuardado) setLocal(formGuardado);
  }, [formGuardado]);

  if (cargando || !local) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        {error}
      </div>
    );
  }

  const actualizarUmbral = (campo: (typeof UMBRALES)[number]['campo'], valor: number | undefined) => {
    setLocal((prev) => (prev ? { ...prev, [campo]: valor ?? 0 } : prev));
  };

  const agregarRaza = () => {
    const raza = normalizarRaza(nuevaRaza);
    if (!raza) return;
    setLocal((prev) => {
      if (!prev || prev.razas.includes(raza)) return prev;
      const mesesPorDefecto = prev.mesesSecadoPorRaza._default ?? 2;
      return {
        ...prev,
        razas: [...prev.razas, raza],
        mesesSecadoPorRaza: { ...prev.mesesSecadoPorRaza, [raza]: mesesPorDefecto },
      };
    });
    setNuevaRaza('');
  };

  const quitarRaza = (raza: string) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const { [raza]: _omitido, ...restoMeses } = prev.mesesSecadoPorRaza;
      return { ...prev, razas: prev.razas.filter((r) => r !== raza), mesesSecadoPorRaza: restoMeses };
    });
  };

  const actualizarMesesSecado = (raza: string, valor: number | undefined) => {
    setLocal((prev) => (prev ? { ...prev, mesesSecadoPorRaza: { ...prev.mesesSecadoPorRaza, [raza]: valor ?? 0 } } : prev));
  };

  const actualizarDiaPesaje = (iso: string) => {
    const dia = DIAS_SEMANA.find((d) => String(d.iso) === iso);
    if (!dia) return;
    setLocal((prev) => (prev ? { ...prev, diaPesajeSemanal: { iso: dia.iso, nombre: dia.nombre } } : prev));
  };

  const handleGuardar = async () => {
    if (!local) return;
    const resultado = await guardar(local, user?.id);
    if (!resultado.ok) {
      toast.error(resultado.error ?? 'Error desconocido guardando los ajustes del hato');
      return;
    }
    if (resultado.clavesSinFila && resultado.clavesSinFila.length > 0) {
      toast.warning(
        `Guardado, pero estas claves no existían en hato_config y no se escribieron: ${resultado.clavesSinFila.join(', ')}. Revisa que las migraciones 058/062/064 estén aplicadas.`,
      );
      return;
    }
    toast.success('Ajustes del hato guardados');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>
          Estos parámetros alimentan el motor de fechas y el motor de alertas del Hato Lechero para <strong>todo el hato</strong>,
          no solo un animal. Un cambio aquí afecta inmediatamente los cálculos de secado, parto probable, reemplazo y las
          alertas que recibe Fernando por Telegram.
        </p>
      </div>

      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-4 lg:p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <h3 className="text-lg text-foreground mb-1">Razas y secado por raza</h3>
        <p className="text-sm text-gray-500 mb-4">
          Meses de secado antes del parto por raza (H1). "Otras razas" aplica cuando la raza del animal no está en esta lista.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {local.razas.map((raza) => (
            <Badge key={raza} variant="outline" className="gap-1.5 py-1 px-2.5">
              <span className="capitalize">{raza}</span>
              <button
                type="button"
                onClick={() => quitarRaza(raza)}
                aria-label={`Quitar raza ${raza}`}
                className="text-gray-400 hover:text-red-600"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-6">
          <Input
            value={nuevaRaza}
            onChange={(e) => setNuevaRaza(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                agregarRaza();
              }
            }}
            placeholder="Nueva raza..."
            className="max-w-xs"
          />
          <Button type="button" size="sm" variant="outline" onClick={agregarRaza}>
            <Plus className="w-4 h-4 mr-1.5" />
            Agregar
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {local.razas.map((raza) => (
            <div key={raza} className="space-y-1.5">
              <Label htmlFor={`meses-secado-${raza}`} className="capitalize">{raza}</Label>
              <NumberInput
                id={`meses-secado-${raza}`}
                value={local.mesesSecadoPorRaza[raza]}
                onChange={(v) => actualizarMesesSecado(raza, v)}
                decimals={0}
                onWheel={(e) => e.currentTarget.blur()}
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="meses-secado-default">Otras razas (_default)</Label>
            <NumberInput
              id="meses-secado-default"
              value={local.mesesSecadoPorRaza._default}
              onChange={(v) => actualizarMesesSecado('_default', v)}
              decimals={0}
              onWheel={(e) => e.currentTarget.blur()}
            />
          </div>
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-4 lg:p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <h3 className="text-lg text-foreground mb-1">Umbrales y ventanas (H2)</h3>
        <p className="text-sm text-gray-500 mb-4">Umbrales de indicadores y alertas editables sin tocar código.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {UMBRALES.map(({ campo, label, ayuda }) => (
            <div key={campo} className="space-y-1.5">
              <Label htmlFor={`umbral-${campo}`}>{label}</Label>
              <NumberInput
                id={`umbral-${campo}`}
                value={local[campo]}
                onChange={(v) => actualizarUmbral(campo, v)}
                decimals={0}
                onWheel={(e) => e.currentTarget.blur()}
              />
              <p className="text-xs text-gray-500">{ayuda}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-4 lg:p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <h3 className="text-lg text-foreground mb-1">Día de pesaje semanal</h3>
        <p className="text-sm text-gray-500 mb-4">
          Día en que se pesa la leche por vaca (usado por el registro de pesaje y el backfill de producción, migración 064).
        </p>
        <Select value={String(local.diaPesajeSemanal.iso)} onValueChange={actualizarDiaPesaje}>
          <SelectTrigger id="dia-pesaje-semanal" className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIAS_SEMANA.map((d) => (
              <SelectItem key={d.iso} value={String(d.iso)}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleGuardar} disabled={guardando}>
          {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar ajustes
        </Button>
      </div>
    </div>
  );
}
