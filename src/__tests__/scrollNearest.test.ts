import { describe, it, expect } from 'vitest';
import { calcularScrollNearest } from '@/utils/scrollNearest';

describe('calcularScrollNearest', () => {
  it('no ajusta nada cuando el elemento ya está completamente visible', () => {
    // Contenedor de 622px (medida real del sidebar, F2#1), sin scroll, ítem
    // a mitad de camino.
    const contenedor = { top: 0, height: 622, scrollTop: 0 };
    const elemento = { top: 300, height: 44 };

    expect(calcularScrollNearest(contenedor, elemento)).toBeNull();
  });

  it('sube el scroll cuando el elemento queda arriba del área visible', () => {
    const contenedor = { top: 0, height: 300, scrollTop: 400 };
    // El elemento vive en y=350..394 dentro del contenido, pero la vista
    // actual arranca en 400 -> queda arriba, hay que subir hasta 350.
    const elemento = { top: -50, height: 44 }; // 350 - 400 = -50 relativo al viewport
    expect(calcularScrollNearest(contenedor, elemento)).toBe(350);
  });

  it('baja el scroll cuando el elemento queda debajo del área visible', () => {
    // Reproduce el caso medido en el diagnóstico: contenedor de 622px, ítem
    // activo que termina en 713px de contenido (713 > 622, tapado por el
    // pie del sidebar).
    const contenedor = { top: 0, height: 622, scrollTop: 0 };
    const elemento = { top: 669, height: 44 }; // termina en 713
    expect(calcularScrollNearest(contenedor, elemento)).toBe(713 - 622);
  });

  it('es "nearest", no "center": alinea el borde más cercano, no mueve más de lo necesario', () => {
    const contenedor = { top: 0, height: 622, scrollTop: 0 };
    // Apenas 1px fuera de vista por abajo -> ajuste mínimo, no un salto grande.
    const elemento = { top: 600, height: 30 }; // termina en 630, 8px de más
    expect(calcularScrollNearest(contenedor, elemento)).toBe(8);
  });

  it('trata los bordes exactos como visibles (no dispara ajuste en el límite)', () => {
    const contenedor = { top: 0, height: 622, scrollTop: 0 };
    const elemento = { top: 578, height: 44 }; // termina exactamente en 622
    expect(calcularScrollNearest(contenedor, elemento)).toBeNull();
  });

  it('calcula relativo al contenedor cuando este no arranca en top:0 del viewport', () => {
    // El sidebar no empieza en el borde de la ventana (hay logo + header
    // arriba). El cálculo debe ser relativo al contenedor, no al viewport.
    const contenedor = { top: 120, height: 500, scrollTop: 0 };
    const elemento = { top: 700, height: 44 }; // 700-120=580 dentro del contenido, termina en 624 > 500
    expect(calcularScrollNearest(contenedor, elemento)).toBe(624 - 500);
  });

  it('sigue funcionando cuando el contenedor ya estaba scrolleado', () => {
    const contenedor = { top: 0, height: 300, scrollTop: 200 };
    // Contenido: el elemento vive en y=550..594; la vista visible es 200..500.
    const elemento = { top: 350, height: 44 }; // 350 (viewport) + 200 (scrollTop) = 550 en contenido
    expect(calcularScrollNearest(contenedor, elemento)).toBe(594 - 300);
  });
});
