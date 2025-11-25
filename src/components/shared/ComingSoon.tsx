import { Construction, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';

interface ComingSoonProps {
  moduleName: string;
}

export function ComingSoon({ moduleName }: ComingSoonProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center p-4">
      <div className="text-center max-w-lg">
        <div className="mb-8 inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-[#73991C] to-[#BFD97D] rounded-3xl shadow-lg shadow-[#73991C]/20">
          <Construction className="w-12 h-12 text-white" />
        </div>
        
        <h1 className="text-3xl text-[#172E08] mb-4">
          {moduleName}
        </h1>
        
        <p className="text-lg text-[#4D240F]/70 mb-8">
          Este módulo está en construcción y estará disponible próximamente.
        </p>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)] mb-8">
          <p className="text-sm text-[#4D240F]/60 mb-2">Estado del desarrollo</p>
          <div className="w-full bg-[#E7EDDD] rounded-full h-2.5">
            <div className="bg-gradient-to-r from-[#73991C] to-[#BFD97D] h-2.5 rounded-full" style={{ width: '25%' }}></div>
          </div>
        </div>

        <Button
          onClick={() => navigate('/')}
          className="bg-[#73991C] hover:bg-[#5f7d17] text-white rounded-xl transition-all duration-200"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver al Dashboard
        </Button>
      </div>
    </div>
  );
}
