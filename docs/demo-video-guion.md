# Escocia OS — Demo video shooting script

Target: **75–85s hero reel**, no voiceover, music + on-screen captions, for a portfolio grid.
Recorded on macOS with **Screen Studio**.

---

## 1. Tooling

### Primary: Screen Studio (macOS only)

This is the tool that does everything asked for — motion between screens, cinematic zoom,
smoothed cursor with motion blur, keystroke display, auto-generated camera moves. Nothing else
on Mac matches its output quality per hour of effort.

- $9/mo billed annually ($108/yr), or $29/mo monthly. Free trial exports with a watermark.
- Mac-only. No Windows build and no announced timeline for one.

### Supporting stack

| Need | Tool |
|---|---|
| iPhone footage (Telegram bot beat) | QuickTime → *New Movie Recording* → source = iPhone over cable. Drop the `.mov` into the Screen Studio timeline. |
| Music | Epidemic Sound or Artlist. Restrained, one build, no drop. |
| Title card | Export a PNG from the Figma file, drop it in as the last clip. Don't build motion graphics — not worth it at this length. |
| Clickable demo (optional companion) | Arcade or Supademo. A portfolio page is stronger with a video **and** a clickable walkthrough; the video sells, the walkthrough proves. |

### Alternatives, if the budget is zero

- **Tella** — free tier, browser-based, has auto-zoom. Output is visibly a tier below Screen Studio.
- **FocuSee** / **Cursorful** — cheaper one-time licenses, decent auto-zoom, weaker cursor physics.
- **OBS + Final Cut** — full control, ~5× the editing time. Not worth it for 80 seconds.

---

## 2. Before you hit record

**Data.** This is a live production system holding a real client's financials. Before anything
goes in a public portfolio, either get the owner's explicit OK on the numbers shown, or record
against a seeded instance. The Finanzas beats are the exposed ones — P&G, gastos, ingresos.

**Environment.**
- Dedicated Chrome profile: no extensions, no bookmarks bar (`⌘⇧B`), no other tabs.
- Window at a fixed **1440×900**. Don't fullscreen — the padding Screen Studio adds around a
  windowed capture is part of the look.
- Log in as a **Gerencia** user. Every module is visible and the Esco FAB only renders for Gerencia.
- Pre-load every route once so no `<Suspense>` spinner appears mid-take (all routes are `React.lazy`).
- Clean desktop wallpaper, menu bar hidden, Do Not Disturb on.

**Technique.**
- **Record each beat as a separate take.** Nine short clips, not one long pass. You will never
  get nine clean beats in a row, and the timeline handles multi-clip fine.
- Move the cursor slowly and deliberately, and **pause ~0.5s before every click**. Screen Studio
  smooths motion but it can't invent a hold that isn't there.
- Re-record a beat rather than trying to fix a fumble in the edit.

---

## 3. Screen Studio settings

- **Auto-zoom OFF** for beats 2 and 9; **manual zoom keyframes** everywhere else. Auto-zoom on a
  dense dashboard chases the cursor and reads as nausea, not polish.
- Max **2 zoom events per beat**. Hold every zoom ≥1.5s before moving again. This is the single
  rule that separates a good reel from a dizzy one.
- Cursor: size 120%, click highlight on, smooth movement on, **motion blur on**.
- Background: subtle gradient built from the app's own primary `#73991C`, desaturated. Padding
  ~40px, corner radius 12, medium shadow. **Change it off the default** — Screen Studio's stock
  purple gradient is instantly recognizable and reads as "template".
- Speed ramps: 1.5–2× on navigation and typing, **1.0× on every reveal**.
- Captions: Screen Studio text overlay, bottom-left, single line, 200ms fade. Use **Visby CF** if
  you have it locally — it's the app's own font, and matching it is the kind of detail a design
  portfolio gets judged on.
- Cut the beat boundaries to the music's bar lines. This is what makes a reel feel expensive.

---

## 4. The flow

The arc: **one number → the whole system → the hard parts → the magic → out.**
Open on a detail so the reveal earns the scope shot, then spend the middle proving the thing is
real, and close on the two features nobody expects (photo OCR, conversational agent).

### Beat 1 — Cold open · 0:00–0:06

- **Screen:** `/produccion`, Rentabilidad tab. Start the clip **already at ~250% zoom** on the
  *Costo/kg* KPI tile.
- **Move:** hold 1.2s, then a single slow ease-out to 1.0× revealing the full dashboard.
- **Caption:** `Una finca de aguacate en Aguadas, Caldas.` → `Tres años de operación, en un sistema.`

### Beat 2 — Scope · 0:06–0:14

- **Screen:** cursor walks down the sidebar, expanding **Aguacate → Hato Lechero → Finanzas**.
  Don't navigate — just expand the groups.
- **Move:** no zoom, full frame, 1.4× speed ramp.
- **Caption:** `Cinco módulos · Aguacate · Hato lechero · Ganado · Finanzas · Reportes`

### Beat 3 — Monitoreo · 0:14–0:24

- **Screen:** `/monitoreo` → Mapa de Calor. Hover a red cell so the tooltip fires, then click
  through to Priorización de Scouting.
- **Move:** zoom 1.6× centered on the grid, slow pan across two rows, hold on the tooltip.
- **Caption:** `4.100+ observaciones de plagas. Incidencia ponderada, priorización automática de scouting.`

### Beat 4 — Clima · 0:24–0:31

- **Screen:** `/clima`. Live station readings.
- **Move:** one zoom onto the freshness stamp ("hace N minutos").
- **Caption:** `Estación meteorológica propia. Lectura cada cinco minutos.`

### Beat 5 — Finanzas · 0:31–0:42

- **Screen:** `/finanzas/reportes` → P&G. Expand one accordion line, then switch the view tab
  Global → Aguacate Hass and let the numbers re-render.
- **Move:** zoom 1.4× on the Margen de Contribución row as the tab switches.
- **Caption:** `P&G y flujo de caja reales. Reglas contables del negocio, no una plantilla.`

### Beat 6 — Chequeo por foto · 0:42–0:53 ⭐

The strongest ten seconds in the reel. Do not cut this one for time.

- **Screen:** `/hato-lechero/chequeos` → upload a photo of the hand-filled paper planilla → the
  diff preview renders → click **Aprobar**.
- **Move:** zoom into the diff table as it appears, hold, ease back out on the approve click.
- **Caption:** `Se fotografía la planilla en papel. El sistema la lee y propone el cambio. Un humano aprueba.`

### Beat 7 — Esco · 0:53–1:05 ⭐

- **Screen:** click the FAB (bottom-right), type
  `¿Cuánto gasté en fungicidas este semestre y en qué lotes?`, let the answer render.
- **Move:** zoom 1.5× into the chat panel while typing, **keystroke display ON** for this beat only.
- **Caption:** `Esco: agente conversacional con 33 herramientas sobre los datos de la finca.`

### Beat 8 — Campo · 1:05–1:13

- **Screen:** iPhone footage — Telegram bot registering a pesaje de leche.
- **Move:** no zoom. Phone frame centered, app screens blurred behind it.
- **Caption:** `En el campo no hay buena señal. Se captura por Telegram.`

### Beat 9 — Outro · 1:13–1:22

- **Screen:** five hard cuts at ~0.4s each — Tablero, Mapa de Calor, P&G, Hoja de Vida, Esco —
  then the title card.
- **Move:** no zoom, no easing. Straight cuts on the beat, music resolves on the card.
- **Card:** `Escocia OS` / `React · TypeScript · Supabase · Vercel` / your name and handle.

**Runtime: ~82s.**

---

## 5. Export

- 1080p60 MP4 / H.264 for the portfolio embed.
- A second export: **15s muted loop** (beats 1, 3 and 6) for the portfolio card thumbnail. Most
  grids autoplay muted — give them something that reads without sound.
- Keep the Screen Studio project file. Re-cutting for a client pitch later means swapping captions,
  not re-recording.

---

## 6. If you also want the narrated 3–4 min cut

Record the same nine beats, but hold each screen ~3× longer and narrate over the top. The reel
is then a straight cut-down of that footage — same takes, tighter timeline, captions instead of
voice. Record the long version first if you think you'll want both; going the other direction
means re-shooting.
