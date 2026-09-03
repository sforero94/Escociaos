const MESES: Record<string, string> = {
  enero: '01', ene: '01',
  febrero: '02', feb: '02',
  marzo: '03', mar: '03',
  abril: '04', abr: '04',
  mayo: '05', may: '05',
  junio: '06', jun: '06',
  julio: '07', jul: '07',
  agosto: '08', ago: '08',
  septiembre: '09', setiembre: '09', sep: '09', sept: '09',
  octubre: '10', oct: '10',
  noviembre: '11', nov: '11',
  diciembre: '12', dic: '12',
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parsea fechas del Word (28 de julio de 2026, 9 jul 2026, 09/07/2026). */
export function parsearFechaInforme(crudo: string | null | undefined): string | null {
  if (!crudo) return null;
  const s = crudo.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
  if (dmy) {
    const dia = Number(dmy[1]);
    const mes = Number(dmy[2]);
    const anio = Number(dmy[3]);
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      return `${anio}-${pad2(mes)}-${pad2(dia)}`;
    }
  }

  const largo = /(\d{1,2})\s+de\s+([a-z]+)\s+(?:de\s+)?(\d{4})/.exec(s);
  if (largo) {
    const mes = MESES[largo[2]];
    if (mes) return `${largo[3]}-${mes}-${pad2(Number(largo[1]))}`;
  }

  const corto = /(\d{1,2})\s+([a-z]{3,})\s+(\d{4})/.exec(s);
  if (corto) {
    const mes = MESES[corto[2]];
    if (mes) return `${corto[3]}-${mes}-${pad2(Number(corto[1]))}`;
  }

  return null;
}

/** Primera fecha parseable en el texto. No inventa un día a partir de “julio 2026”. */
export function extraerPrimeraFechaDelTexto(texto: string): string | null {
  if (!texto.trim()) return null;
  const ventana = texto.slice(0, 5000);
  const candidatos = [
    ...ventana.matchAll(/(\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚáéíóúü]+\s+(?:de\s+)?\d{4})/g),
    ...ventana.matchAll(/(\d{1,2}\s+[A-Za-zÁÉÍÓÚáéíóúü]{3,}\s+\d{4})/g),
    ...ventana.matchAll(/(\d{1,2}[/.\\-]\d{1,2}[/.\\-]\d{4})/g),
    ...ventana.matchAll(/(\d{4}-\d{2}-\d{2})/g),
  ];
  for (const m of candidatos) {
    const parsed = parsearFechaInforme(m[1]);
    if (parsed) return parsed;
  }
  return null;
}
