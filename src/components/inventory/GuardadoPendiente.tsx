import { Button } from '@/components/ui/button';

export function GuardadoPendiente({ pendiente, errorLocal, ocupado, onVerificar }: {
  pendiente: boolean; errorLocal: string | null; ocupado: boolean; onVerificar: () => void;
}) {
  if (errorLocal) return <p role="alert" className="mb-4 text-red-700">{errorLocal}</p>;
  if (!pendiente) return null;
  return (
    <div role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2">
      <p>El último guardado no tiene confirmación. Verifícalo antes de guardar otros datos.</p>
      <Button type="button" variant="outline" disabled={ocupado} onClick={onVerificar}>
        Verificar guardado pendiente
      </Button>
    </div>
  );
}
