'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock, Pause, Play, StopCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface WorkOrderTimerProps {
  workOrderId: string;
  status?: string;
  onActionComplete?: (action: string, totalMinutes: number) => void;
}

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const PAUSE_REASONS = [
  'Entró una OT más crítica',
  'Falta de repuesto o material',
  'Espera de autorización o coordinación',
  'Equipo o área no disponible',
  'Condición de seguridad',
  'Cambio de prioridad operacional',
  'Otro',
] as const;

export function WorkOrderTimer({ workOrderId, onActionComplete }: WorkOrderTimerProps) {
  const [timerStatus, setTimerStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [pauseDetail, setPauseDetail] = useState('');
  const [lastPauseReason, setLastPauseReason] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchTimer = async () => {
      try {
        const res = await fetch(`/api/maintenance/work-orders/${workOrderId}/timer`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        setTimerStatus(data.current.timer_status);
        setTotalSeconds(Number(data.current.total_seconds ?? Number(data.current.total_minutes || 0) * 60));
        setStartTime(data.current.timer_start_time ? new Date(data.current.timer_start_time) : null);
        setLastPauseReason(
          data.current.timer_status === 'paused'
            ? data.timeline?.find((event: { event_type?: string; payload?: { notes?: string | null } }) => event.event_type === 'timer_pause')?.payload?.notes || null
            : null,
        );
        setNowMs(Date.now());
      } catch (err) {
        console.error('[maintenance] Failed to fetch timer:', err);
      }
    };
    void fetchTimer();
  }, [workOrderId]);

  useEffect(() => {
    if (timerStatus !== 'running' || !startTime) return;
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timerStatus, startTime]);

  const handleAction = useCallback(async (
    action: 'play' | 'pause' | 'resume' | 'terminate',
    notes?: string,
  ) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/maintenance/work-orders/${workOrderId}/timer`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: notes || null }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(payload?.error || 'No se pudo actualizar el temporizador.');
        return;
      }
      const expectedStatus = action === 'pause' ? 'paused' : action === 'terminate' ? 'idle' : 'running';
      if (payload?.timer_status !== expectedStatus) {
        setMessage('El servidor no confirmó el estado del cronómetro. Actualiza la OT antes de continuar.');
        return;
      }
      setTimerStatus(payload.timer_status);
      setTotalSeconds(Number(payload.total_seconds ?? Number(payload.total_minutes || 0) * 60));
      setStartTime(payload.timer_start_time ? new Date(payload.timer_start_time) : null);
      setNowMs(Date.now());
      if (action === 'pause') {
        setLastPauseReason(notes || null);
        setPauseOpen(false);
        setPauseReason('');
        setPauseDetail('');
      } else if (action === 'resume') {
        setLastPauseReason(null);
      }
      onActionComplete?.(action, Math.floor(Number(payload.total_seconds ?? 0) / 60));
    } catch (err) {
      console.error('[maintenance] Timer action failed:', err);
      setMessage('No se pudo actualizar el temporizador.');
    } finally {
      setLoading(false);
    }
  }, [workOrderId, onActionComplete]);

  const pauseWork = useCallback(async () => {
    if (!pauseReason) {
      setMessage('Selecciona el motivo de la pausa.');
      return;
    }
    if (pauseReason === 'Otro' && !pauseDetail.trim()) {
      setMessage('Describe el motivo de la pausa.');
      return;
    }
    const notes = pauseDetail.trim() ? `${pauseReason} — ${pauseDetail.trim()}` : pauseReason;
    await handleAction('pause', notes);
  }, [handleAction, pauseDetail, pauseReason]);

  const liveSeconds = timerStatus === 'running' && startTime
    ? Math.max(0, Math.floor((nowMs - startTime.getTime()) / 1000))
    : 0;
  const displaySeconds = totalSeconds + liveSeconds;

  return (
    <Card className="space-y-4 border-border bg-card p-4 shadow-none">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Tiempo de trabajo</h3>
      </div>

      <div className="text-center">
        <div className="font-mono text-4xl font-bold tabular-nums text-primary">{formatDuration(displaySeconds)}</div>
        <p className="mt-2 text-xs text-muted-foreground">
          Estado: {timerStatus === 'running' ? 'En curso' : timerStatus === 'paused' ? 'Pausado' : 'Listo para continuar'}
        </p>
      </div>

      {timerStatus === 'running' && pauseOpen ? (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <div>
            <label htmlFor={`pause-reason-${workOrderId}`} className="text-xs font-medium">Motivo de la pausa</label>
            <select
              id={`pause-reason-${workOrderId}`}
              value={pauseReason}
              onChange={(event) => setPauseReason(event.target.value)}
              className="mt-1 flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Selecciona un motivo</option>
              {PAUSE_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
            </select>
          </div>
          <textarea
            aria-label="Detalle de la pausa"
            value={pauseDetail}
            onChange={(event) => setPauseDetail(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Detalle adicional"
            className="flex min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" size="sm" disabled={loading} onClick={() => { setPauseOpen(false); setMessage(null); }}>Cancelar</Button>
            <Button size="sm" disabled={loading || !pauseReason} onClick={() => void pauseWork()}>
              <Pause className="mr-2 h-4 w-4" />
              Confirmar pausa
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          {(timerStatus === 'idle' || timerStatus === 'paused') && (
            <Button onClick={() => void handleAction(timerStatus === 'idle' ? 'play' : 'resume')} disabled={loading} className="flex-1 gap-2" size="sm">
              <Play className="h-4 w-4" />
              {timerStatus === 'idle' ? 'Iniciar' : 'Reanudar'}
            </Button>
          )}
          {timerStatus === 'running' && (
            <>
              <Button onClick={() => { setMessage(null); setPauseOpen(true); }} disabled={loading} className="flex-1 gap-2" variant="outline" size="sm">
                <Pause className="h-4 w-4" />
                Pausar
              </Button>
              <Button onClick={() => void handleAction('terminate')} disabled={loading} className="flex-1 gap-2" variant="outline" size="sm">
                <StopCircle className="h-4 w-4" />
                Terminar
              </Button>
            </>
          )}
          {timerStatus === 'paused' && (
            <Button onClick={() => void handleAction('terminate')} disabled={loading} className="w-full gap-2" variant="outline" size="sm">
              <StopCircle className="h-4 w-4" />
              Terminar
            </Button>
          )}
        </div>
      )}
      {timerStatus === 'paused' && lastPauseReason ? (
        <div className="rounded-md border bg-muted/20 p-2 text-xs">
          <span className="text-muted-foreground">Motivo pausa: </span>
          <span className="font-medium">{lastPauseReason}</span>
        </div>
      ) : null}
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </Card>
  );
}
