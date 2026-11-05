'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { AlertCircle, CheckCircle, Clock, FolderOpen, Plus, Search, UploadCloud, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar gestión documental');
  return payload;
};

type DocumentCategory = {
  id: string;
  name?: string | null;
  description?: string | null;
  pendingApprovals?: number | null;
  count?: number | null;
};

type DocumentSummaryItem = {
  id: string | number;
  nombre?: string | null;
  documentId?: string | null;
  version?: string | number | null;
  estado?: string | null;
  pendingBy?: string | null;
  creador?: string | null;
};

function statusBadge(estado?: string | null) {
  switch (estado) {
    case 'aprobado':
    case 'active':
    case 'approved':
      return <Badge className="gap-1 bg-[var(--brand-verde)]"><CheckCircle className="h-3 w-3" />Aprobado</Badge>;
    case 'pendiente_validador1':
    case 'pendiente_validador2':
    case 'draft':
    case 'submitted':
    case 'under_review':
      return <Badge className="gap-1 bg-[var(--secondary)]"><Clock className="h-3 w-3" />Pendiente</Badge>;
    case 'rechazado':
    case 'rejected':
      return <Badge className="gap-1 bg-[var(--brand-rojo)]"><XCircle className="h-3 w-3" />Rechazado</Badge>;
    default:
      return <Badge variant="outline">{estado || 'Sin estado'}</Badge>;
  }
}

export default function DocumentosGestionPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const { data, error, isLoading, mutate } = useSWR('/api/dashboard/documentos-gestion', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    refreshInterval: 300000,
  });

  const categories = (data?.categories || []) as DocumentCategory[];
  const pendingApprovals = (data?.pendingApprovals || []) as DocumentSummaryItem[];
  const recentDocuments = (data?.recentDocuments || []) as DocumentSummaryItem[];
  const expiringDocuments = (data?.expiringDocuments || []) as DocumentSummaryItem[];
  const stats = data?.stats || { total: 0, pending: 0, expiring: 0 };

  const filteredCategories = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return categories;
    return categories.filter((category) =>
      `${category.name || ''} ${category.description || ''}`.toLowerCase().includes(query),
    );
  }, [categories, searchTerm]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
        <div className="grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-muted" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm">
            <AlertCircle className="h-4 w-4 text-destructive" />
            No fue posible cargar el centro documental.
          </div>
          <Button variant="outline" onClick={() => mutate()}>Reintentar</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-border/70 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Documentación
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Control documental</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Controla aprobaciones, vencimientos y categorías documentales.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link href="/dashboard/documentos-gestion/ingesta"><UploadCloud className="h-4 w-4" />Ingesta documental</Link>
          </Button>
          <Button asChild className="gap-2">
            <Link href="/dashboard/documentos-gestion/contratos"><Plus className="h-4 w-4" />Gestionar contratos</Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-3">
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Documentos</p><p className="mt-1 text-2xl font-semibold">{stats.total}</p></div>
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Pendientes</p><p className="mt-1 text-2xl font-semibold">{stats.pending}</p></div>
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Por vencer</p><p className="mt-1 text-2xl font-semibold">{expiringDocuments.length}</p></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section><div className="mb-2"><h2 className="text-base font-semibold">Pendientes de aprobación</h2><p className="text-sm text-muted-foreground">Documentos que requieren decisión.</p></div><div className="divide-y overflow-hidden rounded-lg border">
            {pendingApprovals.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No hay aprobaciones pendientes.</p> : pendingApprovals.slice(0, 6).map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0"><p className="truncate font-medium">{doc.nombre || 'Documento sin nombre'}</p><p className="text-xs text-muted-foreground">{doc.documentId || 'Sin ID'} · {doc.pendingBy || 'Sin responsable'}</p></div>
                {statusBadge(doc.estado)}
              </div>
            ))}
          </div></section>

        <section><div className="mb-2"><h2 className="text-base font-semibold">Vencimientos próximos</h2><p className="text-sm text-muted-foreground">Prioridades de control documental.</p></div><div className="divide-y overflow-hidden rounded-lg border">
            {expiringDocuments.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No hay documentos próximos a vencer.</p> : expiringDocuments.slice(0, 6).map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0"><p className="truncate font-medium">{doc.nombre || 'Documento sin nombre'}</p><p className="text-xs text-muted-foreground">{doc.documentId || 'Sin ID'}</p></div>
                {statusBadge(doc.estado)}
              </div>
            ))}
          </div></section>
      </div>

      <section className="space-y-4 border-t pt-5"><div><h2 className="flex items-center gap-2 text-base font-semibold"><FolderOpen className="h-4 w-4" />Categorías</h2><p className="text-sm text-muted-foreground">Busca y entra a la categoría correspondiente.</p></div>
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar por nombre o descripción" className="pl-10" /></div>
          {filteredCategories.length === 0 ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No hay categorías para esta búsqueda.</p> : (
            <div className="divide-y border-y">
              {filteredCategories.map((category) => (
                <Link key={category.id} href={`/dashboard/documentos-gestion/${category.id}`} className="border-b py-3 transition-colors last:border-b-0 hover:bg-muted/30">
                  <div className="flex items-center justify-between gap-4 px-1"><div className="min-w-0"><p className="font-medium">{category.name || category.id}</p><p className="mt-1 truncate text-sm text-muted-foreground">{category.description || 'Documentos asociados a esta categoría.'}</p></div><div className="flex shrink-0 items-center gap-2"><Badge variant="outline">{category.count || 0}</Badge>{(category.pendingApprovals || 0) > 0 && <span className="text-xs font-medium text-[var(--secondary)]">{category.pendingApprovals} pendientes</span>}</div></div>
                </Link>
              ))}
            </div>
          )}
        </section>

      {recentDocuments.length > 0 && (
        <section className="border-t pt-5"><h2 className="mb-2 text-base font-semibold">Actividad reciente</h2><div className="divide-y overflow-hidden rounded-lg border">
            {recentDocuments.slice(0, 6).map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0"><p className="truncate font-medium">{doc.nombre || 'Documento sin nombre'}</p><p className="text-xs text-muted-foreground">{doc.documentId || 'Sin ID'} · v{doc.version || '—'} · {doc.creador || 'Sin autor'}</p></div>
                {statusBadge(doc.estado)}
              </div>
            ))}
          </div></section>
      )}
    </div>
  );
}
