'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentList, Document } from '@/components/documents/document-list';
import { DocumentReviewModal, type DocumentReviewDocument } from '@/components/documents/document-review-modal';
import { FileText, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Finanzas</p>\n          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Documentos</h1>
          <p className="mt-2 text-muted-foreground">
            Políticas, procedimientos e instructivos financieros con revisión y respaldo.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/finanzas/documentos/importar">Importar documentos</Link>
        </Button>
      </div>

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
