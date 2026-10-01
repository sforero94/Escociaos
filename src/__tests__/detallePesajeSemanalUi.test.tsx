import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { Dialog } from '@/components/ui/dialog';
import { DetalleSemanaPesaje, type FechaPesajeVista } from '@/components/hato/components/DetallePesajeSemanalDialog';
import { borradorInicial, type FilaPesajeSemana } from '@/utils/hato/detallePesajeSemanal';
import type { IdentidadAnimalHato } from '@/components/hato/hooks/useDatosProduccionPorVaca';

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

const jornada: FilaPesajeSemana = {
  ...fila,
  id: 'fila-j',
  litros_am: null,
  litros_pm: null,
  litros_total: 9,
};

const identidad = new Map<string, IdentidadAnimalHato>([
  ['vaca-1', { numero: 117, nombre: 'Electra', numeroEsProvisional: false }],
]);

const semanaTurnos: FechaPesajeVista[] = [{ fecha: '2026-07-15', filas: [fila], conTurno: true }];

const captura = {
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
};

function renderDetalle(extra: Partial<Parameters<typeof DetalleSemanaPesaje>[0]> = {}) {
  return renderToStaticMarkup(
    <Dialog open>
      <DetalleSemanaPesaje
        titulo="15 de julio de 2026"
        subtitulo="Semana · Mañana y tarde"
        fechas={semanaTurnos}
        borradores={[borradorInicial(fila)]}
        identidadPorAnimal={identidad}
        capturaLigada={captura}
        fotosDelMes={[]}
        urls={{ 'hato-pesajes-fotos:pesaje-foto/a/pagina-1.jpg': 'https://ejemplo.test/planilla.jpg' }}
        autorNombre="Martha Vega"
        puedeGerencia
        editando={false}
        guardando={false}
        error={null}
        onCambiar={() => undefined}
        onEditar={() => undefined}
        onCancelar={() => undefined}
        onGuardar={() => undefined}
        {...extra}
      />
    </Dialog>,
  );
}

describe('detalle de pesaje en la semana', () => {
  it('muestra mañana y tarde juntas, en solo lectura', () => {
    const html = renderDetalle();
    expect(html).toContain('15 de julio de 2026');
    expect(html).toContain('Mañana y tarde');
    expect(html).toContain('lg:grid-cols-2');
    expect(html).toContain('Planilla');
    expect(html).toContain('Datos del pesaje');
    expect(html).toContain('https://ejemplo.test/planilla.jpg');
    expect(html).toContain('Subió Martha Vega');
    expect(html).toContain('Desde Telegram');
    expect(html).toContain('#117 Electra');
    expect(html).toContain('>Mañana<');
    expect(html).toContain('>Tarde<');
    expect(html).toContain('12,5');
    expect(html).toContain('5,5');
    expect(html).toContain('Editar');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('Guardar cambios');
    expect(html).not.toContain('Volver a los pesajes');
    expect(html).not.toContain('Borrar este pesaje');
    expect(html).not.toContain('Descartar esta subida');
  });

  it('en edición las dos columnas aceptan litros y hay un solo guardado', () => {
    const html = renderDetalle({ editando: true });
    expect(html).toContain('<input');
    expect(html).toContain('aria-label="Mañana de #117 Electra"');
    expect(html).toContain('aria-label="Tarde de #117 Electra"');
    expect(html).toContain('Guardar cambios');
    expect(html).toContain('Cancelar');
    expect(html).not.toContain('Borrar este pesaje');
    expect(html).not.toContain('Descartar esta subida');
  });

  it('una jornada sin turno muestra el total y no ofrece borrar', () => {
    const html = renderDetalle({
      fechas: [{ fecha: '2026-07-15', filas: [jornada], conTurno: false }],
      borradores: [borradorInicial(jornada)],
      subtitulo: 'Semana',
    });
    expect(html).toContain('>Litros<');
    expect(html).not.toContain('>Mañana<');
    expect(html).not.toContain('Borrar este pesaje');
  });

  it('sin Gerencia no ofrece editar ni borrar', () => {
    const html = renderDetalle({
      puedeGerencia: false,
      capturaLigada: null,
      autorNombre: null,
      urls: {},
    });
    expect(html).toContain('Sin autor registrado');
    expect(html).toContain('Solo Gerencia puede corregir un pesaje.');
    expect(html).toContain('12,5');
    expect(html).toContain('5,5');
    expect(html).not.toContain('Editar');
    expect(html).not.toContain('Guardar cambios');
    expect(html).not.toContain('Borrar este pesaje');
    expect(html).not.toContain('<input');
  });

  it('el hook no borra la foto de Storage', () => {
    const hook = readFileSync(join(__dirname, '../components/hato/hooks/useDetallePesajeSemana.ts'), 'utf8');
    const dialogo = readFileSync(join(__dirname, '../components/hato/components/DetallePesajeSemanalDialog.tsx'), 'utf8');
    expect(hook).not.toMatch(/\.remove\s*\(/);
    expect(dialogo).not.toMatch(/\.remove\s*\(/);
    expect(hook).not.toContain('pesajeLeche');
    expect(hook).not.toContain('hato-pesaje-pipeline');
    expect(dialogo).toContain('planGuardarSemana');
    expect(dialogo).not.toContain('Volver a los pesajes');
    expect(dialogo).not.toContain('Borrar este pesaje');
    expect(dialogo).not.toContain('Descartar esta subida');
  });
});
