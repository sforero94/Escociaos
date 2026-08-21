import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Guard: prohíbe `fixed inset-0` a mano bajo `src/components/aplicaciones/`.
 *
 * Regla 4 del contrato de Fase 0 (`CONTRATO_FASE0.md`): los diálogos del proyecto van con
 * `Dialog` + `DialogContent size` + `DialogBody` (Radix, accesible por defecto — foco
 * atrapado, Escape, backdrop). Un `<div className="fixed inset-0 ...">` a mano reimplementa
 * un modal sin nada de eso: sin trap de foco, sin cierre con Escape, invisible para lectores
 * de pantalla como diálogo.
 *
 * `dialogScrollContract.test.ts` ya vigila el contrato de scroll de `DialogContent`, pero
 * solo mira `DialogContent` — no puede ver los modales hechos a mano porque no usan ese
 * componente en absoluto.
 *
 * El módulo arrancó con exactamente 5 de estos (ver ALLOWLIST original en el historial de
 * git): son la Fase 0 encontrándolos, no la Fase 0 introduciéndolos. W00 (Lista/Detalle/Iniciar
 * Ejecución), W03 (Cierre) y W01 (Calculadora — este cambio) ya migraron los 5 a
 * `Dialog`/`AlertDialog` reales o a `AplicacionShell` (Cierre, página completa en vez de modal
 * falso). La confirmación de "¿Cancelar aplicación?" de `CalculadoraAplicaciones.tsx` era el
 * último: pasó de un `<div className="fixed inset-0 ...">` a mano a `ConfirmDialog` (`AlertDialog`
 * de Radix, regla 6 del contrato — es una acción destructiva/irreversible). La ALLOWLIST queda
 * vacía — no es un permiso permanente, así que el guard no admite ningún archivo nuevo: cualquiera
 * bajo este módulo que use `fixed inset-0` hace fallar el test, con los nombres de archivo
 * listados en el mensaje de fallo.
 *
 * Busca solo dentro de valores de `className` (atributo JSX, string u objeto de plantilla),
 * nunca en texto plano del archivo — así un comentario que *mencione* "fixed inset-0" (como
 * este mismo, o el de AplicacionShell.tsx explicando la migración) no cuenta como violación.
 */

const APLICACIONES_DIR = join(__dirname, '..', 'components', 'aplicaciones');

/**
 * Los 5 modales hechos a mano que existían al arrancar Fase 0/1 ya migraron todos —
 * `CalculadoraAplicaciones.tsx` era el último (ver docstring de arriba). Esta lista queda
 * vacía a propósito: no es un permiso permanente, y la tercera prueba de este archivo
 * (`la allowlist no contiene ningún archivo que ya haya migrado`) falla si alguien agrega
 * una entrada que ya no tiene `fixed inset-0`.
 */
const ALLOWLIST = new Set<string>([]);

function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsx(full, out);
    } else if (entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** `true` si algún `className="..."`, `className={'...'}` o `className={\`...\`}` del archivo
 * contiene literalmente "fixed inset-0". No mira comentarios ni el resto del código fuente. */
function usaFixedInsetAMano(source: string): boolean {
  const classNameRe = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g;
  let m: RegExpExecArray | null;
  while ((m = classNameRe.exec(source)) !== null) {
    const valor = m[1] ?? m[2] ?? m[3] ?? '';
    if (valor.includes('fixed inset-0')) {
      return true;
    }
  }
  return false;
}

describe('guard: fixed inset-0 a mano en src/components/aplicaciones/', () => {
  const files = collectTsx(APLICACIONES_DIR);

  it('encuentra archivos del módulo para auditar', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('ningún archivo fuera de la allowlist usa "fixed inset-0" a mano', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(APLICACIONES_DIR, file).replace(/\\/g, '/');
      if (ALLOWLIST.has(rel)) continue;

      if (usaFixedInsetAMano(readFileSync(file, 'utf-8'))) {
        offenders.push(rel);
      }
    }

    expect(
      offenders,
      `Estos archivos usan "fixed inset-0" a mano en vez de Dialog/AlertDialog ` +
        `(regla 4 y 6 de CONTRATO_FASE0.md). Reemplázalos por Dialog + DialogContent size + ` +
        `DialogBody, o por AlertDialog si la acción es destructiva/irreversible:\n  ` +
        offenders.join('\n  '),
    ).toEqual([]);
  });

  it('la allowlist no contiene ningún archivo que ya haya migrado', () => {
    const offenders: string[] = [];

    for (const rel of ALLOWLIST) {
      const full = join(APLICACIONES_DIR, rel);
      let source: string;
      try {
        source = readFileSync(full, 'utf-8');
      } catch {
        // El archivo ya no existe — probablemente se migró y se borró; hay que quitarlo de la
        // allowlist en el mismo cambio.
        offenders.push(`${rel} (no existe — quítalo de ALLOWLIST)`);
        continue;
      }
      if (!usaFixedInsetAMano(source)) {
        offenders.push(`${rel} (ya no usa "fixed inset-0" — quítalo de ALLOWLIST)`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('detecta el patrón real: className string literal', () => {
    const injected = '<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">';
    expect(usaFixedInsetAMano(injected)).toBe(true);
  });

  it('NO marca un comentario que solo menciona la frase "fixed inset-0"', () => {
    const injected = '// migración pendiente: hoy es un modal fixed inset-0 hecho a mano';
    expect(usaFixedInsetAMano(injected)).toBe(false);
  });

  it('NO marca un DialogContent real (Radix) aunque el archivo hable de modales', () => {
    const injected = '<DialogContent size="md" className="p-0"><DialogBody>x</DialogBody></DialogContent>';
    expect(usaFixedInsetAMano(injected)).toBe(false);
  });
});
