import { describe, it, expect } from 'vitest';
import {
  slugDeArchivoMigracion,
  archivoCubreNombreLedger,
  nombresLedgerSinArchivo,
  LEDGER_CON_ARCHIVO_DE_REGISTRO,
  listarArchivosMigracion,
} from './check-migration-ledger-drift.mjs';

describe('slugDeArchivoMigracion', () => {
  it('separa el prefijo numerico del slug', () => {
    expect(slugDeArchivoMigracion('157_limpieza_chequeo_prueba_qa.sql')).toEqual({
      full: '157_limpieza_chequeo_prueba_qa',
      slug: 'limpieza_chequeo_prueba_qa',
    });
  });
});

describe('archivoCubreNombreLedger', () => {
  it('casa el caso ESCO-112: ledger con sufijo de fecha, fichero sin el', () => {
    expect(
      archivoCubreNombreLedger(
        '157_limpieza_chequeo_prueba_qa.sql',
        'limpieza_chequeo_prueba_qa_2020_01_15',
      ),
    ).toBe(true);
  });

  it('casa cuando el ledger trae el prefijo numerico (147)', () => {
    expect(
      archivoCubreNombreLedger(
        '147_fn_ronda_resolver_con_captura_cantidad_confirmada.sql',
        '147_fn_ronda_resolver_con_captura_cantidad_confirmada',
      ),
    ).toBe(true);
  });

  it('NO casa un slug distinto', () => {
    expect(
      archivoCubreNombreLedger(
        '154_borrar_duplicados_chequeo_2026_09_08.sql',
        'limpieza_chequeo_prueba_qa_2020_01_15',
      ),
    ).toBe(false);
  });
});

describe('nombresLedgerSinArchivo', () => {
  it('reporta el huerfano que ESCO-112 encontro (sin el fichero 157)', () => {
    expect(
      nombresLedgerSinArchivo(
        ['limpieza_chequeo_prueba_qa_2020_01_15', '151_clima_horas_sol_duracion'],
        ['151_clima_horas_sol_duracion.sql', '154_borrar_duplicados_chequeo_2026_09_08.sql'],
      ),
    ).toEqual(['limpieza_chequeo_prueba_qa_2020_01_15']);
  });

  it('no reporta huerfano cuando existe el archivo de registro', () => {
    expect(
      nombresLedgerSinArchivo(
        ['limpieza_chequeo_prueba_qa_2020_01_15'],
        ['157_limpieza_chequeo_prueba_qa.sql'],
      ),
    ).toEqual([]);
  });
});

describe('archivos de registro conocidos', () => {
  it('cada nombre reconstruido (067/079/108/157) tiene fichero en src/sql/migrations', () => {
    const archivos = listarArchivosMigracion('src/sql/migrations');
    expect(
      nombresLedgerSinArchivo(LEDGER_CON_ARCHIVO_DE_REGISTRO, archivos),
      `Falta archivo de registro para: ${nombresLedgerSinArchivo(
        LEDGER_CON_ARCHIVO_DE_REGISTRO,
        archivos,
      ).join(', ')}`,
    ).toEqual([]);
  });
});
