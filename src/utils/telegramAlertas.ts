// Lógica pura de suscripción a alertas por usuario de Telegram.
// Extraído para testabilidad — mismo patrón que telegramUsuarios.ts.
//
// El catálogo de alertas (`alertas_catalogo`) vive en base de datos y hoy
// solo tiene filas del módulo `hato`; mañana tendrá `aguacate` y `ganado`
// sin que este archivo cambie. Nada aquí asume una lista fija de módulos o
// de claves de alerta — todo se deriva de las filas que llegan del catálogo.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlertaCatalogoRow {
  clave: string;
  modulo: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  activo: boolean;
}

export interface AlertaSuscripcionRow {
  telegram_usuario_id: string;
  alerta_clave: string;
  recibe: boolean;
  escalamiento: boolean;
}

export interface AlertaModuloGrupo {
  modulo: string;
  label: string;
  alertas: AlertaCatalogoRow[];
}

/** Estado de edición en el modal: clave de alerta -> casillas marcadas. */
export type SuscripcionEstado = Record<string, { recibe: boolean; escalamiento: boolean }>;

export interface ResumenSuscripciones {
  recibe: number;
  escalamiento: number;
}

// ---------------------------------------------------------------------------
// Etiquetas de módulo
// ---------------------------------------------------------------------------

// Solo para presentación — no restringe qué módulos puede traer el catálogo.
// Un módulo que no está aquí (p. ej. uno nuevo agregado en base de datos) cae
// al fallback de capitalizar la clave, nunca revienta ni se oculta.
const MODULO_LABELS: Record<string, string> = {
  hato: 'Hato Lechero',
  aguacate: 'Aguacate',
  ganado: 'Ganado',
};

export function labelModulo(modulo: string): string {
  const conocida = MODULO_LABELS[modulo];
  if (conocida) return conocida;
  if (!modulo) return modulo;
  return modulo.charAt(0).toUpperCase() + modulo.slice(1);
}

// ---------------------------------------------------------------------------
// Agrupación del catálogo
// ---------------------------------------------------------------------------

export function agruparAlertasPorModulo(catalogo: AlertaCatalogoRow[]): AlertaModuloGrupo[] {
  const porModulo = new Map<string, AlertaCatalogoRow[]>();

  for (const fila of catalogo) {
    if (fila.activo === false) continue;
    const lista = porModulo.get(fila.modulo);
    if (lista) {
      lista.push(fila);
    } else {
      porModulo.set(fila.modulo, [fila]);
    }
  }

  const grupos: AlertaModuloGrupo[] = Array.from(porModulo.entries()).map(([modulo, alertas]) => ({
    modulo,
    label: labelModulo(modulo),
    alertas: [...alertas].sort((a, b) => a.orden - b.orden),
  }));

  grupos.sort((a, b) => {
    const ordenA = a.alertas[0]?.orden ?? 0;
    const ordenB = b.alertas[0]?.orden ?? 0;
    if (ordenA !== ordenB) return ordenA - ordenB;
    return a.modulo.localeCompare(b.modulo);
  });

  return grupos;
}

// ---------------------------------------------------------------------------
// Estado de edición
// ---------------------------------------------------------------------------

export function construirEstadoDesdeSuscripciones(subs: AlertaSuscripcionRow[]): SuscripcionEstado {
  const estado: SuscripcionEstado = {};
  for (const s of subs) {
    estado[s.alerta_clave] = { recibe: !!s.recibe, escalamiento: !!s.escalamiento };
  }
  return estado;
}

export function alternarRecibe(estado: SuscripcionEstado, clave: string): SuscripcionEstado {
  const actual = estado[clave] ?? { recibe: false, escalamiento: false };
  return { ...estado, [clave]: { ...actual, recibe: !actual.recibe } };
}

export function alternarEscalamiento(estado: SuscripcionEstado, clave: string): SuscripcionEstado {
  const actual = estado[clave] ?? { recibe: false, escalamiento: false };
  return { ...estado, [clave]: { ...actual, escalamiento: !actual.escalamiento } };
}

// ---------------------------------------------------------------------------
// Persistencia (construcción de filas — el upsert real vive en el componente)
// ---------------------------------------------------------------------------

/**
 * Una fila por cada alerta del catálogo (nunca se omite una clave solo
 * porque nunca se tocó su casilla): así "desmarcar" también se persiste, en
 * vez de dejar en la tabla el último valor que sí se guardó.
 */
export function construirFilasParaGuardar(
  usuarioId: string,
  estado: SuscripcionEstado,
  catalogo: AlertaCatalogoRow[],
): AlertaSuscripcionRow[] {
  return catalogo.map((alerta) => {
    const actual = estado[alerta.clave] ?? { recibe: false, escalamiento: false };
    return {
      telegram_usuario_id: usuarioId,
      alerta_clave: alerta.clave,
      recibe: actual.recibe,
      escalamiento: actual.escalamiento,
    };
  });
}

// ---------------------------------------------------------------------------
// Resumen para la tabla de usuarios
// ---------------------------------------------------------------------------

export function contarSuscripcionesUsuario(
  todas: AlertaSuscripcionRow[],
  usuarioId: string,
): ResumenSuscripciones {
  let recibe = 0;
  let escalamiento = 0;
  for (const s of todas) {
    if (s.telegram_usuario_id !== usuarioId) continue;
    if (s.recibe) recibe++;
    if (s.escalamiento) escalamiento++;
  }
  return { recibe, escalamiento };
}

export function formatearResumenAlertas(resumen: ResumenSuscripciones): string {
  if (resumen.recibe === 0) {
    return resumen.escalamiento === 0 ? 'Sin alertas' : `Sin alertas (${resumen.escalamiento} esc.)`;
  }
  const base = `${resumen.recibe} alerta${resumen.recibe === 1 ? '' : 's'}`;
  return resumen.escalamiento === 0 ? base : `${base} (${resumen.escalamiento} esc.)`;
}
