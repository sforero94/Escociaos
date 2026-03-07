import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ChatPanel } from './ChatPanel';

export function ChatFAB() {
  const { hasRole } = useAuth();
  const [open, setOpen] = useState(false);

  if (!hasRole(['Gerencia'])) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ bottom: '1.5rem', right: '1.5rem' }}
        aria-label="Abrir chat Esco"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
      <ChatPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
