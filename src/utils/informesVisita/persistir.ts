import { getSupabase } from '@/utils/supabase/client';
import {
  BUCKET_INFORMES_VISITA,
  type DecisionFila,
  type FilaPropuesta,
  type FotoExtraida,
  type InformeVisitaCabecera,
} from '@/types/informesVisita';
import { filasListasParaPersistir } from './confirmar';

export interface PersistirInformeInput {
  archivo: File;
  archivoBytes: ArrayBuffer;
  cabecera: InformeVisitaCabecera;
  propuestas: FilaPropuesta[];
  decisiones: DecisionFila[];
  fotos: FotoExtraida[];
  texto: string;
  sinTexto: boolean;
}

export interface PersistirInformeResultado {
  informeId: string;
  filasInsertadas: number;
  fotosInsertadas: number;
}

function nombreSeguro(nombre: string): string {
  return nombre.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
}

/**
 * Persiste cabecera + fotos + SOLO las filas que pasaron la puerta de
 * confirmación. Si hay propuestas sin decidir, lanza y no escribe nada.
 */
export async function persistirInforme(input: PersistirInformeInput): Promise<PersistirInformeResultado> {
  const confirmadas = filasListasParaPersistir(input.propuestas, input.decisiones);
  const informeId = crypto.randomUUID();
  const sb = getSupabase() as any;
  const archivoPath = `${informeId}/original.docx`;

  const { error: upErr } = await sb.storage
    .from(BUCKET_INFORMES_VISITA)
    .upload(archivoPath, input.archivoBytes, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false,
    });
  if (upErr) throw new Error(`No se pudo guardar el archivo: ${upErr.message}`);

  const fotosMeta: Array<{ orden: number; storage_path: string; pie_de_foto: string | null; nombre_original: string }> = [];
  for (const foto of input.fotos) {
    const storagePath = `${informeId}/fotos/${String(foto.orden).padStart(3, '0')}_${nombreSeguro(foto.nombre)}`;
    const blob = new Blob([new Uint8Array(foto.bytes)], { type: foto.mime });
    const { error: fErr } = await sb.storage
      .from(BUCKET_INFORMES_VISITA)
      .upload(storagePath, blob, { contentType: foto.mime, upsert: false });
    if (fErr) throw new Error(`No se pudo guardar la foto ${foto.nombre}: ${fErr.message}`);
    fotosMeta.push({
      orden: foto.orden,
      storage_path: storagePath,
      pie_de_foto: foto.pieDeFoto,
      nombre_original: foto.nombre,
    });
  }

  const { error: infErr } = await sb.from('informes_visita').insert({
    id: informeId,
    fecha_visita: input.cabecera.fecha_visita,
    agronoma: input.cabecera.agronoma,
    finca: input.cabecera.finca,
    especie: input.cabecera.especie,
    fenologia: input.cabecera.fenologia,
    materia_seca: input.cabecera.materia_seca,
    proyeccion_cosecha: input.cabecera.proyeccion_cosecha,
    archivo_path: archivoPath,
    archivo_nombre: input.archivo.name,
    texto_extraido: input.sinTexto ? null : (input.texto || null),
    sin_texto: input.sinTexto,
  });
  if (infErr) throw new Error(`No se pudo crear el informe: ${infErr.message}`);

  const fotoIdPorOrden = new Map<number, string>();
  if (fotosMeta.length > 0) {
    const { data: fotosInsertadas, error: fotosErr } = await sb
      .from('informes_visita_fotos')
      .insert(fotosMeta.map((f) => ({
        informe_id: informeId,
        storage_path: f.storage_path,
        pie_de_foto: f.pie_de_foto,
        orden: f.orden,
        nombre_original: f.nombre_original,
      })))
      .select('id, orden');
    if (fotosErr) {
      await sb.from('informes_visita').delete().eq('id', informeId);
      throw new Error(`No se pudieron guardar las fotos: ${fotosErr.message}`);
    }
    for (const f of fotosInsertadas ?? []) {
      fotoIdPorOrden.set(f.orden as number, f.id as string);
    }
  }

  if (confirmadas.length > 0) {
    const { error: obsErr } = await sb.from('observaciones_agronomicas').insert(
      confirmadas.map((f) => ({
        informe_id: informeId,
        fecha: f.fecha,
        fecha_contexto: f.fecha_contexto,
        tipo: f.tipo,
        lote: f.lote,
        lote_id: f.lote_id,
        plaga_enfermedad: f.plaga_enfermedad,
        accion: f.accion,
        insumo: f.insumo,
        dosis: f.dosis,
        unidad: f.unidad,
        periodo_carencia_dias: f.periodo_carencia_dias,
        via: f.via,
        incidencia: f.incidencia,
        severidad: f.severidad,
        notas: f.notas,
        foto_id: f.foto_indice !== null ? (fotoIdPorOrden.get(f.foto_indice) ?? null) : null,
      })),
    );
    if (obsErr) {
      await sb.from('informes_visita').delete().eq('id', informeId);
      throw new Error(`No se pudieron guardar las observaciones: ${obsErr.message}`);
    }
  }

  return {
    informeId,
    filasInsertadas: confirmadas.length,
    fotosInsertadas: fotosMeta.length,
  };
}
