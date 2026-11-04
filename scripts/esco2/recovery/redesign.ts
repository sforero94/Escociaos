// B: after the shared arithmetic, claims become the sole answer representation.
import { calcularNativo, denegada, permiso, prepararEntrada, proyectarClaims, renderClaims, seguridad } from './shared.ts';
import type { EntradaExperimento, SalidaExperimento } from './contracts.ts';
export function executeRedesign(input: EntradaExperimento): SalidaExperimento {
    if (!permiso(input))
        return denegada(input, 'redesign');
    const { entrada, estado, bloqueadas } = prepararEntrada(input);
    const natives = entrada.obligaciones.map(o => calcularNativo(entrada, o, bloqueadas.has(o.id)));
    // Obligation-local claim blocks carry factual identity through the renderer.
    const resultados = natives.map(n => proyectarClaims(n, entrada));
    return { variante: 'redesign', resultados, texto: renderClaims(resultados), estado, seguridad: seguridad(input, natives) };
}
export async function runRedesign(input: EntradaExperimento): Promise<SalidaExperimento> { return executeRedesign(input); }
