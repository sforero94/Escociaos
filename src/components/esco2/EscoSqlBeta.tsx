import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Loader2, RotateCcw, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import {
  agregarTurnoHistorial,
  ejecutarPruebaEsco2,
  type ConsultaPruebaSql,
  type MensajePruebaEsco2,
} from '../../utils/esco2ClientePrueba';
import { textoHistorialSql } from '../../utils/escoSql/loop';
import { ConsultasSql } from './ConsultasSql';

const TIEMPO_MAX_MS = 45000;
const MAX_PREGUNTA = 1000;

type Turno =
  | { rol: 'user'; texto: string }
  | { rol: 'assistant'; texto: string; consultas: ConsultaPruebaSql[]; ms?: number }
  | { rol: 'error'; texto: string };

/**
 * Esco SQL (beta): el loop de SQL de lectura (migración 192) como conversación, solo Gerencia.
 * Usa la función `esco-consultas` con `motor: 'sql'`. No reemplaza al Esco del panel lateral.
 * Cada respuesta trae el desplegable con las consultas que hizo el modelo.
 */
export function EscoSqlBeta({ compacto = false }: { compacto?: boolean } = {}) {
  const { user } = useAuth();
  if (!user) return null;
  return <Conversacion key={user.id} usuarioId={user.id} compacto={compacto} />;
}

function Conversacion({ usuarioId, compacto }: { usuarioId: string; compacto: boolean }) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [historial, setHistorial] = useState<MensajePruebaEsco2[]>([]);
  const [pregunta, setPregunta] = useState('');
  const [enCurso, setEnCurso] = useState(false);
  const peticion = useRef<AbortController | null>(null);
  const fin = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => { peticion.current?.abort(); peticion.current = null; }, []);
  useEffect(() => { fin.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }); }, [turnos, enCurso]);

  function nueva() {
    peticion.current?.abort();
    peticion.current = null;
    setTurnos([]);
    setHistorial([]);
    setPregunta('');
    setEnCurso(false);
  }

  async function enviar(evento?: FormEvent) {
    evento?.preventDefault();
    const texto = pregunta.trim();
    if (!texto || enCurso || peticion.current) return;
    if (texto.length > MAX_PREGUNTA) {
      setTurnos(t => [...t, { rol: 'error', texto: `La pregunta pasa de ${MAX_PREGUNTA} caracteres. Acórtala.` }]);
      return;
    }
    const controlador = new AbortController();
    peticion.current = controlador;
    setEnCurso(true);
    setPregunta('');
    setTurnos(t => [...t, { rol: 'user', texto }]);
    const tiempo = setTimeout(() => controlador.abort(), TIEMPO_MAX_MS);
    try {
      const r = await ejecutarPruebaEsco2(texto, usuarioId, controlador.signal, { motor: 'sql', ...(historial.length ? { historial } : {}) });
      if (controlador.signal.aborted) return;
      if (r.valida && r.respuesta) {
        const respuesta = r.respuesta;
        setTurnos(t => [...t, { rol: 'assistant', texto: respuesta, consultas: r.consultas ?? [], ms: r.ms }]);
        setHistorial(h => agregarTurnoHistorial(h, texto, textoHistorialSql(respuesta, r.consultas ?? [])));
      } else {
        const motivo = r.http === 403
          ? 'Esco SQL es solo para Gerencia. Tu cuenta no tiene acceso.'
          : r.http === 503
            ? 'El motor SQL no está disponible ahora mismo. Intenta de nuevo en un momento.'
            : r.error ?? 'No se pudo obtener una respuesta.';
        setTurnos(t => [...t, { rol: 'error', texto: motivo }]);
      }
    } catch (e) {
      if (peticion.current === controlador) {
        const cancelada = controlador.signal.aborted;
        setTurnos(t => [...t, {
          rol: 'error',
          texto: cancelada
            ? 'La solicitud superó 45 segundos y se canceló. Prueba con una pregunta más acotada.'
            : e instanceof Error && e.message ? e.message : 'No se pudo completar la solicitud.',
        }]);
      }
    } finally {
      clearTimeout(tiempo);
      if (peticion.current === controlador) {
        peticion.current = null;
        setEnCurso(false);
      }
    }
  }

  function alTeclear(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void enviar();
    }
  }

  return (
    <div className={compacto ? 'flex h-full min-h-0 flex-col gap-3 p-3' : 'mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 md:px-0'}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          {compacto ? (
            <p className="text-sm text-muted-foreground">Abre «Consultas usadas» para ver de dónde salió cada cifra.</p>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-brand-brown">Esco SQL <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 align-middle text-xs font-medium text-primary">beta</span></h1>
              <p className="text-sm text-muted-foreground">
                Pregunta por los datos de la finca. Esco escribe una consulta de solo lectura, la ejecuta con tus permisos y responde con lo que devuelve. Abre «Consultas usadas» para revisar de dónde salió cada cifra.
              </p>
            </>
          )}
        </div>
        <Button variant="outline" className="min-h-11" onClick={nueva} disabled={!turnos.length && !enCurso}>
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          Nueva conversación
        </Button>
      </header>

      <section aria-label="Conversación" aria-live="polite" className={compacto ? 'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto' : 'flex min-h-[40vh] flex-col gap-4'}>
        {turnos.length === 0 && !enCurso ? (
          <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            <p className="mb-2 font-medium text-foreground">Ejemplos</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>¿Cuántos jornales se trabajaron en octubre?</li>
              <li>¿Cuáles son las 5 categorías de gasto más grandes este año?</li>
              <li>¿Cuánta lluvia cayó en octubre?</li>
            </ul>
          </div>
        ) : null}

        {turnos.map((t, i) => t.rol === 'user' ? (
          <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2 text-primary-foreground">{t.texto}</div>
        ) : t.rol === 'error' ? (
          <p key={i} role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{t.texto}</p>
        ) : (
          <div key={i} className="max-w-[95%] space-y-3 rounded-2xl border bg-card px-4 py-3">
            <p className="whitespace-pre-wrap leading-relaxed">{t.texto}</p>
            {t.consultas.length ? <ConsultasSql consultas={t.consultas} /> : null}
            {typeof t.ms === 'number' ? <p className="text-xs text-muted-foreground">{(t.ms / 1000).toFixed(1).replace('.', ',')} s</p> : null}
          </div>
        ))}

        {enCurso ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Consultando los datos…
          </p>
        ) : null}
        <div ref={fin} />
      </section>

      <form onSubmit={enviar} className="sticky bottom-0 flex items-end gap-2 bg-background pb-2 pt-2">
        <Textarea
          value={pregunta}
          onChange={e => setPregunta(e.target.value)}
          onKeyDown={alTeclear}
          rows={2}
          maxLength={MAX_PREGUNTA}
          disabled={enCurso}
          placeholder="Escribe tu pregunta…"
          aria-label="Pregunta para Esco SQL"
        />
        <Button type="submit" className="min-h-11" disabled={enCurso || !pregunta.trim()} aria-label="Enviar pregunta">
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}
