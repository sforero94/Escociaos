import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { Dialog } from '@/components/ui/dialog';
import { DetalleUnPesaje, ListaPesajesSemana } from '@/components/hato/components/DetallePesajeSemanalDialog';
import { borradorInicial, type FilaPesajeSemana, type PesajeEnSemana } from '@/utils/hato/detallePesajeSemanal';
import type { IdentidadAnimalHato } from '@/components/hato/hooks/useDatosProduccionPorVaca';

const manana: PesajeEnSemana = { clave: '2026-07-15|am', fecha: '2026-07-15', turno: 'am', etiqueta: 'Mañana' };
const tarde: PesajeEnSemana = { clave: '2026-07-15|pm', fecha: '2026-07-15', turno: 'pm', etiqueta: 'Tarde' };

const fila: FilaPesajeSemana = {
  id: 'fila-1',
  animal_id: 'vaca-1',
  fecha: '2026-07-15',
  litros_total: 18,
  litros_am: 12.5,
  litros_pm: 5.5,
  fuente: 'foto',
  created_at: '2026-07-15T19:30:00.000Z',
  created_by: 'user-1',
};

const identidad = new Map<string, IdentidadAnimalHato>([
  ['vaca-1', { numero: 117, nombre: 'Electra', numeroEsProvisional: false }],
]);

describe('detalle de pesaje en la semana', () => {
  it('lista mañana y tarde por separado', () => {
    const html = renderToStaticMarkup(
      <ListaPesajesSemana pesajes={[manana, tarde]} filas={[fila]} onElegir={() => undefined} />,
    );
    expect(html).toContain('2 pesajes en la semana');
    expect(html).toContain('Mañana');
    expect(html).toContain('Tarde');
  });

  it('pone la planilla al lado de los litros', () => {
    const html = renderToStaticMarkup(
      <Dialog open>
      <DetalleUnPesaje
        pesaje={manana}
        filas={[fila]}
        borradores={[borradorInicial(fila)]}
        identidadPorAnimal={identidad}
        capturaLigada={{
          id: 'cap-1',
          anio: 2026,
          mes: 7,
          storageBucket: 'hato-pesajes-fotos',
          storageRutas: ['pesaje-foto/a/pagina-1.jpg'],
          storageOk: true,
          createdBy: 'user-1',
          creadoEn: '2026-07-15T19:30:00.000Z',
          origen: 'telegram',
          desenlace: 'ok',
        }}
        fotosDelMes={[]}
        urls={{ 'hato-pesajes-fotos:pesaje-foto/a/pagina-1.jpg': 'https://ejemplo.test/planilla.jpg' }}
        autorNombre="Martha Vega"
        puedeEditar
        guardando={false}
        error={null}
        onCambiar={() => undefined}
        onVolver={() => undefined}
        onGuardar={() => undefined}
        onPedirBorrado={() => undefined}
      />
      </Dialog>,
    );
    expect(html).toContain('lg:grid-cols-2');
    expect(html).toContain('Planilla');
    expect(html).toContain('Datos del pesaje');
    expect(html).toContain('https://ejemplo.test/planilla.jpg');
    expect(html).toContain('Subió Martha Vega');
    expect(html).toContain('Desde Telegram');
    expect(html).toContain('#117 Electra');
    expect(html).toContain('12,5');
    expect(html).toContain('Guardar cambios');
    expect(html).toContain('Borrar este pesaje');
  });

  it('sin Gerencia no ofrece guardar ni borrar', () => {
    const html = renderToStaticMarkup(
      <Dialog open>
      <DetalleUnPesaje
        pesaje={manana}
        filas={[fila]}
        borradores={[borradorInicial(fila)]}
        identidadPorAnimal={identidad}
        capturaLigada={null}
        fotosDelMes={[]}
        urls={{}}
        autorNombre={null}
        puedeEditar={false}
        guardando={false}
        error={null}
        onCambiar={() => undefined}
        onVolver={() => undefined}
        onGuardar={() => undefined}
        onPedirBorrado={() => undefined}
      />
      </Dialog>,
    );
    expect(html).toContain('Sin autor registrado');
    expect(html).toContain('Solo Gerencia puede corregir o borrar un pesaje.');
    expect(html).not.toContain('Guardar cambios');
    expect(html).not.toContain('Borrar este pesaje');
  });

  it('el hook no borra la foto de Storage', () => {
    const hook = readFileSync(join(__dirname, '../components/hato/hooks/useDetallePesajeSemana.ts'), 'utf8');
    const dialogo = readFileSync(join(__dirname, '../components/hato/components/DetallePesajeSemanalDialog.tsx'), 'utf8');
    expect(hook).not.toMatch(/\.remove\s*\(/);
    expect(dialogo).not.toMatch(/\.remove\s*\(/);
    expect(hook).not.toContain('pesajeLeche');
    expect(hook).not.toContain('hato-pesaje-pipeline');
  });
});
