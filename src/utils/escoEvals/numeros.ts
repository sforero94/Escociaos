// Extracción de números y fechas de la respuesta de Esco, para verificar anclas.
// Formato colombiano: punto = miles, coma = decimal. Esco mezcla ambos
// ("59.014 kg", "54.33 mm", "$9.262.976", "385,9M"), así que un token ambiguo
// genera TODOS sus valores candidatos y basta que uno caiga dentro de la tolerancia.

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const ABREVIATURAS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12,
};

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function valoresDeToken(token: string): number[] {
  const signo = /^[-−]/.test(token) ? -1 : 1;
  const limpio = token.replace(/[^\d.,]/g, '');
  if (!limpio || !/\d/.test(limpio)) return [];
  const tienePunto = limpio.includes('.');
  const tieneComa = limpio.includes(',');
  const salida: number[] = [];

  if (tienePunto && tieneComa) {
    // El último separador es el decimal; el otro es de miles.
    const ultimoPunto = limpio.lastIndexOf('.');
    const ultimaComa = limpio.lastIndexOf(',');
    const decimal = ultimoPunto > ultimaComa ? '.' : ',';
    const miles = decimal === '.' ? ',' : '.';
    const normal = limpio.split(miles).join('').replace(decimal, '.');
    salida.push(Number(normal));
  } else if (tienePunto || tieneComa) {
    const sep = tienePunto ? '.' : ',';
    const partes = limpio.split(sep);
    if (partes.length > 2) {
      // 1.234.567 → miles
      salida.push(Number(partes.join('')));
    } else {
      const [antes, despues] = partes;
      if (despues.length === 3 && antes.length >= 1 && antes.length <= 3) {
        // 1.234 es ambiguo: 1234 (miles) o 1.234 (decimal).
        salida.push(Number(antes + despues));
        salida.push(Number(`${antes}.${despues}`));
      } else {
        salida.push(Number(`${antes}.${despues}`));
      }
    }
  } else {
    salida.push(Number(limpio));
  }
  return salida.filter((n) => Number.isFinite(n)).map((n) => n * signo);
}

/** Todos los valores numéricos candidatos que aparecen en el texto. */
export function extraerNumeros(texto: string): number[] {
  const encontrados = new Set<number>();
  // Un número (con separadores) seguido de un posible multiplicador: "M" / "millones" / "mil".
  const re = /(?<![\d\w])([-−]?\d[\d.,]*)(\s?(?:millones|M\b|mil\b))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const token = m[1].replace(/[.,]+$/, '');
    const sufijo = (m[2] ?? '').trim().toLowerCase();
    const mult = sufijo === 'millones' || sufijo === 'm' ? 1e6 : sufijo === 'mil' ? 1e3 : 1;
    for (const v of valoresDeToken(token)) encontrados.add(v * mult);
  }
  return [...encontrados];
}

/** ¿Algún número del texto cae a ±tol del valor? Sin tol, exige igualdad (a 1e-9). */
export function numeroCerca(valor: number, tol: number | null | undefined, numeros: number[]): boolean {
  const margen = tol ?? 0;
  return numeros.some((n) => Math.abs(n - valor) <= margen + 1e-9);
}

/** ¿Aparece la fecha ISO en alguna forma habitual del español? El año es opcional. */
export function fechaPresente(iso: string, texto: string): boolean {
  const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!mm) return false;
  const anio = Number(mm[1]);
  const mes = Number(mm[2]);
  const dia = Number(mm[3]);
  const t = sinTildes(texto);

  if (new RegExp(`(?<!\\d)${iso}(?!\\d)`).test(t)) return true;

  // d/m/aaaa, dd-mm-aa, d/m
  // Do not reinterpret the month/day suffix of a different ISO date as d/m.
  const sinIso = t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');
  const reNumerica = /(?<!\d)(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = reNumerica.exec(sinIso)) !== null) {
    if (Number(m[1]) === dia && Number(m[2]) === mes) {
      if (!m[3]) return true;
      const a = Number(m[3]);
      if (a === anio || a === anio % 100) return true;
    }
  }

  // "12 de agosto", "12 agosto", "12-ago", "12 ago.", "agosto 12"
  const nombres = [
    ...Object.entries(MESES).filter(([, n]) => n === mes).map(([k]) => k),
    ...Object.entries(ABREVIATURAS).filter(([, n]) => n === mes).map(([k]) => k),
  ];
  for (const nombre of nombres) {
    const antes = new RegExp(`(?:^|\\D)0?${dia}\\s*(?:de\\s+|-|/)?\\s*${nombre}\\b`, 'g');
    const despues = new RegExp(`\\b${nombre}\\.?\\s*(?:de\\s+)?0?${dia}(?!\\d)`, 'g');
    for (const patron of [antes, despues]) {
      for (const match of t.matchAll(patron)) {
        const resto = t.slice(match.index + match[0].length);
        const explicito = /^[.,]?\s*(?:de(?:l)?\s+)?(\d{4})\b/.exec(resto);
        if (!explicito || Number(explicito[1]) === anio) return true;
      }
    }
  }
  return false;
}

export function esFechaIso(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}
