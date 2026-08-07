import * as React from "react";

import { cn } from "./utils";

/**
 * Un input numérico enfocado cambia de valor cuando el usuario hace
 * scroll con la rueda del mouse. En formularios de captura eso corrompe cifras
 * en silencio (la regla está en el CLAUDE.md raíz, "Responsive & Layout Rules":
 * "Number inputs: must prevent scroll-to-change with
 * onWheel={(e) => e.currentTarget.blur()}. This is a critical bug source").
 * El guard vive aquí para que ningún `Input` numérico nuevo nazca desprotegido;
 * los `<input>` nativos lo llevan escrito en el sitio (lo verifica
 * `src/__tests__/numberInputWheelContract.test.ts`).
 */
function Input({
  className,
  type,
  onWheel,
  ...props
}: React.ComponentProps<"input">) {
  const handleWheelNumber = (event: React.WheelEvent<HTMLInputElement>) => {
    onWheel?.(event);
    event.currentTarget.blur();
  };

  return (
    <input
      type={type}
      onWheel={type === "number" ? handleWheelNumber : onWheel}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-11 sm:h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base bg-input-background transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
