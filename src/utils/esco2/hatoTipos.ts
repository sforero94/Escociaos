import type { EstadoReproductivoDerivado, MetodoConfirmacionPrenez, TipoEstado } from '../calculosHato.ts';
import type { AnimalHatoClasificado } from '../hatoCategorias.ts';
import type { FilaHatoConfig } from '../hatoConfigDesdeTabla.ts';
export interface ConsultaHato { animal_ids: string[]; nombres: string[]; chapetas: number[] }
// undefined = campo no leído; null = NULL registrado. Identidad por UUID, nunca chapeta.
export interface AnimalHato {
  id: string; numero?: number | null; nombre?: string | null; sexo?: string | null;
  etapa?: string | null; raza?: string | null; estado?: string | null;
  fecha_estado?: string | null; fecha_nacimiento?: string | null; fecha_nacimiento_confianza?: string | null;
  madre_id?: string | null; padre_id?: string | null; padre_toro_id?: string | null; finca_id?: string | null;
  origen?: string | null; confianza?: string | null; etapa_forzada?: boolean | null;
}
export interface RegistroVistaHato { animal_id: string; num_partos?: number | null; [campo: string]: unknown }
export interface CatalogoHato { animales?: AnimalHato[]; toros?: { id: string; nombre?: string | null }[] }
export interface DatosHato extends CatalogoHato { estados?: RegistroVistaHato[]; config?: FilaHatoConfig[] }
export interface FuenteHato {
  catalogo(): Promise<CatalogoHato>;
  leerEstadoActual(): Promise<RegistroVistaHato[]>;
  leerConfig(): Promise<FilaHatoConfig[]>;
}
export interface ParienteHato {
  estado: 'visible' | 'sin_vinculo' | 'no_legible' | 'no_leido'; nombre?: string | null; numero?: number | null;
}
export interface HechosReproduccionHato {
  ultimo_parto_fecha?: string | null; ultimo_servicio_fecha?: string | null;
  ultima_confirmacion_prenez_fecha?: string | null; ultima_confirmacion_prenez_metodo?: MetodoConfirmacionPrenez | null;
  ultimo_secado_real_fecha?: string | null; ultimo_aborto_fecha?: string | null;
  ultimo_chequeo_fecha?: string | null; ultimo_evento_fecha?: string | null;
  ultimo_estado_chequeo?: TipoEstado | null;
}
export interface ReproduccionHato {
  estado: 'ok' | 'no_disponible'; num_partos: number | null;
  num_partos_estado: 'valor' | 'null_registrado' | 'no_leido' | 'sin_fila' | 'no_calculable';
  hechos: HechosReproduccionHato | null;
  derivado: EstadoReproductivoDerivado | null;
  categoria: AnimalHatoClasificado['categoria']; categoria_origen: AnimalHatoClasificado['categoriaOrigen'];
  subetapa_ternera: AnimalHatoClasificado['subetapaTernera']; motivo?: string;
}
export interface FilaHato {
  animal_id: string; nombre: string | null; numero: number | null; numero_provisional: boolean;
  ficha: Omit<AnimalHato, 'id'> & {
    campos_no_leidos: string[];
    parentescos: { madre: ParienteHato; padre: ParienteHato; padre_toro: ParienteHato };
  };
  reproduccion: ReproduccionHato; estado: 'ok' | 'parcial';
}
export interface ResultadoHato {
  tipo: 'hato'; id: string; consulta: ConsultaHato; fecha_referencia: string;
  estado: 'ok' | 'parcial' | 'no_disponible' | 'no_resuelto' | 'aclaracion' | 'vacio_verificado';
  filas: FilaHato[]; motivo?: string; fuente: 'lecturas_independientes';
}
