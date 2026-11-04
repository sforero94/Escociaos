# Esco 2.0: prueba local de acceso

Esta pantalla sirve para comprobar la función desplegada `esco-consultas` con sesiones
reales. Está disponible solo en desarrollo en `/esco2-prueba`; no cambia el chat de
producción ni habilita un piloto.

## Recorrido

1. Iniciar el servidor local con `npm run dev -- --host 127.0.0.1`.
2. Abrir `http://127.0.0.1:3000/esco2-prueba` e iniciar sesión con una cuenta existente.
3. Con Gerencia activa, enviar una sola pregunta acotada de labores. Comprobar el código
   HTTP real, la respuesta y su origen. Un HTTP 200 por sí solo no demuestra cifras correctas:
   un turno puede terminar en `error_datos`, aclaración o respuesta determinista.
4. Cerrar sesión e iniciar con Administrador. Enviar una solicitud y comprobar HTTP 403
   desde el servidor. La pantalla permite este intento para probar la denegación del backend.

Cada envío usa el JWT de la sesión actual, sin copiarlo al chat ni a documentos. No hay
solicitudes al modelo al abrir la pantalla, reintentos automáticos ni fallback al motor anterior.
Las preguntas y respuestas permanecen en la pantalla; no se exportan como evidencia pública.

## Límites

- El servidor local usa la configuración pública del mismo proyecto Supabase. No requiere
  una llave de servicio ni la llave de OpenRouter en el navegador.
- Las solicitudes van a la función productiva y Gerencia puede generar consumo de modelo.
  Esta herramienta es para comprobaciones manuales acotadas.
- Registrar solo agregados y estados HTTP. No copiar filas ni valores de referencia a Git.
- Esta prueba no sustituye la evaluación independiente D31, ni prueba aceptación funcional.
- El implementador no abre ni ejecuta los 50 escenarios reservados.
- La migración 190 requiere una aprobación independiente. Antes del piloto se necesita
  un tope de gasto o límite de solicitudes por usuario.

## Estado

La función v2 está desplegada, con `verify_jwt = true` y `/health` anónimo 401.
El 2026-11-04, una sesión real de Gerencia activa obtuvo HTTP 200, respuesta con el contrato
válido y origen `compositor`, ruta `habitual`. No se verificó la cifra contra una referencia
independiente. Un intento anterior se interrumpió por una recarga local y quedó sin confirmar.
Una sesión real de Administrador obtuvo HTTP 403 con el mensaje de acceso exclusivo de
Gerencia. La pantalla mostró `Sin comprobar` al cambiar de cuenta, sin conservar la respuesta
de Gerencia. El cambio de cuenta usa cierre de sesión de alcance `local`.

Validación local: 25 pruebas, typecheck y build aprobados. Lint de los archivos modificados:
0 errores y 3 advertencias preexistentes en `App.tsx`. La ruta y el cliente de prueba no
aparecen en los archivos JavaScript del build productivo. En el checkpoint previo a la
publicación, estos cambios estaban sin commit ni push; no hubo despliegue manual de frontend.

La evaluación independiente D31 terminó el mismo día: 50 escenarios, dos configuraciones y
tres repeticiones (300 intentos), con aceptación rechazada. El acceso real comprobado aquí
no implica respuestas correctas. Agregados en `d31-result-2026-11-04.md`; datos por escenario
solo en la evidencia privada del evaluador.
