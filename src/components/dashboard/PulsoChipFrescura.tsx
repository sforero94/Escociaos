interface PulsoChipFrescuraProps {
  label: string;
  /** §9.1 del plan: "en ámbar cuando el dato pasa su umbral de vejez". El
   *  umbral lo decide cada tarjeta (nunca este componente, que sólo
   *  colorea lo que ya se decidió). */
  ambar?: boolean;
}

/**
 * PulsoChipFrescura - chip de frescura compartido por las tres tarjetas del
 * bloque "Pulso por negocio" (docs/plan_dashboard_centro_control.md §9.2:
 * "rounded-full bg-gray-100 px-2.5 py-0.5 text-xs, en ámbar cuando el dato
 * pasa su umbral de vejez").
 */
export function PulsoChipFrescura({ label, ambar = false }: PulsoChipFrescuraProps) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap ${
        ambar ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-brand-brown/60'
      }`}
    >
      {label}
    </span>
  );
}
