'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentList, Document } from '@/components/documents/document-list';
import { DocumentReviewModal, type DocumentReviewDocument } from '@/components/documents/document-review-modal';
import { FileText, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TaxReconciliationCard } from '@/components/finance/tax-reconciliation-card';

interface DocumentStats {
  total: number;
  vigentes: number;
  en_revision: number;
  rechazados: number;
}

export default function DocumentosFinanzasPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentReviewDocument | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [stats, setStats] = useState<DocumentStats>({
    total: 0,
    vigentes: 0,
    en_revision: 0,
    rechazados: 0,
  });

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/documents/list?module=finanzas&category=documentos', {
        credentials: 'include',
      });
      const data = await response.json();
      if (Array.isArray(data)) {
        setDocuments(data);
        setStats({
          total: data.length,
          vigentes: data.filter((d: Document) => d.status === 'active').length,
          en_revision: data.filter((d: Document) => d.status === 'pending_l1' || d.status === 'pending_l2').length,
          rechazados: data.filter((d: Document) => d.status === 'rejected').length,
        });
      }
    } catch (error) {
      console.error('Error cargando documentos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleDelete = async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents/delete?id=${documentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (response.ok) {
        setDocuments(documents.filter((d) => d.id !== documentId));
        await loadDocuments();
      }
    } catch (error) {
      console.error('Error eliminando documento:', error);
    }
  };

  const handleView = (document: Document | string) => {
    if (typeof document === 'string') {
      const doc = documents.find((d) => d.id === document);
      if (doc) setSelectedDoc(doc as DocumentReviewDocument);
    } else {
      setSelectedDoc(document as DocumentReviewDocument);
    }
    setReviewOpen(true);
  };

  const handleApprove = async (documentId: string, observations: string) => {
    try {
      const response = await fetch('/api/documents/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          action: 'approve',
          observations,
          reviewLevel: 'L1',
        }),
        credentials: 'include',
      });
      if (response.ok) {
        await loadDocuments();
      }
    } catch (error) {
      console.error('Error aprobando documento:', error);
    }
  };

  const handleReject = async (documentId: string, observations: string) => {
    try {
      const response = await fetch('/api/documents/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          action: 'reject',
          observations,
          reviewLevel: 'L1',
        }),
        credentials: 'include',
      });
      if (response.ok) {
        await loadDocuments();
      }
    } catch (error) {
      console.error('Error rechazando documento:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Finanzas</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Facturación</h1>
          <p className="mt-2 text-muted-foreground">
            Documentos tributarios y conciliación. Emisión SII aún no habilitada.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/finanzas/documentos/importar">Importar documentos</Link>
        </Button>
      </div>

      <section className="rounded-lg border bg-card px-4 py-4" aria-label="Documentos tributarios electrónicos">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Documentos tributarios (DTE)</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Facturas, guías y notas tributarias. La conciliación disponible utiliza evidencia de Laudus y MOTIL. Tax Core todavía
              no aporta documentos XML validados por el SII a esta vista.
              Los documentos de políticas y procedimientos se mantienen separados.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/finanzas/trazabilidad">Ver trazabilidad financiera</Link>
          </Button>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 sm:p-5" aria-label="Preparación para emitir DTE">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Emisión tributaria</h2>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">No habilitada</span>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          La Patagua prepara la emisión en MOTIL; Finanzas debe autorizar cada documento.
          No se asignan folios, firman XML ni envían documentos al SII desde esta pantalla.
          La habilitación exige certificado seguro, CAF válido, validación tributaria y pruebas de punta a punta.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-sm font-medium">1. Preparar</p>
            <p className="mt-1 text-xs text-muted-foreground">Clientes, ítems, referencias, impuestos y borrador</p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-sm font-medium">2. Autorizar</p>
            <p className="mt-1 text-xs text-muted-foreground">Revisión y aprobación obligatoria de Finanzas</p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-sm font-medium">3. Emitir y verificar</p>
            <p className="mt-1 text-xs text-muted-foreground">Firma, SII, Track ID, estado y custodia; pendiente</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Tipos confirmados por Finanzas: 33 factura, 34 exenta, 46 compra, 52 guía, 56 nota de débito y 61 nota de crédito.
          Los documentos administrativos de abajo no son DTE emitidos.
        </p>
      </section>

      <TaxReconciliationCard />

      <h2 className="text-base font-semibold">Documentos administrativos</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span>Total</span>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">documentos</p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span>Vigentes</span>
              <CheckCircle2 className="h-4 w-4 text-secondary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-500">{stats.vigentes}</p>
            <p className="text-xs text-muted-foreground">aprobados</p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
               <span>En revisión</span>
              <Clock className="h-4 w-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-500">{stats.en_revision}</p>
            <p className="text-xs text-muted-foreground">esperando aprobación</p>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span>Rechazados</span>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-500">{stats.rechazados}</p>
            <p className="text-xs text-muted-foreground">Pendientes de corrección</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList className="border-b-2 border-border bg-muted/60 p-1">
          <TabsTrigger value="all" className="font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Todos</TabsTrigger>
          <TabsTrigger value="vigentes" className="font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Vigentes</TabsTrigger>
          <TabsTrigger value="revision" className="font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">En revisión</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <DocumentList documents={documents} isLoading={loading} onView={handleView} onDelete={handleDelete} />
        </TabsContent>

        <TabsContent value="vigentes" className="space-y-4">
          <DocumentList
            documents={documents.filter((d) => d.status === 'active' || d.status === 'aprobado')}
            isLoading={loading}
            onView={handleView}
            onDelete={handleDelete}
          />
        </TabsContent>

        <TabsContent value="revision" className="space-y-4">
          <DocumentList
            documents={documents.filter((d) => d.status === 'pending_l1' || d.status === 'pending_l2')}
            isLoading={loading}
            onView={handleView}
            onDelete={handleDelete}
          />
        </TabsContent>

      </Tabs>

      <DocumentReviewModal
        document={selectedDoc}
        isOpen={reviewOpen}
        onClose={() => {
          setReviewOpen(false);
          setSelectedDoc(null);
        }}
        onApprove={handleApprove}
        onReject={handleReject}
        reviewLevel="L1"
      />
    </div>
  );
}
