'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Step = {
  id: string;
  sequence_no: number;
  title: string;
  instructions?: string | null;
  control_requirement?: string | null;
  estimated_minutes?: number | null;
};

type Material = {
  id: string;
  quantity_required: number;
  notes?: string | null;
  product?: {
    product_code?: string | null;
    name?: string | null;
    unit?: string | null;
  } | null;
};

type Plan = {
  id: string;
  status: string;
  proposal_source?: 'motil' | 'human';
  steps: Step[];
  materials: Material[];
};

async function progressiveAction(body: Record<string, unknown>) {
  const response = await fetch('/api/maintenance/standard-job-plans/progressive', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo ajustar el plan.');
  return payload;
}

export function StandardPlanEditor({ plan, onChanged }: { plan: Plan; onChanged: () => Promise<unknown> | unknown }) {
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [steps, setSteps] = useState(() => plan.steps.map((step) => ({ ...step })));
  const [materials, setMaterials] = useState(() => plan.materials.map((material) => ({ ...material, quantity_required: Number(material.quantity_required || 0) })));
  const [newStep, setNewStep] = useState({ title: '', instructions: '', controlRequirement: '' });

  const isMotilProposal = plan.proposal_source === 'motil';
  const canEdit = plan.status === 'proposed';
  const stepCount = useMemo(() => steps.length, [steps.length]);

  if (!canEdit) return null;

  async function run(key: string, body: Record<string, unknown>, success: string) {
    setBusyKey(key);
    setMessage(null);
    try {
      await progressiveAction({ planId: plan.id, ...body });
      setMessage(success);
      await onChanged();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo ajustar el plan.');
    } finally {
      setBusyKey(null);
    }
  }

  async function saveStep(step: Step) {
    await run(
      `step-${step.id}`,
      {
        action: 'update_step',
        stepId: step.id,
        title: step.title,
        instructions: step.instructions || null,
        controlRequirement: step.control_requirement || null,
        estimatedMinutes: step.estimated_minutes ?? null,
      },
      'Paso actualizado.',
    );
  }

  async function removeStep(step: Step) {
    if (stepCount <= 1) {
      setMessage('El plan debe conservar al menos un paso.');
      return;
    }
    await run('remove-' + step.id, { action: 'remove_step', stepId: step.id }, 'Paso quitado.');
    setSteps((current) => current.filter((item) => item.id !== step.id));
  }

  async function addStep() {
    if (!newStep.title.trim()) {
      setMessage('Escribe un título para el nuevo paso.');
      return;
    }
    await run(
      'add-step',
      {
        action: 'add_step',
        title: newStep.title.trim(),
        instructions: newStep.instructions.trim() || null,
        controlRequirement: newStep.controlRequirement.trim() || null,
      },
      'Paso agregado.',
    );
    setNewStep({ title: '', instructions: '', controlRequirement: '' });
  }

  async function saveMaterial(material: Material) {
    if (!Number.isFinite(material.quantity_required) || material.quantity_required <= 0) {
      setMessage('La cantidad debe ser mayor que cero.');
      return;
    }
    await run(
      `material-${material.id}`,
      {
        action: 'update_material',
        materialId: material.id,
        quantityRequired: material.quantity_required,
        notes: material.notes || null,
      },
      'Material actualizado.',
    );
  }

  async function removeMaterial(material: Material) {
    await run('remove-material-' + material.id, { action: 'remove_material', materialId: material.id }, 'Material quitado.');
    setMaterials((current) => current.filter((item) => item.id !== material.id));
  }

  return (
    <div className="mt-3 border-t pt-3">
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>
        {open ? 'Cerrar ajustes' : 'Ajustar'}
      </Button>

      {open ? (
        <div className="mt-3 space-y-4 rounded-lg border bg-muted/15 p-4">
          <div>
            <p className="text-sm font-medium">{isMotilProposal ? 'Corregir propuesta MOTIL' : 'Ajustar propuesta'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cada cambio queda registrado. MOTIL usa estas correcciones como evidencia de calibración; no modifica planes aprobados.
            </p>
          </div>

          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={step.id} className="space-y-2 rounded-md border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground">Paso {index + 1}</p>
                <Input
                  value={step.title}
                  onChange={(event) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, title: event.target.value } : item))}
                />
                <Textarea
                  rows={2}
                  value={step.instructions || ''}
                  placeholder="Instrucción"
                  onChange={(event) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, instructions: event.target.value } : item))}
                />
                <Input
                  value={step.control_requirement || ''}
                  placeholder="Control"
                  onChange={(event) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, control_requirement: event.target.value } : item))}
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => void saveStep(step)} disabled={busyKey === `step-${step.id}`}>Guardar</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => void removeStep(step)} disabled={busyKey === 'remove-' + step.id || stepCount <= 1}>Quitar</Button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 rounded-md border border-dashed p-3">
            <Label>Agregar paso</Label>
            <Input value={newStep.title} placeholder="Título" onChange={(event) => setNewStep((current) => ({ ...current, title: event.target.value }))} />
            <Textarea rows={2} value={newStep.instructions} placeholder="Instrucción" onChange={(event) => setNewStep((current) => ({ ...current, instructions: event.target.value }))} />
            <Input value={newStep.controlRequirement} placeholder="Control" onChange={(event) => setNewStep((current) => ({ ...current, controlRequirement: event.target.value }))} />
            <Button type="button" size="sm" variant="outline" onClick={() => void addStep()} disabled={busyKey === 'add-step'}>Agregar paso</Button>
          </div>

          {materials.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Materiales observados</p>
              {materials.map((material) => (
                <div key={material.id} className="grid gap-2 rounded-md border bg-card p-3 md:grid-cols-[minmax(0,1fr)_140px_auto] md:items-end">
                  <div>
                    <p className="text-sm font-medium">{material.product?.product_code || 'Producto'} · {material.product?.name || 'Sin nombre'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{material.notes || 'Sin nota'} · {material.product?.unit || 'un.'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cantidad</Label>
                    <Input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={material.quantity_required || ''}
                      onChange={(event) => setMaterials((current) => current.map((item) => item.id === material.id ? { ...item, quantity_required: Number(event.target.value) } : item))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => void saveMaterial(material)} disabled={busyKey === `material-${material.id}`}>Guardar</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void removeMaterial(material)} disabled={busyKey === 'remove-material-' + material.id}>Quitar</Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
