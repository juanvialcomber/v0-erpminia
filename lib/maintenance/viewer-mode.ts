export type MaintenanceViewerMode = 'leadership' | 'planning' | 'execution' | 'oversight' | 'general';

export function resolveMaintenanceViewerMode(cargoName: string | null): MaintenanceViewerMode {
  const cargo = String(cargoName || '').trim().toLowerCase();
  if (cargo === 'jefe departamento de mantenimiento') return 'leadership';
  if (cargo === 'jefe de planificación') return 'planning';
  if (cargo.startsWith('jefe de taller mina')) return 'planning';
  if (cargo.startsWith('jefe mina ') || cargo.startsWith('jefe de mina ')) return 'planning';
  if (cargo === 'jefe de equipos móviles y estacionarios') return 'leadership';
  if (cargo === 'gerente operaciones' || cargo === 'jefe sostenibilidad') return 'oversight';
  if (
    cargo.startsWith('mecánico') ||
    cargo === 'encargado de camionetas y camiones' ||
    cargo === 'soldador'
  ) return 'execution';
  return 'general';
}
