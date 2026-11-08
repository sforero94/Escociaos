import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { ENDPOINT_PRUEBA_ESCO2, agregarTurnoHistorial, cerrarSesionPruebaEsco2, ejecutarPruebaEsco2, type MensajePruebaEsco2, type MotorPruebaEsco2, type ResultadoPruebaEsco2 } from '../../utils/esco2ClientePrueba';
import { textoHistorialSql } from '../../utils/escoSql/loop';

const PREGUNTA_INICIAL = '¿Cuántos jornales se registraron ayer? Sin desglose por persona.';

type EstadoPrueba =
  | { tipo: 'pendiente' }
  | { tipo: 'en_curso' }
  | { tipo: 'respuesta'; resultado: ResultadoPruebaEsco2 }
  | { tipo: 'error'; mensaje: string };

/** A new session mounts a fresh screen, so prior answers never cross user boundaries. */
export function Esco2AccessCheck() {
  const { user, profile } = useAuth();
  if (!user) return null;
  return <PruebaSesion key={`${user.id}:${profile?.rol ?? ''}`} usuarioId={user.id} rol={profile?.rol ?? 'Sin confirmar'} />;
}

function PruebaSesion({ usuarioId, rol }: { usuarioId: string; rol: string }) {
  const [pregunta, setPregunta] = useState(PREGUNTA_INICIAL);
  // Motor: el actual (planificador) o el loop de SQL de lectura. Cambiarlo reinicia la conversación.
  const [motor, setMotor] = useState<MotorPruebaEsco2>('actual');
  const [estado, setEstado] = useState<EstadoPrueba>({ tipo: 'pendiente' });
  const [conversacion, setConversacion] = useState<Pick<ResultadoPruebaEsco2, 'estadoToken' | 'opcionesAclaracion'>>({});
  // Prior turns, sent so a follow-up keeps its period, lots and tasks. Cleared with the context.
  const [historial, setHistorial] = useState<MensajePruebaEsco2[]>([]);
  const [errorPregunta, setErrorPregunta] = useState('');
  const [cambiandoCuenta, setCambiandoCuenta] = useState(false);
  const cambioCuenta = useRef(false);
  const montado = useRef(true);
  const peticion = useRef<AbortController | null>(null);
  const enCurso = estado.tipo === 'en_curso';

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; peticion.current?.abort(); peticion.current = null; };
  }, []);

  async function cambiarCuenta() {
    if (cambioCuenta.current) return;
    cambioCuenta.current = true;
    setCambiandoCuenta(true);
    peticion.current?.abort();
    peticion.current = null;
    setEstado({ tipo: 'pendiente' });
    setConversacion({});
    setHistorial([]);
    try {
      await cerrarSesionPruebaEsco2();
    } catch {
      if (montado.current) setEstado({ tipo: 'error', mensaje: 'No se pudo cerrar la sesión local. Intenta cambiar de cuenta otra vez.' });
    } finally {
      cambioCuenta.current = false;
      if (montado.current) setCambiandoCuenta(false);
    }
  }

  function cancelar(mensaje = 'Prueba cancelada. El resultado del servidor queda sin confirmar.') {
    peticion.current?.abort();
    peticion.current = null;
    setEstado({ tipo: 'error', mensaje });
    setConversacion({});
    setHistorial([]);
  }

  async function comprobar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    await enviar(pregunta);
  }

  function nuevaConsulta() {
    if (peticion.current || cambioCuenta.current) return;
    setConversacion({});
    setHistorial([]);
    setEstado({ tipo: 'pendiente' });
    setErrorPregunta('');
    setPregunta(PREGUNTA_INICIAL);
  }

  async function enviar(preguntaTurno: string, respuestaAclaracion?: string) {
    if (peticion.current || cambioCuenta.current) return;
    const texto = preguntaTurno.trim();
    if (!texto || texto.length > 1000) {
      setErrorPregunta('Escribe una pregunta de entre 1 y 1000 caracteres.');
      return;
    }
    setErrorPregunta('');
    const controlador = new AbortController();
    peticion.current = controlador;
    setEstado({ tipo: 'en_curso' });
    const tiempo = setTimeout(() => {
      if (peticion.current === controlador) cancelar('La solicitud superó 45 segundos. El resultado del servidor queda sin confirmar. No se reintenta automáticamente.');
    }, 45000);
    try {
      const resultado = await ejecutarPruebaEsco2(texto, usuarioId, controlador.signal, {
        ...(conversacion.estadoToken ? { estadoToken: conversacion.estadoToken } : {}),
        ...(respuestaAclaracion ? { respuestaAclaracion } : {}),
        ...(historial.length ? { historial } : {}),
        ...(motor === 'sql' ? { motor } : {}),
      });
      if (peticion.current === controlador && !controlador.signal.aborted) {
        setEstado({ tipo: 'respuesta', resultado });
        setConversacion(resultado.valida ? { estadoToken: resultado.estadoToken, opcionesAclaracion: resultado.opcionesAclaracion } : {});
        if (resultado.valida && resultado.respuesta) setHistorial(previo => agregarTurnoHistorial(previo, texto, motor === 'sql' ? textoHistorialSql(resultado.respuesta!, resultado.consultas ?? []) : resultado.respuesta!));
      }
    } catch {
      if (peticion.current === controlador) {
        setEstado({ tipo: 'error', mensaje: controlador.signal.aborted
            ? 'Prueba cancelada. El resultado del servidor queda sin confirmar.'
            : 'No se pudo completar la prueba. Comprueba la sesión y la conexión.' });
      }
    } finally {
      clearTimeout(tiempo);
      if (peticion.current === controlador) peticion.current = null;
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Prueba de acceso a Esco 2.0</h1>
            <p className="text-muted-foreground">Sesión actual: <strong className="text-foreground">{rol}</strong></p>
          </div>
          <Button variant="outline" className="min-h-11" disabled={cambiandoCuenta} onClick={() => void cambiarCuenta()}>{cambiandoCuenta ? 'Cerrando sesión local…' : 'Cambiar de cuenta'}</Button>
        </header>

        <section className="rounded-xl border bg-card p-5 space-y-3" aria-label="Alcance de la prueba">
          <p>Esta pantalla local consulta la función desplegada. Cada envío puede leer datos y usar el modelo.</p>
          <p className="text-sm text-muted-foreground">Resultado esperado: Gerencia activa, HTTP 200 con respuesta válida. Administrador, HTTP 403. Esto no sustituye la evaluación independiente.</p>
          <p className="break-all text-sm"><span className="font-medium">Destino: </span>{ENDPOINT_PRUEBA_ESCO2}</p>
        </section>

        <form onSubmit={comprobar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="motor-esco2">Motor</Label>
            <select
              id="motor-esco2"
              value={motor}
              disabled={enCurso || cambiandoCuenta}
              onChange={e => { setMotor(e.target.value as MotorPruebaEsco2); setConversacion({}); setHistorial([]); setEstado({ tipo: 'pendiente' }); }}
              className="block min-h-11 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="actual">Motor: actual</option>
              <option value="sql">Motor: SQL</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pregunta-esco2">Pregunta de prueba</Label>
            <Textarea id="pregunta-esco2" value={pregunta} onChange={e => { setPregunta(e.target.value); setErrorPregunta(''); }} maxLength={1000} disabled={enCurso || cambiandoCuenta} rows={3} aria-invalid={Boolean(errorPregunta)} aria-describedby={errorPregunta ? 'error-pregunta-esco2' : undefined} />
            {errorPregunta ? <p id="error-pregunta-esco2" className="text-sm text-destructive" role="alert">{errorPregunta}</p> : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" className="min-h-11" disabled={enCurso || cambiandoCuenta || !pregunta.trim()}>{enCurso ? 'Comprobando…' : 'Comprobar acceso'}</Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={enCurso || cambiandoCuenta} onClick={nuevaConsulta}>Nueva consulta</Button>
            {historial.length ? <p className="self-center text-sm text-muted-foreground">Conversación en curso: {historial.length / 2} turno(s). «Nueva consulta» la reinicia.</p> : null}
            {enCurso ? <Button type="button" variant="outline" className="min-h-11" onClick={() => cancelar()}>Cancelar</Button> : null}
          </div>
        </form>

        <section aria-label="Resultado de la prueba" aria-live="polite" aria-busy={enCurso} className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="text-lg font-semibold">Resultado</h2>
          {estado.tipo === 'pendiente' ? <p>Sin comprobar. Pulsa «Comprobar acceso» para enviar una sola solicitud.</p> : null}
          {enCurso ? <p>Solicitud en curso. No se enviarán reintentos automáticos.</p> : null}
          {estado.tipo === 'error' ? <p role="alert" className="text-destructive">{estado.mensaje}</p> : null}
          {estado.tipo === 'respuesta' ? <Resultado resultado={estado.resultado} /> : null}
          {conversacion.estadoToken && Boolean(conversacion.opcionesAclaracion?.length) ? (
            <div className="space-y-3" role="group" aria-label="Opciones de aclaración">
              <p>Elige una opción para continuar.</p>
              <div className="flex flex-wrap gap-3">
                {conversacion.opcionesAclaracion?.map(opcion => (
                  <Button key={opcion.id} type="button" variant="outline" className="min-h-11 whitespace-normal" disabled={enCurso || cambiandoCuenta} onClick={() => enviar(opcion.etiqueta, opcion.id)}>{opcion.etiqueta}</Button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Resultado({ resultado }: { resultado: ResultadoPruebaEsco2 }) {
  return (
    <>
      <p className="font-medium tabular-nums">HTTP {resultado.http}</p>
      <p>{resultado.valida ? 'Respuesta válida recibida. Revisa las cifras; la aceptación funcional sigue pendiente.' : resultado.http === 403 ? 'El servidor rechazó el acceso.' : 'La prueba no obtuvo una respuesta funcional válida.'}</p>
      {resultado.error ? <p role="alert" className="text-destructive">{resultado.error}</p> : null}
      {resultado.respuesta ? <p className="whitespace-pre-wrap leading-relaxed">{resultado.respuesta}</p> : null}
      {resultado.consultas ? <ConsultasSql consultas={resultado.consultas} /> : null}
      {resultado.origen ? <p className="text-sm text-muted-foreground">Origen: {resultado.origen}. Ruta: {resultado.ruta ?? 'Sin composición'}. Duración: {resultado.ms ?? 'Sin confirmar'} ms.</p> : null}
    </>
  );
}

function ConsultasSql({ consultas }: { consultas: NonNullable<ResultadoPruebaEsco2['consultas']> }) {
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
