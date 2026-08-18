import { useNavigate } from 'react-router-dom';
import { Lock, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { formatMillonesCOP } from '@/utils/format';
import {
  calcularEjecucionPresupuesto,
  calcularVariacionGasto,
  nombreMes,
  quincenasFaltantes,
  rangoValorQuincenas,
  topNegocios,
  type QuincenaResuelta,
} from '@/utils/calculosDinero';
import { useDinero, type DatosDinero } from './hooks/useDinero';

/**
 * Bloque "Dinero" del Tablero General (`docs/plan_dashboard_centro_control.md`
 * §4 Bloque 5 / §9.2). Penúltima sección de la pantalla, justo antes de
 * "Salud de los datos" -- diseño ya aprobado, no se rediseña aquí.
 *
 * Dos columnas dentro de UNA tarjeta ancha: gasto del mes contra
 * presupuesto (izquierda) e ingreso del mes (derecha). El caso que define
 * todo el bloque es agosto sin ningún ingreso registrado -- ahí NUNCA se
 * pinta `$0`: guion grande + nota ámbar + evidencia de las quincenas de
 * leche sin capturar + un botón (§5.2, "el caso más importante del
 * documento").
 *
 * Se cierra por ROL, nunca por resultado de consulta (§8 del plan): todas
 * las tablas `fin_*` son Gerencia-only por RLS, así que un Administrador con
 * el módulo `finanzas` vería puros ceros sin saber por qué -- mismo
 * precedente que `/finanzas/reportes` y el bloque de Ventas de
 * `ProduccionView`.
 */

function DineroSkeleton() {
  return (
    <section className="space-y-3" aria-hidden="true">
      <div className="h-6 bg-gray-100 rounded w-20 animate-pulse" />
      <div className="rounded-xl border border-primary/10 bg-white p-4 lg:p-5 shadow-sm animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="h-3 bg-gray-100 rounded w-40" />
            <div className="h-8 bg-gray-200 rounded w-36" />
            <div className="h-2 bg-gray-100 rounded w-full mt-4" />
          </div>
          <div className="space-y-3 sm:border-l sm:border-gray-100 sm:pl-6">
            <div className="h-3 bg-gray-100 rounded w-32" />
            <div className="h-8 bg-gray-200 rounded w-36" />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Mismo idioma visual que `CandadoVentasHato`/`CandadoGerencia`
 *  (`src/components/hato/ProduccionView.tsx` / `VentaQuincenalCard.tsx`):
 *  un candado pequeño reemplaza la tarjeta entera, nunca un título con
 *  acciones apagadas. */
function DineroCandado() {
  return (
    <section className="space-y-3">
      <h2 className="text-xl text-foreground">Dinero</h2>
      <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Lock className="w-4 h-4 text-amber-600" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Dinero</p>
          <p className="text-xs text-gray-500">La información financiera requiere permisos de Gerencia.</p>
        </div>
      </div>
    </section>
  );
}

function TextoFaltanQuincenas({ faltantes, rango }: { faltantes: QuincenaResuelta[]; rango: { min: number; max: number } | null }) {
  if (faltantes.length === 0) return null;
  // Concordancia sujeto/verbo: "falta 1 quincena" (singular), "faltan N
  // quincenas" (plural) -- el verbo tiene que concordar igual que el
  // sustantivo, no sólo éste.
  const singular = faltantes.length === 1;
  const verbo = singular ? 'falta' : 'faltan';
  const cuenta = singular ? '1 quincena' : `${faltantes.length} quincenas`;
  return (
    <p className="mt-2 text-xs text-brand-brown/70">
      No es que no se vendió: {verbo} {cuenta} de leche por capturar
      {rango && rango.min !== rango.max
        ? `, de ${formatMillonesCOP(rango.min)} a ${formatMillonesCOP(rango.max)} cada una`
        : rango
          ? `, de ${formatMillonesCOP(rango.min)} cada una`
          : ''}
      .
    </p>
  );
}

function ColumnaGasto({ datos }: { datos: DatosDinero }) {
  const variacion = calcularVariacionGasto(datos.gastoMesActual, datos.gastoMesAnterior);
  // `gastoAcumuladoPresupuestado`, NUNCA `gastoAcumuladoAnio`: ese último es
  // TODO el gasto del año en TODOS los negocios/categorías, incluido gasto
  // en categorías sin ninguna fila en `fin_presupuestos` (p. ej. buena
  // parte de Oficina Central) -- compararlo contra el presupuesto infla el
  // % ejecutado con gasto que ningún presupuesto cubre (caso real: 208%).
  const ejecucion = calcularEjecucionPresupuesto(
    datos.gastoAcumuladoPresupuestado,
    datos.presupuestoTotalAnual,
    datos.trimestreActual,
  );
  const top2 = topNegocios(datos.porNegocioAnio, 2);
  const mesAnteriorNum = datos.mesActual === 1 ? 12 : datos.mesActual - 1;

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-brand-brown/60">
        Gasto de {nombreMes(datos.mesActual)} · Confirmado
      </p>
      <div className="mt-1 flex items-center gap-2 flex-wrap">
        <span className="text-2xl font-bold text-foreground">{formatMillonesCOP(datos.gastoMesActual)}</span>
        {variacion && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              variacion.favorable ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {variacion.favorable ? (
              <TrendingDown className="w-3 h-3" aria-hidden="true" />
            ) : (
              <TrendingUp className="w-3 h-3" aria-hidden="true" />
            )}
            {variacion.pct > 0 ? '+' : ''}
            {variacion.pct}% vs {nombreMes(mesAnteriorNum)}
          </span>
        )}
      </div>

      <div className="mt-4">
        {ejecucion ? (
          <>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden" role="img" aria-label={`${ejecucion.pct}% del presupuesto acumulado al trimestre ejecutado`}>
              <div
                className={`h-full rounded-full ${ejecucion.sobrePresupuesto ? 'bg-destructive' : 'bg-primary'}`}
                style={{ width: `${Math.min(ejecucion.pct, 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-brand-brown/60">
              {formatMillonesCOP(datos.gastoAcumuladoPresupuestado)} de {formatMillonesCOP(ejecucion.presupuestoAcumuladoQ)}{' '}
              presupuestado al Q{datos.trimestreActual} ({ejecucion.pct}%)
            </p>
          </>
        ) : (
          // Sin presupuesto cargado: nunca una barra al 0% (§5.1 del plan).
          <p className="text-xs text-brand-brown/60">Sin presupuesto cargado para {datos.hoy.slice(0, 4)}.</p>
        )}
      </div>

      {top2.length > 0 && (
        <p className="mt-3 text-xs text-brand-brown/60">
          Mayor gasto del año: {top2.map((n) => `${n.nombre} ${formatMillonesCOP(n.total)}`).join(' · ')}
        </p>
      )}
    </div>
  );
}

function ColumnaIngreso({ datos, hasModuloHato }: { datos: DatosDinero; hasModuloHato: boolean }) {
  const navigate = useNavigate();
  const faltantes = hasModuloHato ? quincenasFaltantes(datos.ultimaQuincena, datos.hoy) : [];
  const rango = rangoValorQuincenas(datos.quincenaValores);

  return (
    <div className="sm:border-l sm:border-gray-100 sm:pl-6">
      <p className="text-xs uppercase tracking-wide text-brand-brown/60">Ingreso de {nombreMes(datos.mesActual)}</p>

      {datos.ingresoTieneFilas ? (
        <p className="mt-1 text-2xl font-bold text-foreground">{formatMillonesCOP(datos.ingresoMesActual)}</p>
      ) : (
        <>
          {/* El caso que define todo el bloque (§5.2): jamás $0. */}
          <p className="mt-1 text-2xl font-bold text-brand-brown/40" aria-hidden="true">
            —
          </p>
          <p className="text-sm font-medium text-warning-foreground bg-warning/15 inline-block px-2 py-0.5 rounded-md mt-1">
            Sin ingresos registrados en {nombreMes(datos.mesActual)}
          </p>
          <TextoFaltanQuincenas faltantes={faltantes} rango={rango} />
          <div className="mt-3">
            <Button type="button" size="sm" onClick={() => navigate('/finanzas/ingresos?tab=registrar')} className="w-full sm:w-auto">
              Registrar quincena
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function DineroContenido({ datos, hasModuloHato }: { datos: DatosDinero; hasModuloHato: boolean }) {
  return (
    <div className="rounded-xl border border-primary/10 bg-white p-4 lg:p-5 shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <ColumnaGasto datos={datos} />
        <ColumnaIngreso datos={datos} hasModuloHato={hasModuloHato} />
      </div>
    </div>
  );
}

export function Dinero() {
  const { isLoading: authLoading, profile, hasModulo } = useAuth();
  const tieneModuloFinanzas = hasModulo('finanzas');
  const esGerencia = profile?.rol === 'Gerencia';
  const hasModuloHato = hasModulo('hato_lechero');
  // Se cierra por ROL, nunca por resultado de consulta (§8 del plan) -- el
  // hook de abajo ni siquiera intenta consultar Supabase hasta que esto sea
  // `true`.
  const habilitado = !authLoading && tieneModuloFinanzas && esGerencia;

  const { estado, datos } = useDinero({ habilitado, hasModuloHato });

  // Durante los ~2s en que AuthContext resuelve el perfil: skeleton del
  // mismo tamaño, nunca un hueco en blanco (§8 del plan -- mismo FIX que
  // `ProduccionView.tsx` aplicó para su bloque "Ventas").
  if (authLoading) return <DineroSkeleton />;

  // Sin el módulo, la sección entera desaparece y no se consulta nada --
  // nunca un mensaje de "sin permisos".
  if (!tieneModuloFinanzas) return null;

  // Con el módulo pero sin rol Gerencia: candado explicativo, no un vacío
  // (RLS de fin_* devolvería [] indistinguible de "no hay datos").
  if (!esGerencia) return <DineroCandado />;

  if (estado === 'cargando') return <DineroSkeleton />;

  if (estado === 'error' || !datos) {
    return (
      <section className="space-y-2">
        <h2 className="text-xl text-foreground">Dinero</h2>
        <p className="text-sm text-brand-brown/60">No se pudo cargar la información financiera.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xl text-foreground">Dinero</h2>
      <DineroContenido datos={datos} hasModuloHato={hasModuloHato} />
    </section>
  );
}
