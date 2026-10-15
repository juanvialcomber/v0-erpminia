export type MaintenancePriority = 'critical' | 'high' | 'medium' | 'low';

export type RawAssignedWorkOrder = {
  id: string;
  work_order_number?: string | null;
  title?: string | null;
  status?: string | null;
  priority?: string | null;
  scheduled_date?: string | null;
  created_at?: string | null;
  timer_status?: string | null;
};

export type AssignedWorkAction = {
  id: string;
  workOrderNumber: string;
  title: string;
  description: string;
  evidence: string;
  href: string;
  priority: MaintenancePriority;
  priorityLabel: string;
  scheduledDate: string | null;
  daysUntil: number | null;
  status: string;
  timerStatus: string;
  isCritical: boolean;
  isRunning: boolean;
  isPaused: boolean;
};

export function buildAssignedWorkActions(
  rows: RawAssignedWorkOrder[],
  today: string,
): AssignedWorkAction[];
