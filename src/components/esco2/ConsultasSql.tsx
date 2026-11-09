import type { ResultadoPruebaEsco2 } from '../../utils/esco2ClientePrueba';

/** Desplegable con las consultas SQL que hizo el modelo, sus filas y errores. */
export function ConsultasSql({ consultas }: { consultas: NonNullable<ResultadoPruebaEsco2['consultas']> }) {
  return (
    <details className="rounded-lg border bg-muted/30 p-3 text-sm">
      <summary className="cursor-pointer font-medium">Consultas usadas ({consultas.length})</summary>
      <ol className="mt-3 space-y-4">
        {consultas.map((c, i) => (
          <li key={i} className="space-y-1">
            <p className="font-medium">{i + 1}. {c.proposito || 'Sin propósito'}</p>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-background p-2 text-xs">{c.sql}</pre>
            {c.error ? <p role="alert" className="text-destructive">Error de Postgres: {c.error}</p> : (
              <p className="text-muted-foreground">
                {c.n_filas ?? 0} fila(s){c.truncado ? ' — TRUNCADO a 500 filas' : ''}.
                {c.n_filas === 0 ? ' Sin datos.' : ''}
              </p>
            )}
            {c.filas_muestra.length ? (
              <pre className="max-h-48 overflow-auto rounded bg-background p-2 text-xs">{JSON.stringify(c.filas_muestra, null, 1)}</pre>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
