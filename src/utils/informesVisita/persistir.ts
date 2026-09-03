import { getSupabase } from '@/utils/supabase/client';
import {
  BUCKET_INFORMES_VISITA,
  type DecisionSnippet,
  type FotoExtraida,
  type InformeVisitaCabecera,
  type SnippetPropuesto,
} from '@/types/informesVisita';
import { snippetsListosParaPersistir } from './confirmar';
import { sanitizarTemas } from './temas';

export interface PersistirInformeInput {
  archivo: File;
  archivoBytes: ArrayBuffer;
  cabecera: InformeVisitaCabecera;
  propuestas: SnippetPropuesto[];
  decisiones: DecisionSnippet[];
  extras: SnippetPropuesto[];
  fotos: FotoExtraida[];
  texto: string;
  sinTexto: boolean;
}

export interface PersistirInformeResultado {
  informeId: string;
  snippetsInsertados: number;
  fotosInsertadas: number;
}

function nombreSeguro(nombre: string): string {
  return nombre.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
}

/**
 * Persiste cabecera + fotos + SOLO snippets confirmados o la nota abierta.
 * Si hay propuestas sin decidir, lanza y no escribe nada.
 */
export async function persistirInforme(input: PersistirInformeInput): Promise<PersistirInformeResultado> {
  const confirmadas = snippetsListosParaPersistir(input.propuestas, input.decisiones, input.extras);
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
    const { error: snipErr } = await sb.from('informes_visita_snippets').insert(
      confirmadas.map((s) => ({
        informe_id: informeId,
        texto: s.texto,
        cita_word: s.cita_word,
        origen: s.origen,
        tipo: s.tipo,
        insumo: s.insumo,
        plaga: s.plaga,
        temas: sanitizarTemas(s.temas),
        foto_id: s.foto_indice !== null ? (fotoIdPorOrden.get(s.foto_indice) ?? null) : null,
      })),
    );
    if (snipErr) {
      await sb.from('informes_visita').delete().eq('id', informeId);
      throw new Error(`No se pudieron guardar los snippets: ${snipErr.message}`);
    }
  }

  return {
    informeId,
    snippetsInsertados: confirmadas.length,
    fotosInsertadas: fotosMeta.length,
  };
}
