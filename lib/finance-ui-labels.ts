type StatusArea = 'production' | 'maintenance' | 'procurement' | 'financial' | 'asset';

const statusLabels: Record<StatusArea, Record<string, string>> = {
  production: {
    active: 'Activa', open: 'Abierta', pending: 'Pendiente', in_progress: 'En curso',
    completed: 'Completada', closed: 'Cerrada', received: 'Recibida', inactive: 'Inactiva',
    cancelled: 'Cancelada', canceled: 'Cancelada', paused: 'En pausa',
  },
  maintenance: {
    open: 'Pendiente', pending: 'Pendiente', scheduled: 'Programada', in_progress: 'En curso',
    completed: 'Completada', closed: 'Cerrada', cancelled: 'Cancelada', canceled: 'Cancelada',
    on_hold: 'En pausa', paused: 'En pausa',
  },
  procurement: {
    draft: 'Borrador', open: 'Abierta', pending: 'Pendiente', awaiting_approval: 'Pendiente de aprobación',
    approved: 'Aprobada', sent: 'Enviada', issued: 'Emitida', ordered: 'Solicitada',
    in_progress: 'En curso', partially_received: 'Recibida parcialmente', partial: 'Recepción parcial',
    received: 'Recibida', closed: 'Cerrada', completed: 'Completada', cancelled: 'Anulada',
    canceled: 'Anulada', rejected: 'Rechazada',
  },
  financial: {
    healthy: 'Dentro del presupuesto', on_track: 'Dentro del presupuesto', under_budget: 'Dentro del presupuesto',
    warning: 'Revisar presupuesto', watch: 'Revisar presupuesto', at_risk: 'Presupuesto en riesgo',
    critical: 'Presupuesto excedido', over_budget: 'Presupuesto excedido', exceeded: 'Presupuesto excedido',
    no_budget: 'Sin presupuesto', unbudgeted: 'Sin presupuesto', unknown: 'Pendiente de revisión',
    incomplete: 'Faltan datos del presupuesto', pending_review: 'Pendiente de revisión',
  },
  asset: {
    operational: 'Operativo', available: 'Disponible', active: 'Activo', inactive: 'Inactivo',
    maintenance: 'En mantención', under_maintenance: 'En mantención', retired: 'Retirado',
    out_of_service: 'Fuera de servicio', down: 'Fuera de servicio',
  },
};

export function financeStatusLabel(value: unknown, area: StatusArea) {
  const key = String(value || '').trim().toLowerCase().replace(/[ -]+/g, '_');
  if (!key) return 'Sin estado';
  return statusLabels[area][key] || 'Pendiente de revisión';
}

export function maintenancePriorityLabel(value: unknown) {
  const key = String(value || '').trim().toLowerCase();
  const labels: Record<string, string> = {
    low: 'Prioridad baja', baja: 'Prioridad baja',
    medium: 'Prioridad media', media: 'Prioridad media',
    high: 'Prioridad alta', alta: 'Prioridad alta',
    critical: 'Prioridad crítica', critica: 'Prioridad crítica', crítica: 'Prioridad crítica',
  };
  return labels[key] || 'Prioridad por revisar';
}

export function financeAmount(value: unknown, currency = 'CLP') {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '—';

  const code = String(currency || 'CLP').trim().toUpperCase();
  try {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: code === 'CLP' ? 0 : 2,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(amount);
  }
}
