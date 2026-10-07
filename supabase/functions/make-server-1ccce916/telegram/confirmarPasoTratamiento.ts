// Flujo independiente de Deno/grammY: el transporte y las escrituras se
// inyectan desde la conversación, dentro de conversation.external().
import { fechaLegible, leerFecha } from "./fechaDDMM.ts";

export interface PasoTratamientoPendiente {
  id: string;
  nombre: string;
  descripcion: string | null;
  fecha_inicio: string;
  fecha_programada: string;
}

type Boton = { text: string; callback_data: string };
type Entrada = { texto?: string; callback?: string };
export interface TransportePasos {
  decir: (texto: string, botones?: Boton[][]) => Promise<void>;
  esperar: () => Promise<Entrada>;
}

const nuevo: Boton = { text: "💊 Registrar tratamiento nuevo", callback_data: "tp_nuevo" };
const terminar: Boton = { text: "✅ Terminar", callback_data: "tp_fin" };
const volver: Boton = { text: "↩️ Ver pendientes", callback_data: "tp_volver" };
const cancelar = (e: Entrada) => /^(\/cancelar(?:@\w+)?|cancelar)$/i.test(e.texto?.trim() ?? "") || e.callback === "cancel_flow";

/** true continúa el registro nuevo; false termina sin crear otro tratamiento. */
export async function ofrecerPasosPendientes(args: {
  hoy: string;
  transporte: TransportePasos;
  cargar: () => Promise<PasoTratamientoPendiente[]>;
  confirmar: (paso: PasoTratamientoPendiente, fecha: string) => Promise<void>;
}): Promise<boolean> {
  const { transporte: t, hoy } = args;
  let pasos: PasoTratamientoPendiente[];
  try {
    pasos = await args.cargar();
  } catch {
    await t.decir("No pude consultar los pasos pendientes. Puedes registrar un tratamiento nuevo; no se confirmó ningún paso.", [[nuevo], [terminar]]);
    while (true) {
      const e = await t.esperar();
      if (e.callback === "tp_nuevo") return true;
      if (e.callback === "tp_fin" || cancelar(e)) return false;
    }
  }
  if (!pasos.length) return true;

  let pagina = 0;
  while (pasos.length) {
    const visibles = pasos.slice(pagina * 6, pagina * 6 + 6);
    const botones = visibles.map((p, i) => [{
      text: `${i + 1}. ${p.nombre.slice(0, 35)} · ${fechaLegible(p.fecha_programada)}`,
      callback_data: `tp_paso_${pagina * 6 + i}`,
    }]);
    const paginas: Boton[] = [];
    if (pagina > 0) paginas.push({ text: "◀️ Anteriores", callback_data: "tp_anterior" });
    if ((pagina + 1) * 6 < pasos.length) paginas.push({ text: "Más pendientes ▶️", callback_data: "tp_siguiente" });
    if (paginas.length) botones.push(paginas);
    botones.push([nuevo], [terminar]);
    await t.decir(`Hay ${pasos.length} paso(s) sin confirmar. Elige el que ya aplicaste para registrar la fecha y cerrar su alerta. También puedes registrar un tratamiento nuevo.`, botones);
    const e = await t.esperar();
    if (e.callback === "tp_nuevo") return true;
    if (e.callback === "tp_fin" || cancelar(e)) return false;
    if (e.callback === "tp_anterior") { pagina = Math.max(0, pagina - 1); continue; }
    if (e.callback === "tp_siguiente") { pagina = Math.min(Math.ceil(pasos.length / 6) - 1, pagina + 1); continue; }
    const indice = /^tp_paso_(\d+)$/.exec(e.callback ?? "");
    if (!indice) continue;
    const paso = pasos[Number(indice[1])];
    // No aceptar callbacks viejos de otra página.
    if (!paso || !visibles.includes(paso)) continue;
    await t.decir(`${paso.nombre}${paso.descripcion ? `\n${paso.descripcion}` : ""}\nProgramado: ${fechaLegible(paso.fecha_programada)}\n¿Cuándo aplicaste este paso?`, [
      [{ text: `Hoy (${fechaLegible(hoy)})`, callback_data: "tp_hoy" }],
      [{ text: "📅 Otra fecha", callback_data: "tp_fecha" }], [volver], [nuevo],
    ]);
    let fecha: string | null = null;
    let salir = false;
    while (!fecha && !salir) {
      const entrada = await t.esperar();
      if (entrada.callback === "tp_nuevo") return true;
      if (cancelar(entrada)) return false;
      if (entrada.callback === "tp_volver") { salir = true; break; }
      if (entrada.callback === "tp_hoy") fecha = hoy;
      else if (entrada.callback === "tp_fecha") {
        await t.decir("Escribe la fecha real como DD/MM/AAAA. No se puede confirmar una aplicación futura.", [[volver], [nuevo]]);
      } else if (entrada.texto) {
        const leida = leerFecha(entrada.texto, hoy, "pasado", { requiereAnio: true });
        if (leida.tipo === "invalido") {
          await t.decir("Escribe una fecha válida con año: DD/MM/AAAA.", [[volver], [nuevo]]);
        } else if (leida.tipo === "unico") fecha = leida.fecha.iso;
        else {
          await t.decir("La fecha tiene dos lecturas. Elige la correcta:", [
            [{ text: leida.probable.etiqueta, callback_data: "tp_amb_0" }],
            [{ text: leida.alterna.etiqueta, callback_data: "tp_amb_1" }], [volver], [nuevo],
          ]);
          const eleccion = await t.esperar();
          if (eleccion.callback === "tp_nuevo") return true;
          if (cancelar(eleccion)) return false;
          if (eleccion.callback === "tp_amb_0") fecha = leida.probable.iso;
          else if (eleccion.callback === "tp_amb_1") fecha = leida.alterna.iso;
          else { salir = true; }
        }
      }
      if (fecha && (fecha > hoy || fecha < paso.fecha_inicio)) {
        await t.decir(`La fecha debe estar entre ${fechaLegible(paso.fecha_inicio)} y hoy. Escribe DD/MM/AAAA.`, [[volver], [nuevo]]);
        fecha = null;
      }
    }
    if (!fecha) continue;
    await t.decir(`Confirmar ${paso.nombre}\nAplicado el ${fechaLegible(fecha)}. Se cerrará la alerta de este paso.`, [
      [{ text: "✅ Confirmar aplicación", callback_data: "tp_confirmar" }], [volver], [nuevo],
    ]);
    const confirmacion = await t.esperar();
    if (confirmacion.callback === "tp_nuevo") return true;
    if (cancelar(confirmacion)) return false;
    if (confirmacion.callback !== "tp_confirmar") continue;
    try {
      await args.confirmar(paso, fecha);
    } catch {
      await t.decir("No pude confirmar el paso. Puede haber cambiado; no se sobrescribirá una fecha existente. Puedes revisar los pendientes o registrar uno nuevo.");
      continue;
    }
    // Fuera del catch de escritura: un fallo de transporte no puede decir
    // que el paso no se guardó. El llamante marca escrito antes del reply.
    pasos = pasos.filter((p) => p.id !== paso.id);
    pagina = Math.min(pagina, Math.max(0, Math.ceil(pasos.length / 6) - 1));
    await t.decir(`✅ Paso confirmado el ${fechaLegible(fecha)}; alerta cerrada.`, [
      ...(pasos.length ? [[volver]] : []), [nuevo], [terminar],
    ]);
    while (true) {
      const siguiente = await t.esperar();
      if (siguiente.callback === "tp_nuevo") return true;
      if (siguiente.callback === "tp_fin" || cancelar(siguiente)) return false;
      if (siguiente.callback === "tp_volver" && pasos.length) break;
    }
  }
  return false;
}
