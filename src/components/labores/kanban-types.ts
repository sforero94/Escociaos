import type { Tarea } from './Labores';
import type { LucideIcon } from 'lucide-react';
import {
  ListTodo,
  Calendar,
  Cog,
  CheckCircle,
  XCircle,
} from 'lucide-react';

export interface ColumnActions {
  onVerDetalles: (tarea: Tarea) => void;
  onEditar: (tarea: Tarea) => void;
  onRegistrarTrabajo: (tarea: Tarea) => void;
  onCambiarEstado: (tarea: Tarea, nuevoEstado: Tarea['estado']) => void;
  onEliminar: (tarea: Tarea) => void;
}

export interface ColumnConfig {
  key: Tarea['estado'];
  title: string;
  icon: LucideIcon;
  bgClass: string;
  borderClass: string;
  iconColorClass: string;
  showAddButton: boolean;
  isArchive: boolean;
}

export const COLUMN_CONFIGS: ColumnConfig[] = [
  {
    key: 'Banco',
    title: 'Banco',
    icon: ListTodo,
    bgClass: 'bg-gray-50',
    borderClass: 'border-gray-200',
    iconColorClass: 'text-gray-600',
    showAddButton: true,
    isArchive: false,
  },
  {
    key: 'Programada',
    title: 'Programadas',
    icon: Calendar,
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-200',
    iconColorClass: 'text-blue-600',
    showAddButton: true,
    isArchive: false,
  },
  {
    key: 'En Proceso',
    title: 'En Proceso',
    icon: Cog,
    bgClass: 'bg-yellow-50',
    borderClass: 'border-yellow-200',
    iconColorClass: 'text-yellow-600',
    showAddButton: false,
    isArchive: false,
  },
  {
    key: 'Completada',
    title: 'Completadas',
    icon: CheckCircle,
    bgClass: 'bg-green-50',
    borderClass: 'border-green-200',
    iconColorClass: 'text-green-600',
    showAddButton: false,
    isArchive: true,
  },
  {
    key: 'Cancelada',
    title: 'Canceladas',
    icon: XCircle,
    bgClass: 'bg-red-50',
    borderClass: 'border-red-200',
    iconColorClass: 'text-red-600',
    showAddButton: false,
    isArchive: true,
  },
];
