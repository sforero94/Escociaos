# Plan — reactivar el pipeline de Tailwind y actualizar la UI

Origen: decisión de Santiago (2026-08-06), tras descubrir en la auditoría de UI del Hato que las
primitivas de shadcn se renderizaban como texto plano porque el build congelado no traía sus clases.

---

## 1. El diagnóstico

**Esto no es una decisión de arquitectura. Es un proyecto de Tailwind v4 al que le falta el paso de
compilación.**

| Evidencia | Qué significa |
|---|---|
| `src/index.css` arranca con `/*! tailwindcss v4.1.3 \| MIT License */` | Es la **salida** de una compilación, guardada en el repo — no una fuente |
| `src/styles/globals.css` usa `@custom-variant dark` y `@theme inline` | Está escrito para v4… y el navegador **ignora esas directivas enteras**. Los tokens que define ahí no existen en tiempo de ejecución |
| `package.json` no tiene `tailwindcss` ni `postcss` | El compilador no está instalado |
| `vite.config.ts` solo carga `react()` | No hay plugin que lo ejecute |

Viene del scaffold de Figma Make: exportó el CSS ya compilado y el pipeline nunca se cableó. Desde
entonces, **una clase que no esté en ese archivo no falla — no hace nada.** Sin error, sin aviso.

### El costo medido (2026-08-06)

Barrido de todos los `className` de `src/**/*.tsx` contra `index.css` + `globals.css`:

- **1.448** clases distintas usadas en el código
- **~845** no existen en el build → **muertas**
- **~4.400** apariciones de clases muertas

Las familias que más duelen:

| Familia | Apariciones | Qué se pierde hoy |
|---|---|---|
| `text-brand-brown/*` | ~640 | Los textos de marca no toman su color; heredan el del padre |
| `space-y-*` | ~380 | Espaciado vertical entre elementos — por eso muchas pantallas se ven apretadas |
| `border-primary/*`, `border-secondary/*` | ~260 | Bordes sin color |
| `focus:ring-primary`, `focus:border-primary` | ~155 | **Estados de foco: navegación por teclado prácticamente a ciegas** |
| `tabular-nums` | 71 | Números que no alinean en las tablas |
| resto | ~2.900 | Separadores, tamaños, tipografías, variantes responsive |

**Dos bugs reales de esta misma familia, encontrados el 2026-08-06** — ninguno detectado por 1.993
tests, lint ni typecheck; los dos aparecieron mirando la pantalla:

1. `ui/button.tsx` sin `forwardRef` → los tres desplegables de carga por foto no abrían.
2. `Toggle`/`ToggleGroup` sin ~15 de sus clases → se renderizaban como texto plano. Otro módulo
   (`PriorizacionScoutingView`) ya se había estrellado con lo mismo y se hizo un control a mano.

---

## 2. Decisiones del dueño (2026-08-06)

| # | Decisión | Consecuencia |
|---|---|---|
| T-1 | **Medir antes de comprometerse.** Una sesión de spike en rama descartable que capture el antes/después de todas las pantallas. | Convierte "va a cambiar todo" en una lista concreta y priorizada, antes de gastar sesiones. |
| T-2 | **La app debe verse siempre presentable.** Martha y Consuelo la usan a diario. | Todo vive en rama y se despliega cuando está completo y verificado. Merge grande al final, no despliegues parciales. |
| T-3 | **El alcance es rediseño visual**: colores, tipografía, espaciados. | Cambia el orden natural del trabajo: como los tokens se van a redefinir igual, que `@theme inline` cobre vida es el **punto de partida** del rediseño, no una regresión que haya que contener. |

---

## 3. Lo que hay que desmontar además del pipeline

Encender Tailwind no es solo instalar el compilador. Hay infraestructura construida **alrededor** de
la limitación que deja de tener sentido, y si no se retira, sabotea el trabajo nuevo.

1. **Cuatro tests estáticos verifican que cada clase exista en `index.css`**:
   `hatoCicloManualTailwind`, `hatoProduccionTableroTailwind`, `hatoCorreccionChequeoTailwind`,
   `hatoPesajeFotoTailwind`. Con Tailwind corriendo pasan de red de seguridad a **freno**: harían
   fallar clases perfectamente válidas. Hay que retirarlos o reconvertirlos en otra cosa.
2. **~40 reglas escritas a mano en `globals.css` duplican utilidades de Tailwind** — incluidas las
   que se agregaron el 2026-08-06 para revivir `ToggleGroup` (`.bg-transparent`, `.w-auto`,
   `.rounded-none`, `.first\:rounded-l-md`…). Con el compilador activo quedan redundantes y pueden
   pelear por especificidad y orden de cascada. Hay que limpiarlas.
3. **La caution zone "Tailwind classes are FROZEN" del `CLAUDE.md` raíz es la regla más citada del
   repo** — aparece en 10 documentos. Mientras siga escrita, cada sesión futura seguirá evitando
   clases válidas y agregando CSS a mano. Reescribirla es parte del trabajo, no un adorno.
4. **`main.tsx` importa `index.css` y después `globals.css`.** Con Tailwind vivo el orden de la
   cascada pasa a importar de verdad; hay que decidirlo explícitamente en vez de heredarlo.

---

## 4. Fases

```
F0 spike medido  ──>  F1 encender  ──>  F2 corregir regresión  ──┐
                                    └──>  F3 sistema de diseño ──┴──>  F4 rediseño por módulo
```

### F0 · Spike medido — 1 sesión, rama descartable

Rama `spike/tailwind-medicion`, **no se mergea nunca**.

- Capturar las ~25 pantallas del app con el navegador, en escritorio y móvil, **antes**.
- Encender Tailwind (instalar, cablear el plugin, convertir `index.css` en fuente).
- Capturar las mismas pantallas **después**.
- Entregable: informe con el diff pantalla por pantalla, clasificado por severidad
  (layout roto > layout desplazado > color/tipografía > mejora), y una estimación real de F2.

**Este es el único entregable que importa de F0: un número.** Sin él, F2 es una apuesta.

### F1 · Encender el pipeline — 1 sesión

Rama larga `feat/tailwind-pipeline` (T-2: nada sale a producción hasta el final).

- `tailwindcss@4` + `@tailwindcss/vite` como devDependencies; plugin en `vite.config.ts`.
- `src/index.css` pasa de 5.577 líneas compiladas a un archivo fuente.
- Auditar los tokens de `@theme inline`, que cobran vida por primera vez.
- Retirar los 4 guards estáticos y limpiar las ~40 reglas duplicadas de `globals.css`.
- Reescribir la caution zone del `CLAUDE.md` y las menciones en los 10 documentos.
- Verificar que `npm run build` produce un CSS de tamaño razonable (hoy son 136 KB congelados).

### F2 · Corregir la regresión — N sesiones, priorizado por F0

Módulo por módulo, con verificación visual obligatoria en cada uno. El orden lo decide el informe de
F0, no la intuición.

### F3 · Sistema de diseño — puede solaparse con F2

Con `@theme` funcionando, definir **una vez** colores, tipografía y escala de espaciados (T-3), en
vez de repartirlos por componente. Es lo que hace que F4 sea rápido.

### F4 · Rediseño por módulo

Sobre un pipeline sano y un sistema de tokens real.

---

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| El diff de F0 resulta inmanejable | Es exactamente para eso que F0 existe y es descartable. Si el número asusta, se replantea el enfoque antes de gastar nada. |
| La rama larga de T-2 diverge de `main` | Rebase frecuente; evitar rondas de funcionalidad grandes en paralelo mientras F2 esté abierta. |
| Alguien "arregla" `globals.css` durante F2 sin saber que el pipeline cambió | La caution zone reescrita en F1 es la defensa. Va **antes** que F2, no después. |
| El CSS compilado crece mucho | Medir en F1; v4 hace tree-shaking por defecto sobre las clases realmente usadas. |
| Se pierde el `forwardRef` de `ui/button.tsx` en alguna limpieza | Ya documentado en el propio archivo y en memoria. Verificar que sigue tras F1. |
