import { describe, expect, it } from 'vitest';
import { validarPuertaTelegram } from '../../supabase/functions/esco-consultas/puertaServicio.ts';

const config = { credencialServicio: 'servicio-sintetico', secretoTelegram: 'secreto-sintetico' };
describe('P4 puerta de servicio — unidad', () => {
  it('una petición web sin cabecera de servicio sigue su autorización de usuario', () => {
    expect(validarPuertaTelegram('jwt-usuario', null, config)).toEqual({ tipo: 'web' });
    expect(validarPuertaTelegram('jwt-usuario', null, {})).toEqual({ tipo: 'web' });
  });
  it('solo acepta la credencial de servicio exacta junto con el secreto', () => {
    expect(validarPuertaTelegram(config.credencialServicio, config.secretoTelegram, config)).toEqual({ tipo: 'servicio' });
    expect(validarPuertaTelegram('jwt-usuario', config.secretoTelegram, config)).toEqual({ tipo: 'error', estado: 401 });
    expect(validarPuertaTelegram(config.credencialServicio, 'distinto', config)).toEqual({ tipo: 'error', estado: 401 });
    expect(validarPuertaTelegram(config.credencialServicio, null, config)).toEqual({ tipo: 'error', estado: 401 });
  });
  it('falla cerrado si falta configuración de la puerta de servicio', () => {
    expect(validarPuertaTelegram(config.credencialServicio, config.secretoTelegram, { credencialServicio: config.credencialServicio })).toEqual({ tipo: 'error', estado: 503 });
    expect(validarPuertaTelegram('jwt-usuario', config.secretoTelegram, { secretoTelegram: config.secretoTelegram })).toEqual({ tipo: 'error', estado: 503 });
  });
});
