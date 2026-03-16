import { useParams, useNavigate } from 'react-router-dom';
import { ApplicationResultsDashboard } from './report/ApplicationResultsDashboard';

export function ReporteAplicacionWrapper() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    navigate('/aplicaciones');
    return null;
  }

  return <ApplicationResultsDashboard aplicacionId={id} />;
}
