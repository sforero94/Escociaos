import { degreesToCardinal } from '@/utils/calculosClima';

interface WindDirectionArrowProps {
  degrees: number | null;
  size?: number;
}

export function WindDirectionArrow({ degrees, size = 24 }: WindDirectionArrowProps) {
  if (degrees === null) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-gray-400">--</span>
      </div>
    );
  }

  const cardinal = degreesToCardinal(degrees);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className="text-primary"
        style={{
          transform: `rotate(${degrees}deg)`,
          transition: 'transform 0.3s ease',
        }}
        aria-label={`Viento: ${cardinal}`}
      >
        {/* Arrow pointing up (North = 0°) */}
        <path
          d="M12 3 L7 17 L12 14 L17 17 Z"
          fill="currentColor"
        />
        {/* Shaft */}
        <line x1="12" y1="14" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span className="text-xs font-semibold text-gray-700">{cardinal}</span>
    </div>
  );
}
