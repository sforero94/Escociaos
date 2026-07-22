import { describe, it, expect } from 'vitest';
import {
  DESFASE_ANIO_PRINCIPAL,
  anioDeFecha,
  construirPeriodos,
  fechaEnRango,
  mesDeFecha,
  periodosCosecha,
  periodosTrimestrales,
  rangoDeCarga,
} from '@/utils/periodosReporte';

describe('bucketing de fechas por corte de string', () => {
  it('extrae mes y año sin pasar por new Date()', () => {
    expect(mesDeFecha('2026-01-31')).toBe(1);
    expect(mesDeFecha('2026-12-01')).toBe(12);
    expect(anioDeFecha('2025-07-15')).toBe(2025);
  });

  it('no se corre de mes por zona horaria en los bordes', () => {
    // new Date('2026-01-01').getMonth() puede dar diciembre en UTC-5.
    expect(mesDeFecha('2026-01-01')).toBe(1);
    expect(mesDeFecha('2026-12-31')).toBe(12);
  });

  it('compara rangos inclusive en ambos extremos', () => {
    expect(fechaEnRango('2026-03-31', '2026-01-01', '2026-03-31')).toBe(true);
    expect(fechaEnRango('2026-01-01', '2026-01-01', '2026-03-31')).toBe(true);
    expect(fechaEnRango('2026-04-01', '2026-01-01', '2026-03-31')).toBe(false);
  });
});

describe('períodos trimestrales acumulados', () => {
  const periodos = periodosTrimestrales(2026);

  it('produce 4 columnas', () => {
    expect(periodos.map((p) => p.key)).toEqual(['Q1', 'Q1-Q2', 'Q1-Q3', 'ANIO']);
  });

  it('todas arrancan el 1 de enero: son acumulados, no trimestres sueltos', () => {
    expect(periodos.every((p) => p.egresos.desde === '2026-01-01')).toBe(true);
  });

  it('cierra cada acumulado en el último día del trimestre', () => {
    expect(periodos.map((p) => p.egresos.hasta)).toEqual([
      '2026-03-31',
      '2026-06-30',
      '2026-09-30',
      '2026-12-31',
    ]);
  });

  it('cada período contiene al anterior', () => {
    for (let i = 1; i < periodos.length; i += 1) {
      expect(periodos[i].egresos.hasta > periodos[i - 1].egresos.hasta).toBe(true);
    }
  });

  it('usa la misma ventana para ingresos y egresos', () => {
    for (const p of periodos) {
      expect(p.ingresos.modo).toBe('fecha');
      expect(p.ingresos.desde).toBe(p.egresos.desde);
      expect(p.ingresos.hasta).toBe(p.egresos.hasta);
    }
  });
});

describe('períodos por cosecha (aguacate)', () => {
  const periodos = periodosCosecha(2026);

  it('la Principal carga el semestre inmediatamente anterior a su venta', () => {
    // Principal 2026 se vende nov-2025 → abr-2026, así que la fruta se
    // trabajó en jul–dic de 2025.
    const principal = periodos.find((p) => p.key === 'Principal 2026')!;
    expect(principal.egresos).toEqual({ desde: '2025-07-01', hasta: '2025-12-31' });
    expect(principal.ingresos).toEqual({ modo: 'cosecha', etiqueta: 'Principal 2026' });
  });

  it('la Traviesa carga el primer semestre de su propio año', () => {
    const traviesa = periodos.find((p) => p.key === 'Traviesa 2026')!;
    expect(traviesa.egresos).toEqual({ desde: '2026-01-01', hasta: '2026-06-30' });
    expect(traviesa.ingresos).toEqual({ modo: 'cosecha', etiqueta: 'Traviesa 2026' });
  });

  it('los dos semestres no se solapan: ningún gasto se usa dos veces', () => {
    const [principal, traviesa] = periodos;
    expect(principal.egresos.hasta < traviesa.egresos.desde).toBe(true);
  });

  it('el desfase es una constante única y auditable', () => {
    expect(DESFASE_ANIO_PRINCIPAL).toBe(-1);
  });

  it('describe en texto el rango que suma, para auditarlo en pantalla', () => {
    expect(periodos[0].descripcion).toContain('jul–dic 2025');
  });
});

describe('rango de carga', () => {
  it('en modo trimestres cubre solo el año', () => {
    expect(rangoDeCarga(construirPeriodos(2026, 'trimestres'))).toEqual({
      desde: '2026-01-01',
      hasta: '2026-12-31',
    });
  });

  it('en modo cosecha se extiende al segundo semestre del año anterior', () => {
    expect(rangoDeCarga(construirPeriodos(2026, 'cosecha'))).toEqual({
      desde: '2025-07-01',
      hasta: '2026-06-30',
    });
  });
});
