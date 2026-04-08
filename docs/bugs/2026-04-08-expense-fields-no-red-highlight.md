# Bug: Incomplete expense/income form fields not highlighted in red

**Date:** 2026-04-08
**Severity:** Medium
**Status:** Fixed

## Symptom
When a user submits the GastoForm or IngresoForm with incomplete required fields, the fields that failed validation are not visually highlighted in red. The only feedback is a toast notification. The user has no visual cue on *which specific field* needs attention.

## Reproduction path
1. Open "Nuevo Gasto" or "Nuevo Ingreso" dialog
2. Leave required fields empty (e.g., nombre, negocio, region, categoria, valor, medio_pago)
3. Click "Crear Gasto" / "Crear Ingreso"
4. **Expected:** Empty required fields get a red border/ring
5. **Actual:** Only a toast error appears for the first invalid field. No visual change on the fields themselves.

## Hypotheses evaluated

| Hypothesis | Status | Evidence |
|---|---|---|
| No error state exists in form components | Confirmed root cause | No `errors` state in GastoForm or IngresoForm |
| `aria-invalid` never set on fields | Confirmed root cause | Zero `aria-invalid` matches in `finanzas/` directory |
| Early-return shows only first error | Confirmed (secondary) | Sequential `if/return` in handleSubmit (lines 197-224 GastoForm, 221-244 IngresoForm) |
| No error clearing on input change | Confirmed (secondary) | No error state means no clearing mechanism |
| Form component (react-hook-form) not used | Contributing factor | Forms use raw Input/Select, not FormControl wrapper |
| CSS styling for `aria-invalid` broken | Ruled out | `aria-invalid:border-destructive` classes present in Input (line 13), SelectTrigger (line 44), Textarea (line 10) |

## Root cause
The form validation in `handleSubmit` only shows toast notifications via `toast.error()` and returns early. It never:
1. Tracks which fields failed validation in a state object
2. Passes `aria-invalid` to the UI components (Input, SelectTrigger, Textarea)
3. Collects ALL errors at once (stops at the first failure)

The UI components already have the CSS infrastructure to display red borders when `aria-invalid="true"` is set — this feature just isn't wired up.

## Impact
- **GastoForm** (`src/components/finanzas/components/GastoForm.tsx`)
- **IngresoForm** (`src/components/finanzas/components/IngresoForm.tsx`)
- No other components depend on the internal validation state of these forms
- Regression risk: Low

## Fix plan
For both GastoForm and IngresoForm:

1. Add `errors` state: `const [errors, setErrors] = useState<Record<string, string>>({})` to track field-level validation errors
2. Refactor `handleSubmit` validation: collect ALL errors into the `errors` object at once (no early returns), then show a single summary toast if errors exist
3. Pass `aria-invalid={!!errors.<field>}` to each Input and `aria-invalid` to each SelectTrigger for required fields
4. Clear field errors in `handleInputChange` when the user modifies a previously-invalid field
5. Keep toast notifications as a secondary feedback channel (summary message)

## Tests
- [ ] Submitting GastoForm with empty required fields shows red borders on all invalid fields
- [ ] Submitting IngresoForm with empty required fields shows red borders on all invalid fields
- [ ] Fixing a field clears its red border immediately
- [ ] All errors shown at once (not just the first one)
- [ ] Successful submission still works correctly after errors are corrected
- [ ] Toast notification still appears as summary feedback
