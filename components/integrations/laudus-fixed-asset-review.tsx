'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, ArrowRight, CheckCircle2, Database, Search, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LaudusSourceMark } from '@/components/integrations/laudus-source-mark';

type AssetSide = {
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
};

type ReviewRow = {
  externalId: string;
  laudus: AssetSide & {
    acquisitionDate: string | null;
    supplierName: string | null;
    invoiceNumber: string | null;
  };
  candidate: AssetSide & {
    assetId: string | null;
    code: string | null;
    licensePlate: string | null;
    location: string | null;
  };
  evidence: {
    level: string;
    priority: number;
    exactPlate: boolean;
    exactSerial: boolean;
    manufacturer: boolean;
    nameSimilarity: number;
    secondNameSimilarity: number;
    laudusRowsForCandidate: number;
  };
};

type Payload = {
  readOnly: boolean;
  summary: {
    laudusAssets: number;
    canonicalAssets: number;
    linkedToMotil: number;
    pending: number;
    candidateRows: number;
    strongIdentifierCandidates: number;
    reviewsRecorded: number;
    deferredTotal: number;
    confirmedTotal: number;
    rejectedTotal: number;
  };
  rows: ReviewRow[];
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la revisión de activos.');
  return payload as Payload;
};

function label(level: string) {
  if (level === 'strong_identifier_candidate') return 'Identificador fuerte';
  if (level === 'strong_candidate') return 'Candidato fuerte';
  if (level === 'supported_candidate') return 'Con respaldo';
  if (level === 'many_to_one_review') return 'Varios a uno';
  if (level === 'ambiguous') return 'Ambiguo';
  return 'Candidato';
}

function pct(value: number) {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function field(value: string | null | undefined) {
  return value || 'Sin dato';
}

function date(value: string | null) {
  if (!value) return 'Sin fecha';
  const parsed = new Date(`${value}T12:00:00-03:00`);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Santiago',
  }).format(parsed);
}

export function LaudusFixedAssetReview() {
  const { data, error, isLoading, mutate } = useSWR<Payload>(
    '/api/integrations/laudus/fixed-asset-review',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 15 * 60 * 1000 },
  );
  const [search, setSearch] = useState('');
  const [index, setIndex] = useState(0);
  const [rationale, setRationale] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data?.rows || [];
    return (data?.rows || []).filter((row) =>
      [
        row.laudus.name,
        row.laudus.manufacturer,
        row.laudus.model,
        row.laudus.serialNumber,
        row.candidate.code,
        row.candidate.name,
        row.candidate.licensePlate,
        row.candidate.serialNumber,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [data?.rows, search]);

  const safeIndex = rows.length ? Math.min(index, rows.length - 1) : 0;
  const current = rows[safeIndex] || null;

  async function recordDecision(decision: 'confirm_candidate' | 'reject_candidate' | 'defer') {
    if (!current || saving) return;
    const reason = rationale.trim();
    if (reason.length < 5) {
      setMessage('Explica brevemente el motivo de la decisión.');
      return;
    }

    setSaving(decision);
    setMessage(null);
    try {
      const response = await fetch('/api/integrations/laudus/fixed-asset-review', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          externalId: current.externalId,
          decision,
          rationale: reason,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No fue posible registrar la decisión.');

      setRationale('');
      setIndex(0);
      setMessage(
        decision === 'confirm_candidate'
          ? 'Coincidencia registrada para revisión posterior de enlace.'
          : decision === 'reject_candidate'
            ? 'Candidato rechazado y retirado de la cola activa.'
            : 'Caso diferido con su evidencia conservada.',
      );
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No fue posible registrar la decisión.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="border-b border-border/70 pb-5">
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
          <Link href="/dashboard/finanzas">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Finanzas
          </Link>
        </Button>
        <LaudusSourceMark state={isLoading ? 'syncing' : error ? 'review' : 'connected'} className="mb-2" />
        <h1 className="text-2xl font-semibold tracking-tight">Revisión de activos Laudus</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Prioriza candidatos por evidencia de identidad. Esta vista no enlaza activos automáticamente ni modifica Laudus o el maestro MOTIL.
        </p>
      </section>

      {error ? (
        <Card className="shadow-none">
          <CardContent className="p-5 text-sm text-destructive">{error.message}</CardContent>
        </Card>
      ) : null}

      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Activos Laudus', data?.summary.laudusAssets],
          ['Enlazados a MOTIL', data ? `${data.summary.linkedToMotil} / ${data.summary.laudusAssets}` : undefined],
          ['Candidatos fuertes', data?.summary.strongIdentifierCandidates],
          ['Revisiones registradas', data?.summary.reviewsRecorded],
        ].map(([title, value]) => (
          <div key={String(title)} className="bg-card p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-semibold">{isLoading ? '—' : value ?? '—'}</p>
          </div>
        ))}
      </section>

      {data ? (
        <section className="rounded-lg border bg-card px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span>{data.summary.pending.toLocaleString('es-CL')} pendientes de conciliación</span>
            <span>{data.summary.candidateRows.toLocaleString('es-CL')} casos en cola priorizada</span>
            <span>{data.summary.deferredTotal.toLocaleString('es-CL')} diferidos con evidencia registrada</span>
            <span>{rows.length.toLocaleString('es-CL')} sin decisión visibles en esta cola</span>
          </div>
        </section>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setIndex(0);
            }}
            className="pl-9"
            placeholder="Buscar activo, patente, serie o modelo"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!current || safeIndex === 0}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!current || safeIndex >= rows.length - 1}
            onClick={() => setIndex((value) => Math.min(rows.length - 1, value + 1))}
          >
            Siguiente
            <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-80 animate-pulse rounded-lg bg-muted" />
      ) : !current ? (
        <Card className="shadow-none">
          <CardContent className="p-10 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8" />
            <p className="mt-3 font-medium">No hay candidatos visibles con este filtro.</p>
          </CardContent>
        </Card>
      ) : (
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={current.evidence.priority === 1 ? 'secondary' : 'outline'}>
                  {label(current.evidence.level)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Caso {safeIndex + 1} de {rows.length}
                </span>
              </div>
              <h2 className="mt-2 text-lg font-semibold">{field(current.laudus.name)}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Laudus · adquirido {date(current.laudus.acquisitionDate)}
                {current.laudus.supplierName ? ` · ${current.laudus.supplierName}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              Revisión humana requerida
            </div>
          </div>

          <div className="grid gap-px bg-border lg:grid-cols-2">
            <div className="bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Laudus</p>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">Nombre</dt><dd className="mt-1">{field(current.laudus.name)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Fabricante</dt><dd className="mt-1">{field(current.laudus.manufacturer)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Modelo</dt><dd className="mt-1">{field(current.laudus.model)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Serie</dt><dd className="mt-1 font-mono text-xs">{field(current.laudus.serialNumber)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Factura</dt><dd className="mt-1">{field(current.laudus.invoiceNumber)}</dd></div>
              </dl>
            </div>

            <div className="bg-card p-4">
              <p className="mb-3 text-sm font-medium">Candidato MOTIL</p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">Código</dt><dd className="mt-1 font-mono text-xs">{field(current.candidate.code)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Nombre</dt><dd className="mt-1">{field(current.candidate.name)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Fabricante</dt><dd className="mt-1">{field(current.candidate.manufacturer)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Modelo</dt><dd className="mt-1">{field(current.candidate.model)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Patente</dt><dd className="mt-1 font-mono text-xs">{field(current.candidate.licensePlate)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Serie</dt><dd className="mt-1 font-mono text-xs">{field(current.candidate.serialNumber)}</dd></div>
              </dl>
            </div>
          </div>

          <div className="border-t px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Evidencia</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant={current.evidence.exactPlate ? 'secondary' : 'outline'}>
                Patente exacta {current.evidence.exactPlate ? 'sí' : 'no'}
              </Badge>
              <Badge variant={current.evidence.exactSerial ? 'secondary' : 'outline'}>
                Serie exacta {current.evidence.exactSerial ? 'sí' : 'no'}
              </Badge>
              <Badge variant={current.evidence.manufacturer ? 'secondary' : 'outline'}>
                Fabricante {current.evidence.manufacturer ? 'coincide' : 'sin soporte'}
              </Badge>
              <Badge variant="outline">Nombre {pct(current.evidence.nameSimilarity)}</Badge>
              {current.evidence.laudusRowsForCandidate > 1 ? (
                <Badge variant="outline">{current.evidence.laudusRowsForCandidate} registros Laudus apuntan al candidato</Badge>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              La evidencia ayuda a priorizar la revisión, pero no confirma identidad por sí sola. No se modifica el activo canónico ni Laudus desde esta pantalla.
            </p>
          </div>

          <div className="border-t px-4 py-4">
            <p className="text-sm font-medium">Decisión humana</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Registra la revisión y su motivo. Confirmar una coincidencia no enlaza todavía el activo: sólo deja evidencia para el paso de promoción controlada.
            </p>
            <Textarea
              className="mt-3 min-h-24"
              maxLength={500}
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              placeholder="Ej.: patente coincide con el activo MOTIL y la fecha de adquisición es compatible."
              disabled={Boolean(saving)}
            />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(saving) || rationale.trim().length < 5}
                  onClick={() => void recordDecision('defer')}
                >
                  {saving === 'defer' ? 'Guardando…' : 'Diferir'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(saving) || rationale.trim().length < 5}
                  onClick={() => void recordDecision('reject_candidate')}
                >
                  {saving === 'reject_candidate' ? 'Guardando…' : 'Rechazar candidato'}
                </Button>
              </div>
              <Button
                type="button"
                disabled={Boolean(saving) || rationale.trim().length < 5 || !current.candidate.assetId}
                onClick={() => void recordDecision('confirm_candidate')}
              >
                {saving === 'confirm_candidate' ? 'Guardando…' : 'Registrar coincidencia'}
              </Button>
            </div>
            {message ? <p className="mt-3 text-xs text-muted-foreground">{message}</p> : null}
          </div>
        </section>
      )}
    </div>
  );
}
