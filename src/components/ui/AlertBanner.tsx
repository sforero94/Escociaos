import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

interface AlertBannerProps {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  timestamp?: string;
  onClick?: () => void;
}

export function AlertBanner({ type, message, timestamp, onClick }: AlertBannerProps) {
  const getStyles = () => {
    switch (type) {
      case 'info':
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          text: 'text-blue-800',
          icon: Info,
          iconColor: 'text-blue-500',
        };
      case 'warning':
        return {
          bg: 'bg-[#FFC107]/10',
          border: 'border-[#FFC107]/20',
          text: 'text-[#333333]',
          icon: AlertTriangle,
          iconColor: 'text-[#FFC107]',
        };
      case 'error':
        return {
          bg: 'bg-[#DC3545]/10',
          border: 'border-[#DC3545]/20',
          text: 'text-[#DC3545]',
          icon: AlertCircle,
          iconColor: 'text-[#DC3545]',
        };
      case 'success':
        return {
          bg: 'bg-[#28A745]/10',
          border: 'border-[#28A745]/20',
          text: 'text-[#28A745]',
          icon: CheckCircle,
          iconColor: 'text-[#28A745]',
        };
    }
  };

  const styles = getStyles();
  const IconComponent = styles.icon;

  return (
    <div
      className={`${styles.bg} ${styles.border} border rounded-xl p-4 flex items-start gap-3 transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
      }`}
      onClick={onClick}
    >
      <IconComponent className={`w-5 h-5 ${styles.iconColor} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className={`${styles.text} break-words`}>{message}</p>
        {timestamp && <p className="text-xs text-[#4D240F]/60 mt-1">{timestamp}</p>}
      </div>
    </div>
  );
}