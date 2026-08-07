"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "./utils";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // El track queda en 18.4×32px en todas las resoluciones (T-5: sin cambio de
        // identidad visual). En móvil, `before` agrega un área de toque invisible
        // centrada de 44×44px vía insets negativos simétricos — NO vía `inset-0
        // m-auto`, que la spec CSS2.1 §10.3.7 resuelve pegando la caja a una esquina
        // (margen auto negativo no reparte simétrico) en vez de centrarla cuando la
        // caja es más grande que su contenedor, que es exactamente este caso.
        // Se desactiva en escritorio (`content-none`, no solo invisible) porque ahí
        // 18.4px ya es un objetivo de mouse válido y no hace falta.
        "peer relative data-[state=checked]:bg-primary data-[state=unchecked]:bg-switch-background focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 before:absolute before:-inset-x-1.5 before:-inset-y-[13px] before:content-[''] sm:before:content-none",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-card dark:data-[state=unchecked]:bg-card-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
