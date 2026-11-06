import type { AnimalHato, ConsultaHato } from './hatoTipos.ts';
export interface ConsultaPesajesLeche extends ConsultaHato { desde: string; hasta: string }
export interface ConsultaLitrosQuincenales { desde: string; hasta: string }
export interface PesajeLeche { id: string; animal_id: string; fecha: string; litros_total: number | null; litros_am: number | null; litros_pm: number | null; fuente: string | null }
export interface QuincenaLeche { id: string; anio: number; mes: number; quincena: 1 | 2; fecha_inicio: string | null; fecha_fin: string | null; origen_dato: string; litros_total: number | null; fin_ingreso_id: string | null; num_vacas_ordeno: number | null; num_vacas_ordeno_origen: string | null }
export interface IngresoLitros { id: string; cantidad: number | null }
export interface DatosPesajesLeche { animales?: AnimalHato[]; pesajes?: PesajeLeche[] }
export interface DatosLitrosQuincenales { quincenas?: QuincenaLeche[]; ingresos?: IngresoLitros[] }
export interface FuenteLeche {
  leerPesajes(consulta: ConsultaPesajesLeche): Promise<PesajeLeche[]>;
  leerQuincenas(consulta: ConsultaLitrosQuincenales): Promise<QuincenaLeche[]>;
  leerIngresos(ids: string[]): Promise<IngresoLitros[]>;
}
export interface FilaPesajeLeche extends PesajeLeche { estado: 'completo' | 'historico_total' | 'turno_incompleto' | 'no_calculable'; litros_usable: number | null }
export interface ResumenPesajesLeche {
  animal_id: string; nombre: string | null; numero: number | null;
  suma_muestras: number | null; promedio_dias_pesados: number | null;
  cobertura: { dias_solicitados: number; dias_con_pesaje: number; dias_sin_fila: number; completos: number; historicos_total: number; incompletos: number; no_calculables: number };
}
export type EstadoLeche = 'ok' | 'parcial' | 'no_disponible' | 'no_resuelto' | 'aclaracion' | 'vacio_verificado';
export interface ResultadoPesajesLeche {
  tipo: 'pesajes_leche'; id: string; consulta: ConsultaPesajesLeche; estado: EstadoLeche; filas: FilaPesajeLeche[]; resumen: ResumenPesajesLeche[];
  alcance: { desde: string; hasta: string; hasta_recortado_a_hoy: boolean }; motivo?: string; avisos: string[]; fuente: 'lecturas_independientes';
}
export interface FilaLitrosQuincenales {
  id: string | null; anio: number; mes: number; quincena: 1 | 2; fecha_inicio: string; fecha_fin: string;
  fecha_inicio_registrada: string | null; fecha_fin_registrada: string | null;
  abierta: boolean; futura: boolean; origen_dato: string | null; litros: number | null;
  estado: 'usable' | 'sin_fila' | 'no_disponible' | 'no_calculable';
  vinculo_estado: 'visible' | 'sin_vinculo' | 'no_legible' | 'no_leido' | 'null_registrado' | 'no_aplica';
  fin_ingreso_id: string | null; num_vacas_ordeno: number | null; num_vacas_ordeno_origen: string | null; motivo?: string;
}
export interface SubtotalesLeche { medido: { litros: number | null; quincenas: number }; derivado_mensual: { litros: number | null; quincenas: number } }
export interface ResultadoLitrosQuincenales {
  tipo: 'litros_quincenales'; id: string; consulta: ConsultaLitrosQuincenales; estado: EstadoLeche; filas: FilaLitrosQuincenales[];
  subtotales: SubtotalesLeche; subtotales_abiertos: SubtotalesLeche; motivo?: string; avisos: string[]; fuente: 'lecturas_independientes';
}
