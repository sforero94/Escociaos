import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { signIn } from '../utils/supabase/client';

interface LoginProps {
  onLoginSuccess: () => void;
}

export function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { user, session, error: signInError } = await signIn(email, password);
      
      if (signInError || !user || !session) {
        setError('Credenciales inválidas. Por favor verifica tu correo y contraseña.');
        return;
      }

      // Login exitoso - el AuthContext se actualizará automáticamente
      onLoginSuccess();
    } catch (err) {
      setError('Ocurrió un error al iniciar sesión. Intenta nuevamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#DEE5CC] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 -left-20 w-72 h-72 bg-[#73991C]/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 -right-20 w-96 h-96 bg-[#BFD97D]/10 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Card con color de fondo de la imagen */}
        <div className="bg-[#E7EDDE] rounded-3xl shadow-[0_8px_32px_rgba(115,153,28,0.15)] p-8 border border-[#73991C]/10">
          
          {/* Imagen del logo */}
          <div className="text-center mb-8">
            <div className="inline-block mb-6">
              <img
                src="https://ywhtjwawnkeqlwxbvgup.supabase.co/storage/v1/object/sign/photos/grafica%203.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80N2U5N2FlMi1lMDc1LTRiNzEtODI0Ny1mMzgwOGYzYzM0ODIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwaG90b3MvZ3JhZmljYSAzLnBuZyIsImlhdCI6MTc2NDcxNTIzMiwiZXhwIjoxNzk2MjUxMjMyfQ.gG3wTzZCKPNkyBdD0h2goOYBectef0hvLWm_Uvl8j0s"
                alt="Escocia Hass"
                className="w-full max-w-sm mx-auto rounded-2xl"
              />
            </div>
            <h1 className="text-3xl text-[#172E08] mb-2">
              Sistema de Gestión Agrícola
            </h1>
            <p className="text-[#4D240F]/70">
              Bienvenido a Escocia Hass
            </p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[#172E08]">
                Correo Electrónico
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@escocia.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="h-12 bg-white border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#172E08]">
                Contraseña
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="h-12 bg-white border-[#73991C]/20 focus:border-[#73991C] rounded-xl"
              />
            </div>

            {error && (
              <div className="bg-[#DC3545]/10 border border-[#DC3545]/20 text-[#DC3545] px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-gradient-to-r from-[#73991C] to-[#BFD97D] hover:shadow-lg hover:shadow-[#73991C]/30 text-white rounded-xl transition-all duration-200 hover:-translate-y-0.5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                'Iniciar Sesión'
              )}
            </Button>
          </form>

          {/* Footer */}
          <div className="text-center text-sm text-[#4D240F]/50">
            <p>© {new Date().getFullYear()} Creado por think SID con ❤️.</p>
          </div>
        </div>
      </div>
    </div>
  );
}