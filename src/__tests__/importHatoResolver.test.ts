import { describe, it, expect } from 'vitest';
import {
  detectarColisionesCorpus,
  detectarNombresBajoVariosNumeros,
  resolverRenombres,
  detectarCierresPresuntos,
  construirCatalogoToros,
  clasificarPadreTernera,
  resolverSubtablas,
  resolverTerneras,
  resolverIdentidadHato,
  aplicarVentasInferidas,
  animalesACsv,
  esVarianteOrtografica,
  verificarOverridesCubrenColisiones,
  type AnimalResuelto,
} from '@/utils/importHato/resolver';
import type { VentaInferida } from '@/utils/importHato/ventasInferidas';
import { FIXTURE_NORMALIZADO } from './fixtures/importHatoNormalizado.fixture';

describe('resolver.ts -- resolución de identidad del hato (S3)', () => {
  describe('esVarianteOrtografica', () => {
    it('reconoce MONA/NONA como variante a 1 carácter de distancia', () => {
      expect(esVarianteOrtografica('MONA', 'NONA')).toBe(true);
    });
    it('reconoce FRESA/FRESIA como variante (inserción de 1 letra)', () => {
      expect(esVarianteOrtografica('FRESA', 'FRESIA')).toBe(true);
    });
    it('NO agrupa dos nombres claramente distintos', () => {
      expect(esVarianteOrtografica('MONA', 'MARGARITA')).toBe(false);
    });
    it('dos nombres idénticos no son "variantes" (son el mismo texto)', () => {
      expect(esVarianteOrtografica('MONA', 'mona')).toBe(false);
    });
  });

  describe('detectarColisionesCorpus', () => {
    const colisiones = detectarColisionesCorpus(FIXTURE_NORMALIZADO.chequeos);

    it('detecta la colisión vigente #162 (ESMERALDA/VITROLA)', () => {
      const c = colisiones.find((x) => x.numero === 162);
      expect(c).toBeDefined();
      expect(c!.nombres).toEqual(['ESMERALDA', 'VITROLA']);
      expect(c!.vigente).toBe(true);
      expect(c!.numeroHojas).toBe(1);
    });

    it('detecta la colisión vigente #175 con sus 3 nombres', () => {
      const c = colisiones.find((x) => x.numero === 175);
      expect(c).toBeDefined();
      expect(c!.nombres.sort()).toEqual(['MARGARITA', 'MONA', 'NONA'].sort());
      expect(c!.vigente).toBe(true);
    });

    it('agrupa MONA/NONA como posible variante de escritura dentro de #175, separada de MARGARITA', () => {
      const c = colisiones.find((x) => x.numero === 175)!;
      const grupoConVariante = c.gruposOrtograficos.find((g) => g.length > 1);
      expect(grupoConVariante?.sort()).toEqual(['MONA', 'NONA']);
      const gruposSolos = c.gruposOrtograficos.filter((g) => g.length === 1).flat();
      expect(gruposSolos).toEqual(['MARGARITA']);
    });

    it('detecta la colisión histórica #43 (CUÑA/MONTAÑA) como NO vigente', () => {
      const c = colisiones.find((x) => x.numero === 43);
      expect(c).toBeDefined();
      expect(c!.vigente).toBe(false);
      expect(c!.numeroHojas).toBe(1);
    });

    it('numeros sin colisión (ej. 201, 500) no aparecen en el resultado', () => {
      expect(colisiones.find((x) => x.numero === 201)).toBeUndefined();
      expect(colisiones.find((x) => x.numero === 500)).toBeUndefined();
    });

    it('ordena por número de hojas descendente (la señal de mayor fuerza primero)', () => {
      for (let i = 1; i < colisiones.length; i++) {
        expect(colisiones[i - 1].numeroHojas).toBeGreaterThanOrEqual(colisiones[i].numeroHojas);
      }
    });
  });

  describe('verificarOverridesCubrenColisiones', () => {
    it('#162 queda cubierta por overridesChapeta.ts (ESMERALDA=999, VITROLA=998) -- no bloquea', () => {
      const colisiones = detectarColisionesCorpus(FIXTURE_NORMALIZADO.chequeos);
      const vigentes = colisiones.filter((c) => c.vigente);
      const { colisionesNoCubiertas } = verificarOverridesCubrenColisiones(vigentes);
      expect(colisionesNoCubiertas.some((c) => c.numero === 162)).toBe(false);
    });

    it('#175 tambien queda cubierta (MARGARITA=987, MONA=986, NONA=985) -- no bloquea', () => {
      const colisiones = detectarColisionesCorpus(FIXTURE_NORMALIZADO.chequeos);
      const vigentes = colisiones.filter((c) => c.vigente);
      const { colisionesNoCubiertas } = verificarOverridesCubrenColisiones(vigentes);
      expect(colisionesNoCubiertas.some((c) => c.numero === 175)).toBe(false);
    });

    it('con TODAS las colisiones vigentes cubiertas, no queda ninguna sin cubrir', () => {
      // Estado tras la decisión de Santiago del 2026-07-22 (numeración 999 hacia
      // atrás para las 12 colisiones). El guard no desaparece por eso: lo que
      // ahora protege es la aparición de una colisión NUEVA en un chequeo futuro
      // -- ver el caso sintético de abajo.
      const colisiones = detectarColisionesCorpus(FIXTURE_NORMALIZADO.chequeos);
      const vigentes = colisiones.filter((c) => c.vigente);
      const { colisionesNoCubiertas } = verificarOverridesCubrenColisiones(vigentes);
      expect(colisionesNoCubiertas).toHaveLength(0);
    });

    it('una colisión NUEVA sin override sigue bloqueando -- el guard no es decorativo', () => {
      const colisionNueva = [
        { numero: 250, nombres: ['RECIEN', 'APARECIDA'], evidencia: [], numeroHojas: 1, vigente: true, gruposOrtograficos: [], confianza: 'baja' as const },
      ];
      const { colisionesNoCubiertas } = verificarOverridesCubrenColisiones(colisionNueva);
      expect(colisionesNoCubiertas.some((c) => c.numero === 250)).toBe(true);
    });

    it('un override PARCIAL (cubre un nombre, no el otro) NO cuenta como cubierta -- nunca "cargar la parte que encaja"', () => {
      const colisionParcial = [
        { numero: 162, nombres: ['ESMERALDA', 'UN_NOMBRE_SIN_OVERRIDE'], evidencia: [], numeroHojas: 1, vigente: true, gruposOrtograficos: [], confianza: 'baja' as const },
      ];
      const { colisionesNoCubiertas } = verificarOverridesCubrenColisiones(colisionParcial);
      expect(colisionesNoCubiertas).toHaveLength(1);
    });
  });

  describe('detectarNombresBajoVariosNumeros', () => {
    it('detecta FABIOLA bajo los numeros 300 y 301', () => {
      const resultado = detectarNombresBajoVariosNumeros(FIXTURE_NORMALIZADO.chequeos);
      const fabiola = resultado.find((n) => n.nombre === 'FABIOLA');
      expect(fabiola).toBeDefined();
      expect(fabiola!.numeros).toEqual([300, 301]);
    });

    it('no marca nombres que solo tienen un numero', () => {
      const resultado = detectarNombresBajoVariosNumeros(FIXTURE_NORMALIZADO.chequeos);
      expect(resultado.find((n) => n.nombre === 'CAMPESINA')).toBeUndefined();
    });
  });

  describe('resolverRenombres', () => {
    const colisiones = detectarColisionesCorpus(FIXTURE_NORMALIZADO.chequeos);
    const renombres = resolverRenombres(FIXTURE_NORMALIZADO.chequeos, colisiones);

    it('numero 43 NO es un renombre: CUÑA y MONTAÑA coexisten en una misma lectura', () => {
      // Regresión del defecto encontrado corriendo sobre los datos reales
      // (2026-07-22): antes se filtraba por colisión *vigente*, así que #43
      // --concurrente en 25 hojas a lo largo de 7 años, pero ausente de la
      // lectura más reciente-- se degradaba a "renombre resuelto" y sus DOS
      // animales se fusionaban en uno, perdiendo uno de ellos en silencio.
      // Dos nombres el mismo día no es un renombre: una vaca no se llama de
      // dos formas a la vez. docs/hato/s2-matriz-qa.md §2.9 lo advierte por
      // nombre para este caso exacto.
      expect(renombres.find((x) => x.numero === 43)).toBeUndefined();
    });

    it('NINGÚN numero con colisión concurrente aparece como renombre, sea vigente o histórica', () => {
      for (const c of colisiones) {
        expect(renombres.find((x) => x.numero === c.numero)).toBeUndefined();
      }
    });

    it('numeros con colisión VIGENTE (162, 175) no aparecen en renombres -- están bloqueados', () => {
      expect(renombres.find((x) => x.numero === 162)).toBeUndefined();
      expect(renombres.find((x) => x.numero === 175)).toBeUndefined();
    });

    it('numeros con un solo nombre en todo el corpus no generan entrada', () => {
      expect(renombres.find((x) => x.numero === 201)).toBeUndefined();
    });
  });

  describe('detectarCierresPresuntos -- D5 (decisión del dueño, 2026-07-22): +365 días sin aparecer', () => {
    it('presume el cierre de PIONERA (#111): última vez vista 2022-09-10, la lectura más reciente del corpus es 2026-07-15 (>365 días de diferencia)', () => {
      const colisiones = detectarColisionesCorpus(FIXTURE_NORMALIZADO.chequeos);
      const bloqueados = new Set(colisiones.filter((c) => c.vigente).map((c) => c.numero));
      const cierres = detectarCierresPresuntos(FIXTURE_NORMALIZADO.chequeos, bloqueados);
      const pionera = cierres.find((c) => c.numero === 111);
      expect(pionera).toBeDefined();
      expect(pionera!.ultimaFechaVista).toBe('2022-09-10');
      // D5: fecha aproximada = última vez vista (no una lectura futura estimada).
      expect(pionera!.fechaCierrePresunta).toBe('2022-09-10');
      expect(pionera!.confianza).toBe('media');
    });

    it('no presume cierre para un animal visto en la lectura más reciente', () => {
      const colisiones = detectarColisionesCorpus(FIXTURE_NORMALIZADO.chequeos);
      const bloqueados = new Set(colisiones.filter((c) => c.vigente).map((c) => c.numero));
      const cierres = detectarCierresPresuntos(FIXTURE_NORMALIZADO.chequeos, bloqueados);
      expect(cierres.find((c) => c.numero === 201)).toBeUndefined();
    });

    it('sin ninguna fecha resuelta en el corpus, no presume ningún cierre (no hay ancla temporal)', () => {
      const sinFechas = FIXTURE_NORMALIZADO.chequeos.map((f) => ({ ...f, chequeoFecha: null }));
      expect(detectarCierresPresuntos(sinFechas, new Set())).toEqual([]);
    });

    it('exactamente 365 días sin aparecer NO presume cierre -- el umbral es "más de" un año, no "al menos"', () => {
      const base = FIXTURE_NORMALIZADO.chequeos[0];
      const chequeos = [
        { ...base, numero: 700, nombre: 'JUSTO', chequeoFecha: '2025-01-01' },
        { ...base, numero: 701, nombre: 'ANCLA', chequeoFecha: '2026-01-01' }, // 365 días después de 2025-01-01
      ];
      const cierres = detectarCierresPresuntos(chequeos, new Set());
      expect(cierres.find((c) => c.numero === 700)).toBeUndefined();
    });

    it('366 días sin aparecer SÍ presume cierre', () => {
      const base = FIXTURE_NORMALIZADO.chequeos[0];
      const chequeos = [
        { ...base, numero: 700, nombre: 'JUSTO', chequeoFecha: '2025-01-01' },
        { ...base, numero: 701, nombre: 'ANCLA', chequeoFecha: '2026-01-02' }, // 366 días después
      ];
      const cierres = detectarCierresPresuntos(chequeos, new Set());
      const justo = cierres.find((c) => c.numero === 700);
      expect(justo).toBeDefined();
      expect(justo!.fechaCierrePresunta).toBe('2025-01-01');
    });
  });

  describe('construirCatalogoToros', () => {
    const catalogo = construirCatalogoToros(FIXTURE_NORMALIZADO.chequeos);

    it('cuenta "Wagner" con sus apariciones (3 filas en el fixture)', () => {
      const wagner = catalogo.find((t) => t.nombreNormalizado === 'wagner');
      expect(wagner).toBeDefined();
      expect(wagner!.apariciones).toBe(3);
      expect(wagner!.sospechosoNoEsToro).toBe(false);
    });

    it('marca la oración completa como sospechosa de NO ser un toro', () => {
      const sospechoso = catalogo.find((t) => t.nombreVisible.includes('recomendación'));
      expect(sospechoso).toBeDefined();
      expect(sospechoso!.sospechosoNoEsToro).toBe(true);
    });

    describe('D6 (decisión del dueño, 2026-07-22) -- el catálogo se agrupa por identidad RESUELTA (toroNombre), no por el string crudo', () => {
      const base = FIXTURE_NORMALIZADO.chequeos[0];
      function filaConToro(toro: string, toroNombre: string | null, numero: number, fila: number): (typeof FIXTURE_NORMALIZADO.chequeos)[number] {
        return { ...base, numero, fila, nombre: `V${numero}`, raw: { ...base.raw, toro }, toroNombre };
      }

      it("'hol'/'hols'/'HOLST'/'hins' colapsan en UNA sola entrada 'Holstein', no cuatro", () => {
        const chequeos = [
          filaConToro('hol', 'Holstein', 601, 101),
          filaConToro('hols', 'Holstein', 602, 102),
          filaConToro('HOLST', 'Holstein', 603, 103),
          filaConToro('hins', 'Holstein', 604, 104),
        ];
        const cat = construirCatalogoToros(chequeos);
        const holstein = cat.filter((t) => t.nombreNormalizado === 'holstein');
        expect(holstein).toHaveLength(1);
        expect(holstein[0].apariciones).toBe(4);
        expect(holstein[0].nombreVisible).toBe('Holstein');
        expect(holstein[0].sospechosoNoEsToro).toBe(false);
      });

      it("'FABA' nunca genera un candidato de toro (INOOK/estado -- D6 owner: 'NO entry for INOOK')", () => {
        const chequeos = [filaConToro('INOOK', null, 605, 105), filaConToro('ok', null, 606, 106), filaConToro('rech', null, 607, 107)];
        const cat = construirCatalogoToros(chequeos);
        expect(cat.find((t) => t.nombreNormalizado === 'inook')).toBeUndefined();
        expect(cat.find((t) => t.nombreVisible.toLowerCase() === 'inook')).toBeUndefined();
        expect(cat.find((t) => t.nombreNormalizado === 'ok')).toBeUndefined();
        expect(cat.find((t) => t.nombreNormalizado === 'rech')).toBeUndefined();
      });

      it("'FABA' se agrupa como candidato confiable único bajo 'Fabace'", () => {
        const chequeos = [filaConToro('FABA', 'Fabace', 608, 108)];
        const cat = construirCatalogoToros(chequeos);
        const fabace = cat.find((t) => t.nombreNormalizado === 'fabace');
        expect(fabace).toBeDefined();
        expect(fabace!.nombreVisible).toBe('Fabace');
        expect(fabace!.sospechosoNoEsToro).toBe(false);
      });
    });
  });

  describe('clasificarPadreTernera', () => {
    it('clasifica "jersey" como raza', () => {
      const fila = FIXTURE_NORMALIZADO.terneras.find((t) => t.numero === 166)!;
      const resultado = clasificarPadreTernera(fila);
      expect(resultado.clasificacion).toBe('raza');
      expect(resultado.razaDetectada).toBe('jersey');
    });

    it('D7 (decisión del dueño, 2026-07-22): clasifica "yaguen" como toro_confirmado, raza jersey asumida', () => {
      const fila = FIXTURE_NORMALIZADO.terneras.find((t) => t.numero === 187)!;
      const resultado = clasificarPadreTernera(fila);
      expect(resultado.clasificacion).toBe('toro_confirmado');
      expect(resultado.toroNombre).toBe('Yaguen');
      expect(resultado.razaDetectada).toBe('jersey');
      expect(resultado.nota).toContain('ASUMIDA');
    });

    it('D7: clasifica "fabace" como toro_confirmado, raza jersey asumida -- mismo toro que FABA (D6)', () => {
      const fila = FIXTURE_NORMALIZADO.terneras.find((t) => t.numero === 190)!;
      const resultado = clasificarPadreTernera(fila);
      expect(resultado.clasificacion).toBe('toro_confirmado');
      expect(resultado.toroNombre).toBe('Fabace');
      expect(resultado.razaDetectada).toBe('jersey');
    });

    it('clasifica un valor desconocido (no raza, no pregunta abierta) como toro_no_confirmado', () => {
      const resultado = clasificarPadreTernera({
        archivo: 'x',
        hoja: 'y',
        fila: 1,
        numero: 1,
        nombre: null,
        fechaNacimiento: null,
        fechaNacimientoConfianza: 'desconocida',
        padreRaw: 'Wagner',
        madreRaw: null,
        issues: [],
      });
      expect(resultado.clasificacion).toBe('toro_no_confirmado');
    });

    it('celda vacía se clasifica como vacio, nunca se inventa una raza', () => {
      const resultado = clasificarPadreTernera({
        archivo: 'x',
        hoja: 'y',
        fila: 1,
        numero: 1,
        nombre: null,
        fechaNacimiento: null,
        fechaNacimientoConfianza: 'desconocida',
        padreRaw: null,
        madreRaw: null,
        issues: [],
      });
      expect(resultado.clasificacion).toBe('vacio');
    });
  });

  describe('resolverSubtablas', () => {
    it('marca coincideConAnimalConocido=true cuando el numero existe en TERNERAS', () => {
      const resultado = resolverSubtablas(FIXTURE_NORMALIZADO.subtablas, FIXTURE_NORMALIZADO.terneras, FIXTURE_NORMALIZADO.chequeos);
      expect(resultado).toHaveLength(1);
      expect(resultado[0].coincideConAnimalConocido).toBe(true);
    });

    it('marca coincideConAnimalConocido=false cuando el numero no aparece en ningún lado', () => {
      const resultado = resolverSubtablas(
        [{ archivo: 'a', hoja: 'b', fila: 1, indice: 1, numero: 999999, nombre: 'FANTASMA', madreRaw: null, issues: [] }],
        FIXTURE_NORMALIZADO.terneras,
        FIXTURE_NORMALIZADO.chequeos,
      );
      expect(resultado[0].coincideConAnimalConocido).toBe(false);
    });

    describe('D9 (decisión del dueño, 2026-07-22) -- fila sin numero/nombre: "intentar resolver contra 2025+, si no, ignorar"', () => {
      const filaBlanco = { archivo: 'CHEQUEO VETE 2024.xlsx', hoja: 'CHEQUEO AGOSTO 2024', fila: 64, indice: null, numero: null, nombre: null, madreRaw: ', campesina', issues: [] };

      it('resuelve el fragmento de madreRaw (", campesina") contra un chequeo 2025+ (CAMPESINA, #201, R4 2026-07-15) -- rellena numero/nombre', () => {
        const resultado = resolverSubtablas([filaBlanco], FIXTURE_NORMALIZADO.terneras, FIXTURE_NORMALIZADO.chequeos);
        expect(resultado).toHaveLength(1);
        expect(resultado[0]).toMatchObject({ numero: 201, nombre: 'CAMPESINA', coincideConAnimalConocido: true });
      });

      it('caso real (fila 64, CHEQUEO VETE 2024.xlsx :: CHEQUEO AGOSTO 2024): madreRaw=", verita" no resuelve contra ningún chequeo 2025+ -- VERITA (#153) no vuelve a aparecer desde 2024, se OMITE del todo', () => {
        const filaVerita = { ...filaBlanco, madreRaw: ', verita' };
        const resultado = resolverSubtablas([filaVerita], FIXTURE_NORMALIZADO.terneras, FIXTURE_NORMALIZADO.chequeos);
        expect(resultado).toHaveLength(0);
      });

      it('sin ningún fragmento en madreRaw tampoco, se omite (nunca inventa una coincidencia)', () => {
        const filaVacia = { ...filaBlanco, madreRaw: null };
        const resultado = resolverSubtablas([filaVacia], FIXTURE_NORMALIZADO.terneras, FIXTURE_NORMALIZADO.chequeos);
        expect(resultado).toHaveLength(0);
      });
    });
  });

  describe('aplicarVentasInferidas -- D8 (decisión del dueño, 2026-07-22)', () => {
    function animal(datos: Partial<AnimalResuelto> & { numero: number; nombre: string }): AnimalResuelto {
      return {
        numeroObservado: null,
        etapaPresunta: 'vaca',
        origen: 'importacion_historica',
        estadoPresunto: 'activa',
        fechaEstadoPresunta: null,
        fechaNacimiento: null,
        fechaNacimientoConfianza: 'desconocida',
        madreRaw: null,
        confianza: 'alta',
        bloqueadoPorColision: false,
        nombresObsoletos: [],
        notas: [],
        ...datos,
      };
    }
    const ventaOrigen: Omit<VentaInferida, 'nombre' | 'numeroAsignado'> = {
      comentarioOrigen: "chispa. Dacota, indir  vendida",
      archivo: 'CHEO VETE 2026.xlsx',
      hoja: 'CHEQUEO JULIO 2026',
      fila: 46,
      decididoPor: 'Santiago',
      fecha: '2026-07-22',
    };

    it('un nombre que resuelve a EXACTAMENTE un animal existente (DACOTA) se marca vendida sobre SU número -- nunca mintea uno nuevo', () => {
      const base = [animal({ numero: 129, nombre: 'DACOTA' })];
      const ventas: VentaInferida[] = [{ ...ventaOrigen, nombre: 'DACOTA', numeroAsignado: null }];
      const { animales, aplicadas, sinAplicar } = aplicarVentasInferidas(base, ventas);
      expect(animales).toHaveLength(1); // nunca se duplica la fila
      expect(animales[0].numero).toBe(129);
      expect(animales[0].estadoPresunto).toBe('vendida');
      expect(animales[0].notas.some((n) => n.includes('Venta inferida'))).toBe(true);
      expect(sinAplicar).toEqual([]);
      expect(aplicadas).toEqual([{ venta: ventas[0], numeroFinal: 129, huboNumeroNuevo: false }]);
    });

    it('un nombre genuinamente ambiguo (numeroAsignado explícito) SIEMPRE crea un animal nuevo con numero de trabajo, nunca se fusiona con uno existente', () => {
      const base = [animal({ numero: 168, nombre: 'CHISPA' })]; // homónimo histórico -- NO debe tocarse
      const ventas: VentaInferida[] = [{ ...ventaOrigen, nombre: 'CHISPA', numeroAsignado: 899 }];
      const { animales, aplicadas } = aplicarVentasInferidas(base, ventas);
      expect(animales).toHaveLength(2);
      expect(animales.find((a) => a.numero === 168)!.estadoPresunto).toBe('activa'); // el homónimo NO se toca
      const nueva = animales.find((a) => a.numero === 899)!;
      expect(nueva.nombre).toBe('CHISPA');
      expect(nueva.estadoPresunto).toBe('vendida');
      expect(aplicadas).toEqual([{ venta: ventas[0], numeroFinal: 899, huboNumeroNuevo: true }]);
    });

    it('un nombre que NO resuelve a ningún animal existente queda en sinAplicar, nunca se inventa una coincidencia', () => {
      const ventas: VentaInferida[] = [{ ...ventaOrigen, nombre: 'FANTASMA', numeroAsignado: null }];
      const { animales, sinAplicar } = aplicarVentasInferidas([], ventas);
      expect(animales).toEqual([]);
      expect(sinAplicar).toEqual(ventas);
    });

    it('un nombre AMBIGUO entre 2+ animales existentes (mismo nombre, numeros distintos) queda en sinAplicar, nunca adivina cuál', () => {
      const base = [animal({ numero: 1, nombre: 'DUPLICADA' }), animal({ numero: 2, nombre: 'DUPLICADA' })];
      const ventas: VentaInferida[] = [{ ...ventaOrigen, nombre: 'DUPLICADA', numeroAsignado: null }];
      const { animales, sinAplicar } = aplicarVentasInferidas(base, ventas);
      expect(animales.every((a) => a.estadoPresunto === 'activa')).toBe(true);
      expect(sinAplicar).toEqual(ventas);
    });
  });

  describe('resolverTerneras', () => {
    const resueltas = resolverTerneras(FIXTURE_NORMALIZADO.terneras, FIXTURE_NORMALIZADO.hojas);

    it('prefiere COPITA (más reciente, hoja 2024) sobre campera (hoja 2020) para el numero 166', () => {
      const t = resueltas.find((x) => x.numero === 166)!;
      expect(t.nombreVigente).toBe('COPITA');
      expect(t.nombresObsoletos).toEqual(['campera']);
      expect(t.colisionEnMismaHoja).toBe(false);
    });

    it('numero 187 sin nombre en 2024 se actualiza a RECOCHA en 2026, sin duplicar', () => {
      const t = resueltas.find((x) => x.numero === 187)!;
      expect(t.nombreVigente).toBe('RECOCHA');
      expect(t.nombresObsoletos).toEqual([]);
    });

    it('conserva fecha de nacimiento y madre', () => {
      const t = resueltas.find((x) => x.numero === 166)!;
      expect(t.fechaNacimiento).toBe('2018-03-01');
      expect(t.madreRaw).toBe('CUÑA');
    });
  });

  describe('resolverIdentidadHato -- orquestador', () => {
    const resultado = resolverIdentidadHato(FIXTURE_NORMALIZADO, '2026-07-22T12:00:00.000Z');

    it('propaga generadoEn tal cual se lo pasaron (nunca Date.now() interno)', () => {
      expect(resultado.generadoEn).toBe('2026-07-22T12:00:00.000Z');
    });

    it('D8: VENTAS_INFERIDAS se aplica siempre -- CHISPA (sin match en este fixture) entra como animal NUEVO 899; DACOTA/INDIRA (tampoco en este fixture) quedan sin aplicar', () => {
      const chispa = resultado.animales.find((a) => a.numero === 899);
      expect(chispa).toBeDefined();
      expect(chispa!.nombre).toBe('CHISPA');
      expect(chispa!.estadoPresunto).toBe('vendida');
      expect(resultado.ventasInferidasAplicadas.some((a) => a.venta.nombre === 'CHISPA' && a.huboNumeroNuevo)).toBe(true);
      expect(resultado.ventasInferidasSinAplicar.map((v) => v.nombre).sort()).toEqual(['DACOTA', 'INDIRA']);
    });

    it('#162 (ESMERALDA/VITROLA) tiene override real: se resuelve a números de trabajo 999/998, ya NO bloquea', () => {
      // overridesChapeta.ts (decisión de Santiago, 2026-07-22) cubre por
      // completo la colisión #162 -- ninguna fila con numero=162 debe quedar.
      expect(resultado.animales.filter((a) => a.numero === 162)).toHaveLength(0);

      const esmeralda = resultado.animales.find((a) => a.nombre === 'ESMERALDA')!;
      expect(esmeralda.numero).toBe(999);
      expect(esmeralda.numeroObservado).toBe(162);
      expect(esmeralda.bloqueadoPorColision).toBe(false);
      expect(esmeralda.confianza).toBe('baja');

      const vitrola = resultado.animales.find((a) => a.nombre === 'VITROLA')!;
      expect(vitrola.numero).toBe(998);
      expect(vitrola.numeroObservado).toBe(162);
      expect(vitrola.bloqueadoPorColision).toBe(false);

      expect(resultado.numerosLiberadosPorOverride).toContain(162);
      expect(resultado.colisionesSinCubrir.some((c) => c.numero === 162)).toBe(false);
    });

    it('#175 genera 3 filas (MARGARITA/MONA/NONA) con numero de trabajo, ninguna bloqueada', () => {
      // NONA recibe su propio numero aunque casi seguro sea un mal tecleo de
      // MONA: fusionar es descartar, y descartar en silencio es justo lo que
      // este pipeline prohíbe. Martha fusiona; el código nunca.
      const filas175 = resultado.animales.filter((a) => a.numeroObservado === 175);
      expect(filas175).toHaveLength(3);
      expect(filas175.every((a) => a.bloqueadoPorColision)).toBe(false);
      expect(filas175.map((a) => a.numero).sort()).toEqual([985, 986, 987]);
      expect(resultado.colisionesSinCubrir.some((c) => c.numero === 175)).toBe(false);
      expect(resultado.numerosLiberadosPorOverride).toContain(175);
    });

    it('numero 43 genera DOS animales (CUÑA y MONTAÑA), no uno fusionado', () => {
      // El corazón del defecto: fusionar aquí borraba un animal real del hato.
      const filas43 = resultado.animales.filter((a) => a.numeroObservado === 43);
      expect(filas43).toHaveLength(2);
      expect(filas43.map((a) => a.nombre).sort()).toEqual(['CUÑA', 'MONTAÑA']);
      // Ambos con número de trabajo provisional, ninguno conservando el 43.
      expect(filas43.map((a) => a.numero).sort()).toEqual([996, 997]);
      expect(resultado.animales.some((a) => a.numero === 43)).toBe(false);
    });

    it('numero 111 (PIONERA) queda marcado estadoPresunto=vendida por el cierre presunto (D5: fecha = última vez vista)', () => {
      const fila = resultado.animales.find((a) => a.numero === 111)!;
      expect(fila.estadoPresunto).toBe('vendida');
      expect(fila.fechaEstadoPresunta).toBe('2022-09-10');
    });

    it('numero 201 (CAMPESINA) cruza chequeos+TERNERAS: etapa vaca, con fecha de nacimiento de TERNERAS', () => {
      const fila = resultado.animales.find((a) => a.numero === 201)!;
      expect(fila.etapaPresunta).toBe('vaca');
      expect(fila.fechaNacimiento).toBe('2019-06-01');
      expect(fila.confianza).toBe('alta');
    });

    it('numero 187 (solo en TERNERAS) queda etapaPresunta=cria', () => {
      const fila = resultado.animales.find((a) => a.numero === 187)!;
      expect(fila.etapaPresunta).toBe('cria');
      expect(fila.nombre).toBe('RECOCHA');
    });

    it('numero 770 (sin nombre) no genera una fila en animales -- queda en filasSinNombre', () => {
      expect(resultado.animales.find((a) => a.numero === 770)).toBeUndefined();
      expect(resultado.filasSinNombre.some((f) => f.numero === 770)).toBe(true);
    });

    it('la fila de comentario sin numero queda registrada en filasSinNumero, nunca se pierde', () => {
      expect(resultado.filasSinNumero.some((f) => f.nombre === 'VENDIDAS CORNELIA Y COQUETA')).toBe(true);
    });

    it('totales cuentan lecturas, filas y numeros distintos correctamente', () => {
      expect(resultado.totales.lecturasChequeo).toBe(4);
      expect(resultado.totales.filasChequeo).toBe(FIXTURE_NORMALIZADO.chequeos.length);
      expect(resultado.totales.filasTerneras).toBe(FIXTURE_NORMALIZADO.terneras.length);
    });
  });

  describe('animalesACsv', () => {
    it('produce un encabezado + una fila por animal, escapando comas en las notas', () => {
      const resultado = resolverIdentidadHato(FIXTURE_NORMALIZADO, '2026-07-22T00:00:00.000Z');
      const csv = animalesACsv(resultado.animales);
      const lineas = csv.trim().split('\n');
      expect(lineas[0]).toBe(
        'numero,numero_observado,nombre,etapa_presunta,origen,estado_presunto,fecha_estado_presunta,fecha_nacimiento,fecha_nacimiento_confianza,madre_raw,confianza,bloqueado_por_colision,nombres_obsoletos,notas',
      );
      expect(lineas.length).toBe(resultado.animales.length + 1);
    });

    it('ninguna fila conserva el numero observado en colisión: 175 queda sin dueño y sus 3 animales llevan numero de trabajo', () => {
      const resultado = resolverIdentidadHato(FIXTURE_NORMALIZADO, '2026-07-22T00:00:00.000Z');
      const csv = animalesACsv(resultado.animales);
      // El 175 ya no es de nadie en el sistema -- pero la caravana física sigue
      // existiendo en el potrero, y por eso el numero observado nunca se pierde.
      expect(csv.split('\n').some((l) => l.startsWith('175,'))).toBe(false);
      const conObservado175 = csv.split('\n').filter((l) => l.includes(',175,')).length;
      expect(conObservado175).toBe(3);
    });

    it('para una colisión CUBIERTA por override (162), el CSV trae numero de trabajo + numero_observado, ambos NO bloqueados', () => {
      const resultado = resolverIdentidadHato(FIXTURE_NORMALIZADO, '2026-07-22T00:00:00.000Z');
      const csv = animalesACsv(resultado.animales);
      expect(csv).toContain('999,162,ESMERALDA');
      expect(csv).toContain('998,162,VITROLA');
      expect(csv.split('\n').some((l) => l.startsWith('162,'))).toBe(false);
    });
  });
});
