import { useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabase } from '@/utils/supabase/client';
import { normalizarRutaFactura } from '@/utils/archivoFactura';

/** Storage still enforces reader permission; scope changes cancel presentation. */
export function useScopedStorageOpen(bucket: string, path: string | undefined, target: string, open: boolean) {
  const { user } = useAuth();
  const owner = user?.id ?? '';
  const generation = useRef(0);
  const busy = useRef(false);
  const [opening, setOpening] = useState(false);
  useLayoutEffect(() => {
    const requestGeneration = generation;
    const requestBusy = busy;
    ++requestGeneration.current;
    requestBusy.current = false;
    setOpening(false);
    return () => { ++requestGeneration.current; requestBusy.current = false; };
  }, [bucket, path, target, open, owner]);

  const openFile = async () => {
    if (!open || !owner || !path || busy.current) return;
    const request = generation.current;
    const current = () => request === generation.current;
    busy.current = true;
    setOpening(true);
    try {
      const client = getSupabase();
      const before = await client.auth.getUser();
      if (!current()) return;
      if (before.error || before.data.user?.id !== owner) throw new Error('La cuenta cambió. Abre de nuevo el registro.');
      const objectPath = bucket === 'facturas' ? normalizarRutaFactura(path) : path;
      const download = /\.pdf$/i.test(objectPath) ? { download: true } : undefined;
      const { data, error } = await client.storage.from(bucket).createSignedUrl(objectPath, 60, download);
      if (!current()) return;
      if (error || !data?.signedUrl) throw new Error('No se pudo generar el enlace');
      const after = await client.auth.getUser();
      if (!current()) return;
      if (after.error || after.data.user?.id !== owner) throw new Error('La cuenta cambió. Abre de nuevo el registro.');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      if (current()) throw error;
    } finally {
      if (current()) { busy.current = false; setOpening(false); }
    }
  };
  return { opening, openFile };
}
