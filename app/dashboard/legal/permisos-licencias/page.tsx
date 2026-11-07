'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ArrowRight, Clock, FileCheck2, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentUpload } from '@/components/documents/document-upload';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => []);
  if (!response.ok) return [];
  return Array.isArray(payload) ? payload : payload.documents || payload.data || [];
};

type PowderPermit = {
  id:string; location_name:string; resolution_number:string|null; target_expiry_date:string|null;
  mining_property:string|null; capacity:number|null; days_until:number|null; alert_15_days:boolean;
  overdue:boolean; missing_evidence:boolean;
};
type PowderPayload = { data:PowderPermit[]; summary:{total:number;alert_15_days:number;overdue:number;missing_evidence:number}; policy:{alert_days:number;rule:string} };

type LegalDocumentItem = {
  id: string | number;
  title?: string | null;
  category?: string | null;
  description?: string | null;
  tags?: string[] | null;
  status?: string | null;
  expiryDate?: string | null;
  expiry_date?: string | null;
};

function matchesPermitLicense(document: LegalDocumentItem) {
  const text = [
    document.title,
    document.category,
    document.description,
    document.tags?.join?.(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return ['permiso', 'licencia', 'patente', 'resolucion', 'autorizacion'].some((term) => text.includes(term));
}

export default function PermisosLicenciasPage() {
  const [query, setQuery] = useState('');
  const { data } = useSWR('/api/legal/documentos', fetcher);
  const { data: powder } = useSWR<PowderPayload>('/api/legal/powder-magazines', async (url:string) => {
    const response = await fetch(url,{credentials:'include',cache:'no-store'});
    const payload = await response.json().catch(()=>null);
    if(!response.ok) throw new Error(payload?.error || 'No se pudieron cargar polvorines');
    return payload;
  }, { revalidateOnFocus:false });
  const handleUploadSuccess = () => {
    window.location.reload();
  };

  const documents = useMemo(() => {
    const source = Array.isArray(data) ? data : [];
    return source.filter((doc): doc is LegalDocumentItem => matchesPermitLicense(doc as LegalDocumentItem));
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((doc) => !q || [doc.title, doc.category, doc.status].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [documents, query]);

  const active = filtered.filter(
    (doc) =>
      String(doc.status || '').toLowerCase().includes('active') ||
      String(doc.status || '').toLowerCase().includes('vigente')
  ).length;

  const expiring = filtered.filter((doc) => {
    if (!doc.expiryDate && !doc.expiry_date) return false;
    const expiry = new Date(doc.expiryDate || doc.expiry_date || 0);
    if (Number.isNaN(expiry.getTime())) return false;
    const days = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 30;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Permisos y licencias</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Vista ejecutiva para permisos, licencias y autorizaciones reales del proyecto.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dashboard/legal/permisos-licencias/importar">
              Importar documentos
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/legal/importar">
              Importar desde Excel
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/legal">
              <ArrowRight className="mr-2 h-4 w-4" />
              Volver a legal
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCheck2 className="h-5 w-5" />
            Cargar permiso o licencia
          </CardTitle>
          <CardDescription>
            Usa el mismo flujo legal para permisos, licencias y autorizaciones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/legal/permisos-licencias/importar">Abrir importador dedicado</Link>
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/dashboard/legal/importar">Ir al importador general</Link>
            </Button>
          </div>
          <DocumentUpload module="legal" category="documentos" onUploadSuccess={handleUploadSuccess} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldAlert className="h-4 w-4" />
              Total reales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{filtered.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Próximos por vencer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{expiring}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              Vigentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{active}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Polvorines y consumidores habituales</CardTitle>
              <CardDescription>Control de vencimiento solicitado por Elías. La alerta se activa 15 días antes de la fecha vigente informada.</CardDescription>
            </div>
            <Badge variant="outline">{powder?.summary.alert_15_days ?? '…'} alertas 15 días</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {powder?.data?.map((item)=><div key={item.id} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_180px_160px] md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{item.location_name}</p>
                {item.alert_15_days ? <Badge variant="destructive">Renovar</Badge> : null}
                {item.overdue ? <Badge variant="destructive">Vencido</Badge> : null}
                {item.missing_evidence ? <Badge variant="outline">Datos incompletos</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{item.resolution_number ? `Resolución ${item.resolution_number}` : 'Resolución no informada'}{item.mining_property ? ` · ${item.mining_property}` : ''}</p>
            </div>
            <div className="text-sm md:text-right">
              <p>{item.target_expiry_date || 'Fecha no informada'}</p>
              <p className="text-xs text-muted-foreground">{item.days_until === null ? 'Sin cálculo' : item.days_until < 0 ? `Vencido hace ${Math.abs(item.days_until)} días` : `Faltan ${item.days_until} días`}</p>
            </div>
            <div className="text-xs text-muted-foreground md:text-right">{item.capacity !== null ? `Capacidad fuente: ${item.capacity.toLocaleString('es-CL')}` : 'Capacidad no informada'}</div>
          </div>)}
          {!powder?.data?.length ? <p className="text-sm text-muted-foreground">Cargando control de polvorines…</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permisos y licencias reales</CardTitle>
          <CardDescription>Permisos, licencias y autorizaciones reales relacionadas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar permisos, licencias o resoluciones..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay permisos ni licencias cargados todavía.</p>
          ) : (
            filtered.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-1">
                  <p className="font-medium">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">{doc.category || 'legal'}</p>
                </div>
                <Badge variant="outline">{doc.status || 'draft'}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
