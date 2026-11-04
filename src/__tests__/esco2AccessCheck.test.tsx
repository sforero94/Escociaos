import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Esco2AccessCheck } from '../components/esco2/Esco2AccessCheck';

const { ejecutar, auth } = vi.hoisted(() => ({
  ejecutar: vi.fn(),
  auth: { user: { id: 'usuario-a' }, profile: { rol: 'Gerencia' }, signOut: vi.fn() },
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../utils/esco2ClientePrueba', () => ({
  ENDPOINT_PRUEBA_ESCO2: 'https://proyecto.supabase.co/functions/v1/esco-consultas',
  ejecutarPruebaEsco2: ejecutar,
  cerrarSesionPruebaEsco2: vi.fn(),
}));

describe('pantalla local de prueba Esco 2.0', () => {
  beforeEach(() => { ejecutar.mockReset(); auth.profile.rol = 'Gerencia'; });

  it('starts explicitly unverified, shows the target and makes no automatic request', () => {
    const html = renderToStaticMarkup(<Esco2AccessCheck />);
    expect(html).toContain('Sin comprobar');
    expect(html).toContain('/functions/v1/esco-consultas');
    expect(html).toContain('Gerencia');
    expect(html).toContain('Comprobar acceso');
    const resultado = html.slice(html.indexOf('aria-label="Resultado de la prueba"'));
    expect(resultado).not.toContain('HTTP 200');
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it('allows an Administrador to send a real request instead of hiding the test', () => {
    auth.profile.rol = 'Administrador';
    const html = renderToStaticMarkup(<Esco2AccessCheck />);
    expect(html).toContain('Administrador');
    expect(html).toContain('Comprobar acceso');
    expect(html).toContain('403');
    expect(ejecutar).not.toHaveBeenCalled();
  });
});
