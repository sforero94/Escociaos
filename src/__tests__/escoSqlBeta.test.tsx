import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EscoSqlBeta } from '../components/esco2/EscoSqlBeta';
import { ConsultasSql } from '../components/esco2/ConsultasSql';
import { EscoSqlFAB } from '../components/esco2/EscoSqlFAB';
import { MemoryRouter } from 'react-router-dom';

const { auth } = vi.hoisted(() => ({ auth: { user: { id: 'usuario-a' } as { id: string } | null, profile: { rol: 'Gerencia' }, hasRole: (roles: string[]) => roles.includes(auth.profile.rol) } }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../utils/esco2ClientePrueba', async () => {
  const real = await vi.importActual<typeof import('../utils/esco2ClientePrueba')>('../utils/esco2ClientePrueba');
  return { ...real, ejecutarPruebaEsco2: vi.fn() };
});

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

describe('Esco SQL (beta) — pantalla de producción solo Gerencia', () => {
  it('arranca vacía, sin pedir nada al servidor, con ejemplos y el campo de pregunta', () => {
    const html = renderToStaticMarkup(<EscoSqlBeta />);
    expect(html).toContain('Esco SQL');
    expect(html).toContain('beta');
    expect(html).toContain('Ejemplos');
    expect(html).toContain('Pregunta para Esco SQL');
  });

  it('no pinta nada sin usuario', () => {
    auth.user = null;
    expect(renderToStaticMarkup(<EscoSqlBeta />)).toBe('');
    auth.user = { id: 'usuario-a' };
  });

  it('el desplegable muestra propósito, SQL, filas, truncado y errores de Postgres', () => {
    const html = renderToStaticMarkup(
      <ConsultasSql consultas={[
        { sql: 'SELECT 1', proposito: 'Contar', n_filas: 500, truncado: true, error: null, filas_muestra: [{ a: 1 }] },
        { sql: 'SELECT x', proposito: 'Fallida', n_filas: null, truncado: false, error: 'no existe la columna x', filas_muestra: [] },
      ]} />,
    );
    expect(html).toContain('Consultas usadas (2)');
    expect(html).toContain('TRUNCADO a 500 filas');
    expect(html).toContain('Error de Postgres: no existe la columna x');
  });

  it('la ruta /esco-sql está detrás de RoleGuard Gerencia y el menú la oculta a los demás roles', () => {
    const app = leer('../App.tsx');
    expect(app).toMatch(/path="esco-sql" element=\{<RoleGuard allowedRoles=\{\['Gerencia'\]\}><EscoSqlBeta \/><\/RoleGuard>\}/);
    const layout = leer('../components/Layout.tsx');
    expect(layout).toMatch(/id: 'esco-sql'[^}]*path: '\/esco-sql', soloGerencia: true/);
  });

  it('la pantalla usa siempre el motor SQL y nunca el actual', () => {
    const fuente = leer('../components/esco2/EscoSqlBeta.tsx');
    expect(fuente).toContain("motor: 'sql'");
    expect(fuente).not.toContain("motor: 'actual'");
  });

  describe('segundo botón flotante', () => {
    const pintar = (ruta: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[ruta]}><EscoSqlFAB /></MemoryRouter>);

    it('Gerencia ve el botón, con el panel todavía sin montar', () => {
      auth.profile.rol = 'Gerencia';
      const html = pintar('/labores');
      expect(html).toContain('Abrir Esco SQL (beta)');
      expect(html).not.toContain('role="dialog"');
    });

    it('otros roles no ven nada', () => {
      auth.profile.rol = 'Administrador';
      expect(pintar('/labores')).toBe('');
      auth.profile.rol = 'Gerencia';
    });

    it('en la página completa /esco-sql el botón sobra', () => {
      expect(pintar('/esco-sql')).toBe('');
    });

    it('queda junto al botón de Esco de siempre, que no cambia, y ambos se montan en App', () => {
      const app = leer('../App.tsx');
      expect(app).toContain('<ChatFAB />');
      expect(app).toContain('<EscoSqlFAB />');
      expect(leer('../components/chat/ChatFAB.tsx')).not.toContain('SQL');
    });
  });
});
