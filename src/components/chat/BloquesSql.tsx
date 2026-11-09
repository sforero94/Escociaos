import { filasTablaParaCanal, type Bloque } from '@/utils/escoSql/bloques';
import { formatearValor } from '@/utils/escoSql/formato';
import { graficaSql } from '@/utils/escoSqlChat';
import { ChatChart } from './ChatChart';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export function BloqueTabla({ bloque }: { bloque: Extract<Bloque, { tipo: 'tabla' }> }) {
  const filas = filasTablaParaCanal(bloque, 'web');
  return <section className="my-3 min-w-0 rounded-lg border bg-card p-3" aria-label={bloque.titulo}>
    <h3 className="mb-2 text-sm font-medium">{bloque.titulo}</h3>
    <div className="overflow-x-auto" role="region" aria-label={`Tabla ${bloque.titulo}`}>
      <Table className="tabular-nums" tabIndex={0} aria-label={bloque.titulo}><TableHeader><TableRow>{bloque.columnas.map((c) => <TableHead key={c.columna} scope="col">{c.etiqueta}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{filas.map((f, i) => <TableRow key={i}>{bloque.columnas.map((c) => <TableCell key={c.columna}>{formatearValor(f[c.columna], c.formato)}</TableCell>)}</TableRow>)}</TableBody></Table>
    </div>
    {bloque.filas.length > filas.length && <p className="mt-2 text-xs text-muted-foreground">Mostrando {filas.length} de {bloque.total_filas} filas. El informe incluye el detalle disponible.</p>}
  </section>;
}
export function TarjetaKpi({ bloque }: { bloque: Extract<Bloque, { tipo: 'tarjeta' }> }) {
  return <dl className="my-3 grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2">{bloque.items.map((i) => <div key={i.columna}><dt className="text-xs text-muted-foreground">{i.etiqueta}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{formatearValor(i.valor, i.formato)}</dd></div>)}</dl>;
}
export function BloquesSql({ bloques }: { bloques: Bloque[] }) {
  return <>{bloques.map((bloque, i) => <div key={i}>{bloque.tipo === 'tabla' ? <BloqueTabla bloque={bloque} /> : bloque.tipo === 'tarjeta' ? <TarjetaKpi bloque={bloque} /> : <ChatChart spec={graficaSql(bloque)} />}{bloque.aviso && <p role="status" className="text-xs text-muted-foreground">{bloque.aviso}</p>}</div>)}</>;
}
export function SugerenciasSql({ sugerencias, pregunta, opciones, onSelect, disabled = false }: { sugerencias: string[]; pregunta?: string; opciones?: string[]; onSelect: (texto: string) => void; disabled?: boolean }) {
  const preguntas = [...new Set([...(opciones ?? []), ...sugerencias])];
  if (!pregunta && !preguntas.length) return null;
  return <div className="space-y-2 pt-2 pl-9">{pregunta && <p className="text-sm">{pregunta}</p>}<div className="flex flex-wrap gap-2" aria-label="Preguntas de seguimiento">{preguntas.map((p) => <button key={p} type="button" disabled={disabled} onClick={() => onSelect(p)} className="min-h-11 rounded-full border px-3 py-2 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">{p}</button>)}</div></div>;
}
