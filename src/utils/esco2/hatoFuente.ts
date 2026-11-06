import { leerFilasFijas, type ClienteDatos } from './fuente.ts';
import { esUuid } from './aplicacionesTipos.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import type { AnimalHato, CatalogoHato, FuenteHato, RegistroVistaHato } from './hatoTipos.ts';
export const COLUMNAS_HATO = {
  hato_animales: 'id,numero,nombre,sexo,etapa,raza,estado,fecha_estado,fecha_nacimiento,fecha_nacimiento_confianza,madre_id,padre_id,padre_toro_id,finca_id,origen,confianza,etapa_forzada',
  hato_toros: 'id,nombre',
  v_hato_estado_actual: 'animal_id,etapa,raza,estado,num_partos,ultimo_chequeo_fecha,ultimo_servicio_fecha,ultimo_parto_fecha,ultimo_secado_real_fecha,ultima_confirmacion_prenez_fecha,ultima_confirmacion_prenez_metodo,ultimo_evento_fecha,ultimo_aborto_fecha,ultimo_estado_chequeo,fecha_nacimiento,etapa_forzada',
  hato_config: 'clave,valor',
} as const;
const texto = (v: unknown) => v === null ? null : typeof v === 'string' ? v : undefined;
const referencia = (v: unknown) => v === null ? null : esUuid(v) ? v.toLowerCase() : undefined;
const fecha = (v: unknown) => v === null ? null : esFechaCalendario(v) ? v : undefined;
const numero = (v: unknown) => v === null ? null : typeof v === 'number' ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined;
const booleano = (v: unknown) => v === null ? null : typeof v === 'boolean' ? v : undefined;
function validarIds(rows: Record<string, unknown>[], campo: 'id' | 'animal_id') {
  if (rows.some(r => !r || !esUuid(r[campo])) || new Set(rows.map(r => (r[campo] as string).toLowerCase())).size !== rows.length) throw Error('identidades_hato_no_disponibles');
}
export function fuenteHatoSupabase(cliente: ClienteDatos, opciones: { tamanoPagina?: number } = {}): FuenteHato {
  const leer = (tabla: keyof typeof COLUMNAS_HATO, orden: readonly string[] = ['id']) => leerFilasFijas(cliente, tabla, COLUMNAS_HATO[tabla], undefined, opciones.tamanoPagina, orden);
  return {
    async catalogo() {
      const catalogo: CatalogoHato = {};
      const [animales, toros] = await Promise.allSettled([
        leer('hato_animales').then(rs => { validarIds(rs, 'id'); return rs; }),
        leer('hato_toros').then(rs => { validarIds(rs, 'id'); return rs; }),
      ]);
      if (animales.status === 'fulfilled') catalogo.animales = animales.value.map((r): AnimalHato => ({
        id: (r.id as string).toLowerCase(), numero: numero(r.numero), nombre: texto(r.nombre), sexo: texto(r.sexo), etapa: texto(r.etapa), raza: texto(r.raza), estado: texto(r.estado),
        fecha_estado: fecha(r.fecha_estado), fecha_nacimiento: fecha(r.fecha_nacimiento), fecha_nacimiento_confianza: texto(r.fecha_nacimiento_confianza),
        madre_id: referencia(r.madre_id), padre_id: referencia(r.padre_id), padre_toro_id: referencia(r.padre_toro_id), finca_id: referencia(r.finca_id),
        origen: texto(r.origen), confianza: texto(r.confianza), etapa_forzada: booleano(r.etapa_forzada),
      }));
      if (toros.status === 'fulfilled') catalogo.toros = toros.value.map(r => ({ id: (r.id as string).toLowerCase(), nombre: texto(r.nombre) }));
      return catalogo;
    },
    async leerEstadoActual() {
      const rows = await leer('v_hato_estado_actual', ['animal_id']); validarIds(rows, 'animal_id');
      return rows.map((r): RegistroVistaHato => ({
        animal_id: (r.animal_id as string).toLowerCase(), etapa: texto(r.etapa), raza: texto(r.raza), estado: texto(r.estado), num_partos: numero(r.num_partos),
        ultimo_chequeo_fecha: fecha(r.ultimo_chequeo_fecha), ultimo_servicio_fecha: fecha(r.ultimo_servicio_fecha), ultimo_parto_fecha: fecha(r.ultimo_parto_fecha), ultimo_secado_real_fecha: fecha(r.ultimo_secado_real_fecha),
        ultima_confirmacion_prenez_fecha: fecha(r.ultima_confirmacion_prenez_fecha), ultima_confirmacion_prenez_metodo: texto(r.ultima_confirmacion_prenez_metodo),
        ultimo_evento_fecha: fecha(r.ultimo_evento_fecha), ultimo_aborto_fecha: fecha(r.ultimo_aborto_fecha), ultimo_estado_chequeo: texto(r.ultimo_estado_chequeo), fecha_nacimiento: fecha(r.fecha_nacimiento), etapa_forzada: booleano(r.etapa_forzada),
      }));
    },
    async leerConfig() {
      const rows = await leer('hato_config', ['clave']);
      if (rows.some(r => !r || typeof r.clave !== 'string' || !r.clave.trim() || r.valor === undefined) || new Set(rows.map(r => r.clave)).size !== rows.length) throw Error('config_hato_no_leida');
      return rows.map(r => ({ clave: r.clave as string, valor: r.valor }));
    },
  };
}
