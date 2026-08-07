// ARCHIVO: components/hato/ProduccionView.tsx
// DESCRIPCIÓN: `/hato-lechero/produccion` -- reestructurado en SOW 5 del
// rework del submódulo Producción (`docs/plan_hato_produccion_rework.md`
// §4.3/§6) y luego separado en dos pestañas (consumo vs. registro) siguiendo
// el mismo patrón que `IngresosView.tsx` (`historial`/`registrar` + Tabs +
// `TABS_VALIDOS` + `useSearchParams`): chip de vejez permanente (decisión
// 17) arriba de las pestañas → pestaña `Producción` (tracker de
// productividad bottom-up, decisión 13; gráfico + KPIs de ventas GERENCIA-
// ONLY, decisión 14; ranking por vaca, decisiones 10/12) → pestaña
// `Registrar` (pesaje semanal, quincenal, venta de animales del hato).
//
// TODA la aritmética de este tablero viene de `hatoProduccion.ts` (SOW 2) --
// este archivo y los componentes que ensambla solo consultan (vía los hooks
// del módulo) y renderizan.

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HandCoins, Lock, ClipboardList, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { vejezPesajes, fechaAnclaProduccion } from '@/utils/hatoProduccion';
import { obtenerFechaHoy } from '@/utils/fechas';
import { useProduccionHato, type HatoProduccionQuincenalConIngreso } from './hooks/useProduccionHato';
import { useDatosProduccionPorVaca } from './hooks/useDatosProduccionPorVaca';
import { HatoPageHeader } from './components/HatoPageHeader';
import { ChipVejezPesajes } from './components/ChipVejezPesajes';
import { TrackerProductividad } from './components/TrackerProductividad';
import { RankingVacas } from './components/RankingVacas';
import { KpisVentaHato } from './components/KpisVentaHato';
import { PesajeLecheCard } from './components/PesajeLecheCard';
import { VentaQuincenalCard } from './components/VentaQuincenalCard';
import { GraficoLitrosQuincenal } from './components/GraficoLitrosQuincenal';
import { VentaAnimalesHatoDialog } from './components/VentaAnimalesHatoDialog';

// Debe coincidir con los `value` de los TabsTrigger definidos más abajo --
// mismo patrón que `IngresosView.tsx`.
const TABS_VALIDOS = ['produccion', 'registrar'];

/** Fallback del bloque "Ventas" completo (barras + KPIs) para un rol sin
 * permisos de Gerencia -- plan §4.3: "el gate es el ROL, nunca el resultado
 * de la consulta" (RLS de `fin_ingresos` devuelve `[]` sin error para un
 * Administrador, indistinguible de "no hay ventas"). UN solo candado para
 * las dos tarjetas del bloque, no uno por tarjeta -- así lo dibuja el ASCII
 * del plan ("Ventas [GERENCIA]" como un único bloque). */
function CandadoVentasHato() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
        <Lock className="w-4 h-4 text-amber-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Ventas del Hato</p>
        <p className="text-xs text-gray-500">Las ventas del Hato requieren permisos de Gerencia.</p>
      </div>
    </div>
  );
}

/** Placeholder del bloque "Ventas" mientras `AuthContext` resuelve el
 * perfil (FIX 5, `docs/hato/qa-produccion-rework.md`) -- `RoleGuard`
 * renderiza `null` durante `isLoading` (hasta ~2s, la ventana documentada
 * de `AuthContext`), lo que dejaba un hueco en blanco indistinguible de un
 * bug de carga: ni el contenido, ni la tarjeta "requiere Gerencia".
 * Mismo shape que el bloque real (`grid lg:grid-cols-2 gap-6`, dos
 * tarjetas) para que no haya salto de layout cuando resuelve. */
function VentasHatoSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" aria-hidden="true">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-40 mb-4" />
        <div className="h-32 bg-gray-100 rounded" />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-32 mb-4" />
        <div className="h-24 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

export function ProduccionView() {
  const hook = useProduccionHato();
  const datos = useDatosProduccionPorVaca();
  const { isLoading: authLoading } = useAuth();

  const [searchParams] = useSearchParams();
  const tabInicial = TABS_VALIDOS.includes(searchParams.get('tab') || '')
    ? (searchParams.get('tab') as string)
    : 'produccion';
  const [activeTab, setActiveTab] = useState(tabInicial);

  const [historialQuincenal, setHistorialQuincenal] = useState<HatoProduccionQuincenalConIngreso[]>([]);
  const [ventaOpen, setVentaOpen] = useState(false);

  const cargarHistorial = useCallback(async () => {
    try {
      // 8 quincenas (~4 meses) -- ventana del gráfico de barras y de las
      // KPIs "L/vaca promedio" de KpisVentaHato.
      setHistorialQuincenal(await hook.fetchHistorialQuincenal(8));
    } catch (err: unknown) {
      console.error('Error cargando historial quincenal:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  // `obtenerFechaHoy()` -- NUNCA `new Date().toISOString().slice(0, 10)` --
  // ese último es UTC: después de las 19:00 Bogotá ya es "mañana" en UTC,
  // así que un chip de vejez comparado contra ese valor reportaría un
  // backlog de -1 día que no existe (bug real, hallado por el dueño en la
  // vista corriendo).
  const hoy = useMemo(() => obtenerFechaHoy(), []);
  // El chip de vejez SIEMPRE compara contra "hoy" real -- ese es su
  // trabajo, comunicar la brecha (decisión 17). Las ventanas de cálculo
  // del tracker/ranking, en cambio, se anclan al último pesaje real (FIX 3,
  // docs/hato/qa-produccion-rework.md) para no quedar en blanco cuando hay
  // backlog operativo -- nunca se usa `fechaAncla` para el chip, ni `hoy`
  // literal para las ventanas de cálculo.
  const vejez = useMemo(() => vejezPesajes(datos.pesajes, hoy), [datos.pesajes, hoy]);
  const fechaAncla = useMemo(() => fechaAnclaProduccion(datos.pesajes, hoy), [datos.pesajes, hoy]);

  const recargarTodo = useCallback(() => {
    datos.reload();
    cargarHistorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargarHistorial]);

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        <HatoPageHeader
          breadcrumb="Hato Lechero"
          section="Producción"
          title="Producción"
          subtitle="Tracker de productividad, ventas del hato y ranking por vaca"
        />

        {/* Chip de vejez, permanente y por encima de las pestañas -- en
            `Producción` explica por qué las cifras se ven viejas, en
            `Registrar` dice qué falta por capturar. Única instancia en la
            página (antes se repetía dentro del tracker). */}
        <ChipVejezPesajes vejez={vejez} />

        <Tabs value={activeTab} onValueChange={setActiveTab} activationMode="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="produccion" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Producción
            </TabsTrigger>
            <TabsTrigger value="registrar" className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              Registrar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="produccion" className="mt-6 space-y-6">
            {/* 1. Tracker de productividad (decisión 13) -- todos los roles. */}
            <TrackerProductividad
              pesajes={datos.pesajes}
              partos={datos.partos}
              estadosReproductivos={datos.estadosReproductivos}
              fechaReferencia={fechaAncla}
              vejez={vejez}
              loading={datos.loading}
              error={datos.error}
            />

            {/* 2. Ventas -- GERENCIA-ONLY (decisión 5/14), un solo candado
                para todo el bloque. Mientras `AuthContext` resuelve el
                perfil (FIX 5), un skeleton reemplaza el hueco en blanco que
                dejaba `RoleGuard` (retorna `null` en `isLoading`) -- nunca
                contenido ni candado a medias. */}
            {authLoading ? (
              <VentasHatoSkeleton />
            ) : (
              <RoleGuard allowedRoles={['Gerencia']} fallback={<CandadoVentasHato />}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <GraficoLitrosQuincenal historial={historialQuincenal} />
                  <KpisVentaHato historialQuincenal={historialQuincenal} />
                </div>
              </RoleGuard>
            )}

            {/* 3. Ranking por vaca (decisiones 10/12) -- todos los roles. */}
            <RankingVacas
              pesajes={datos.pesajes}
              partos={datos.partos}
              identidadPorAnimal={datos.identidadPorAnimal}
              fechaReferencia={fechaAncla}
              loading={datos.loading}
              error={datos.error}
            />
          </TabsContent>

          <TabsContent value="registrar" className="mt-6">
            {/* Tres tarjetas uniformes y pequeñas, siempre -- reemplazan el
                apilado de bloques siempre-expandidos que tenía antes esta
                pestaña (grilla de pesaje + PDF/foto + formulario quincenal +
                tarjeta de venta). Cada acción real vive en un `Dialog`
                (`size` según su contenido: `xl` la grilla de pesaje --
                35 vacas x 5 semanas x AM/PM --, `lg` el formulario
                quincenal, `lg` la venta de animales) para que esta pestaña
                nunca crezca. */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <PesajeLecheCard ultimaCarga={vejez.ultimaFecha} onGuardado={recargarTodo} />
              <VentaQuincenalCard historialQuincenal={historialQuincenal} onSaved={cargarHistorial} />

              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900">Venta de animales</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Terneros o vacas de descarte -- registra la venta y, opcionalmente, enlázala a animales puntuales del hato.
                </p>
                <Button variant="outline" size="sm" onClick={() => setVentaOpen(true)}>
                  <HandCoins className="w-4 h-4 mr-1.5" /> Registrar venta
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <VentaAnimalesHatoDialog open={ventaOpen} onOpenChange={setVentaOpen} onGuardado={recargarTodo} />
    </div>
  );
}
