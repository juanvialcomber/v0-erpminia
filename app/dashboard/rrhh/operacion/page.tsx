'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, BriefcaseBusiness, Search, ShieldCheck, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la capacidad operacional de personas');
  return payload;
};

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('es-CL').format(value) : '—';

type PersonRow = {
  person_id: string;
  full_name: string;
  role_title: string | null;
  employment_status: string;
  source_type: string;
  work_order_count: number;
  completed_work_orders: number;
  asset_count: number;
  credential_count: number;
  credentials_expiring_30d: number;
  expired_credentials: number;
  competency_count: number;
  valid_competency_count: number;
  active_epp_count: number;
};

export default function RrhhOperationalPeoplePage() {
  const [query, setQuery] = useState('');
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  const { data, error, isLoading } = useSWR(`/api/people/intelligence?${params.toString()}`, fetcher);
  const overview = error ? {} : data?.overview || {};
  const people: PersonRow[] = !error && Array.isArray(data?.people) ? data.people : [];

  return (
    <div className="space-y-6">
      <section className="border-b border-border/70 pb-6">
        <p className="text-sm font-medium text-muted-foreground">RRHH · Evidencia operacional</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Capacidad operacional</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Evidencia que conecta personas con OT, activos, competencias, credenciales y EPP. Esta vista no reemplaza la identidad laboral canónica de RRHH.
        </p>
      </section>

      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="shadow-none"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Personas activas</p><p className="mt-1 text-2xl font-semibold">{number(overview.active_people)}</p></div><Users className="h-5 w-5 text-muted-foreground" /></CardContent></Card>
        <Card className="shadow-none"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">OT relacionadas</p><p className="mt-1 text-2xl font-semibold">{number(overview.work_order_count)}</p></div><BriefcaseBusiness className="h-5 w-5 text-muted-foreground" /></CardContent></Card>
        <Card className="shadow-none"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">Credenciales por vencer</p><p className="mt-1 text-2xl font-semibold">{number(overview.credentials_expiring_30d)}</p></div><ShieldCheck className="h-5 w-5 text-muted-foreground" /></CardContent></Card>
        <Card className="shadow-none"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">OT sin competencias</p><p className="mt-1 text-2xl font-semibold">{number(overview.people_with_ot_without_competencies)}</p></div><AlertTriangle className="h-5 w-5 text-muted-foreground" /></CardContent></Card>
      </div>

      <section className="space-y-4">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar persona" />
        </div>

        <div className="overflow-hidden rounded-lg border">
          <div className="hidden grid-cols-[1.4fr_130px_110px_110px_130px] gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Persona</span><span>OT</span><span>Activos</span><span>Competencias</span><span>Estado</span>
          </div>
          {isLoading ? <p className="p-6 text-sm text-muted-foreground">Cargando personas...</p> : null}
          {!isLoading && !error && !people.length ? <p className="p-8 text-center text-sm text-muted-foreground">No hay personas para los filtros seleccionados.</p> : null}
          {people.map((person) => {
            const incomplete = person.work_order_count > 0 && person.valid_competency_count === 0;
            return (
              <div key={person.person_id} className="grid gap-2 border-b px-4 py-4 last:border-0 lg:grid-cols-[1.4fr_130px_110px_110px_130px] lg:items-center lg:gap-4">
                <div>
                  <p className="font-medium">{person.full_name}</p>
                  <p className="text-xs text-muted-foreground">{person.role_title || 'Rol pendiente'} · {person.source_type === 'work_order_evidence' ? 'Detectado desde OT' : 'Registro operativo'}</p>
                </div>
                <p className="text-sm"><span className="lg:hidden text-muted-foreground">OT: </span>{number(person.work_order_count)}</p>
                <p className="text-sm"><span className="lg:hidden text-muted-foreground">Activos: </span>{number(person.asset_count)}</p>
                <p className="text-sm"><span className="lg:hidden text-muted-foreground">Competencias: </span>{number(person.valid_competency_count)}</p>
                <Badge variant={incomplete ? 'outline' : 'secondary'}>{incomplete ? 'Completar perfil' : person.employment_status}</Badge>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
