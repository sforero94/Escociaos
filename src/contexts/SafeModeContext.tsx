import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SafeModeContextType {
  isSafeModeEnabled: boolean;
  toggleSafeMode: () => void;
}

const SafeModeContext = createContext<SafeModeContextType | undefined>(undefined);

export function SafeModeProvider({ children }: { children: ReactNode }) {
  const [isSafeModeEnabled, setIsSafeModeEnabled] = useState<boolean>(() => {
    // Recuperar del localStorage al iniciar
    const saved = localStorage.getItem('safeModeEnabled');
    return saved === 'true';
  });

  const toggleSafeMode = () => {
    setIsSafeModeEnabled(prev => {
      const newValue = !prev;
      localStorage.setItem('safeModeEnabled', String(newValue));
      return newValue;
    });
  };

  // Sincronizar con localStorage cuando cambie
  useEffect(() => {
    localStorage.setItem('safeModeEnabled', String(isSafeModeEnabled));
  }, [isSafeModeEnabled]);

  return (
    <SafeModeContext.Provider value={{ isSafeModeEnabled, toggleSafeMode }}>
      {children}
    </SafeModeContext.Provider>
  );
}

export function useSafeMode() {
  const context = useContext(SafeModeContext);
  if (context === undefined) {
    throw new Error('useSafeMode debe usarse dentro de SafeModeProvider');
  }
  return context;
}
