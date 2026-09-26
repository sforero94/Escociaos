# Runbook: detector de deriva de despliegue

Workflow: `.github/workflows/deteccion-deriva-despliegue.yml`
Script: `scripts/check-deploy-drift.mjs`
Proyecto: `ywhtjwawnkeqlwxbvgup`
Función: `make-server-1ccce916`
Issue: #293

## Qué distingue el fallo

| Señal en el log | Qué es | Qué hacer |
|---|---|---|
| `secret inválido/expirado` y HTTP 401 o 403 | El personal access token de Actions no autentica | Rotar `SUPABASE_ACCESS_TOKEN` (abajo). No redesplegar |
| `DERIVA DE DESPLIEGUE (reloj)` | Hay un commit en `main` posterior a `updated_at` de producción | `npx supabase functions deploy make-server-1ccce916` |
| `DERIVA DE DESPLIEGUE (contenido)` | El reloj marca deriva y `ezbr_sha256` no cambió: se republicó el bundle viejo | Desplegar de nuevo y comprobar que el hash cambie |
| `AVISO` y el job en verde | Hash sticky (#272 / ESCO-126): el commit cambió, el hash no, y el reloj está bien | Nada. No es un fallo |

Un 401 no reescribe `scripts/deploy-drift-state/`. El script sale antes de tocar ese fichero.

## Rotar `SUPABASE_ACCESS_TOKEN`

El workflow lee el secreto de **repositorio** de GitHub Actions. No lee los secretos de la edge function.

1. En Supabase, abrir [Account → Access Tokens](https://supabase.com/dashboard/account/tokens).
2. Generar un token nuevo. La cuenta tiene que poder leer el proyecto `ywhtjwawnkeqlwxbvgup`. El valor empieza por `sbp_` y solo se muestra una vez.
3. En GitHub: **Settings → Secrets and variables → Actions → Repository secrets**. Actualizar el secreto con el nombre exacto `SUPABASE_ACCESS_TOKEN`.

   Equivalente:

   ```sh
   gh secret set SUPABASE_ACCESS_TOKEN --repo sforero94/Escociaos
   ```

4. Revocar el token anterior en la misma página de Supabase.
5. Lanzar el workflow a mano: **Actions → Deteccion de deriva de despliegue → Run workflow**.
   - Verde: el secreto autentica.
   - Rojo con `secret inválido/expirado`: el valor no sirve. No es deriva de producción.

No redesplegar `make-server-1ccce916` por un 401. Producción no cambió.

## Aviso por Telegram

Si el job falla, el paso de aviso envía un mensaje. El cuerpo dice si fue autenticación o deriva.

Secretos de repositorio, nombres exactos:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Son secretos de **GitHub Actions**. El `TELEGRAM_BOT_TOKEN` de la edge function no llega a este workflow.

Si falta uno de los dos, el paso imprime:

```text
::warning::TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no estan configurados como secretos del repositorio -- no se pudo avisar.
```

El paso sale 0. El job sigue rojo por el chequeo. No es un silencio: el warning queda en el log (ESCO-78).

Configurarlos:

```sh
gh secret set TELEGRAM_BOT_TOKEN --repo sforero94/Escociaos
gh secret set TELEGRAM_CHAT_ID --repo sforero94/Escociaos
```

`TELEGRAM_BOT_TOKEN` es el token de @BotFather. `TELEGRAM_CHAT_ID` es el id numérico del chat de ops que debe recibir el aviso. Este runbook no fija el chat: lo elige quien opera.

El mensaje no usa Markdown. El slug `make-server-1ccce916` tiene guiones bajos, y Telegram rechaza el envío si esos caracteres quedan sin cerrar en Markdown.
