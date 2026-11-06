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

type ComplianceEventItem = {
  id: string;
  title?: string | null;
  description?: string | null;
  due_date?: string | null;
  next_date?: string | null;
  priority?: string | null;
  status?: string | null;
  location?: string | null;
};

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
  const { data: complianceEvents } = useSWR('/api/sostenibilidad/compliance-events?limit=100', fetcher);
  const handleUploadSuccess = () => {
    window.location.reload();
  };

  const documents = useMemo(() => {
    const source = Array.isArray(data) ? data : [];
    return source.filter((doc): doc is LegalDocumentItem => matchesPermitLicense(doc as LegalDocumentItem));
  }, [data]);

  const polvorines = useMemo(() => {
    const source = Array.isArray(complianceEvents) ? complianceEvents as ComplianceEventItem[] : [];
    return source
      .filter((event) => String(event.description || '').includes('[POLVORIN]'))
      .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
  }, [complianceEvents]);

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
          <CardTitle>Polvorines y consumidores habituales</CardTitle>
          <CardDescription>Vencimientos cargados desde la planilla de Elías. El aviso operativo comienza 15 días antes del vencimiento.</CardDescription>
        </CardHeader>
        <CardContent>
          {polvorines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay vencimientos de polvorines verificados en la fuente canónica.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {polvorines.map((event) => (
                <div key={event.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{event.title || event.location || 'Registro de polvorín'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Vence {event.due_date || 'sin fecha'} · Aviso desde {event.next_date || 'sin fecha'}
                    </p>
                  </div>
                  <Badge variant={event.priority === 'alta' ? 'destructive' : 'outline'}>
                    {event.priority === 'alta' ? 'Prioridad alta' : 'Seguimiento'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
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
