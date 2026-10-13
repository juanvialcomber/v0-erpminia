'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  AlertCircle,
  Building2,
  FileUp,
  Loader2,
  LogOut,
  Search,
  ShieldCheck,
  Upload,
  Users,
  ClipboardList,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

type PortalEecc = {
  id: string;
  name: string;
  rut: string;
  representative: string;
  email: string;
  phone: string;
  is_active: boolean;
  notes: string;
};

type PortalDoc = {
  id: string;
  slot_index: number;
  documento_nombre: string;
  file_name: string | null;
  file_path: string | null;
  file_size_bytes: number | null;
  uploaded_at: string | null;
  l1_status: 'cumple' | 'no_cumple' | null;
  l1_observaciones: string | null;
  l2_status: 'cumple' | 'no_cumple' | null;
  l2_observaciones: string | null;
};

type PortalSession = {
  authenticated: boolean;
  session: {
    session_id: string;
    rut: string;
    rut_display: string;
    role: string;
  };
  eecc: PortalEecc | null;
  eecc_list: PortalEecc[];
  carpeta: {
    id: string;
    empresa_nombre: string;
    empresa_rut: string | null;
    contacto_email: string | null;
    status: string;
    submitted_at: string | null;
    created_at: string;
    carpeta_documentos: PortalDoc[];
  } | null;
  docs: PortalDoc[];
  required_documents: string[];
  uploaded_count: number;
  total_documents: number;
  can_upload: boolean;
  warning?: string | null;
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error((payload && payload.error) || 'Error');
    throw error;
  }
  return payload as PortalSession;
};

function statusBadge(status: string) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'aprobado') {
    return <Badge className="bg-green-500/15 text-green-400 border-green-500/30">Documentos aprobados</Badge>;
  }
  if (normalized === 'en_revision_l1' || normalized === 'en_revision_l2') {
    return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">En revisión</Badge>;
  }
  if (normalized === 'rechazado') {
    return <Badge className="bg-red-500/15 text-red-400 border-red-500/30">Rechazado</Badge>;
  }
  return <Badge variant="outline">Pendiente</Badge>;
}

function LoginPanel({ onSuccess }: { onSuccess: () => void }) {
  const [rut, setRut] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/portal/subcontratistas/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rut, password }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo iniciar sesion');
      }

      toast.success('Sesion iniciada');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border/60 bg-card shadow-none">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center gap-2 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Portal para subcontratistas
        </div>
        <div>
          <CardTitle className="text-xl">Ingresar</CardTitle>
          <CardDescription className="mt-1 text-sm">
            Accede con el RUT y la clave asignada a tu empresa.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={submitLogin} className="space-y-4">
          {error ? (
            <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="rut">RUT</Label>
            <Input
              id="rut"
              placeholder="12.345.678-9"
              value={rut}
              onChange={(event) => setRut(event.target.value)}
              autoComplete="off"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Clave</Label>
            <Input
              id="password"
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              required
            />
          </div>


          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Entrar al portal
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PortalDocRow({
  doc,
  carpetaId,
  onUploaded,
  canUpload,
  isCorrection,
}: {
  doc: PortalDoc;
  carpetaId: string;
  onUploaded: () => void;
  canUpload: boolean;
  isCorrection: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const observed = doc.l1_status === 'no_cumple' || doc.l2_status === 'no_cumple';
  const canReplace = canUpload && (!isCorrection || observed);
  const [fileName, setFileName] = useState('');

  const uploadFile = async (file: File) => {
    if (!carpetaId || !canReplace) {
      toast.error('La carpeta no está disponible para cargar documentos');
      return;
    }

    setUploading(true);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('slot_index', String(doc.slot_index));

      const response = await fetch(`/api/portal/subcontratistas/carpeta/${carpetaId}/upload-doc`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo subir el archivo');
      }

      toast.success(`Documento ${doc.slot_index} cargado`);
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir el archivo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn(
      'rounded-md border px-4 py-3 transition-colors',
      doc.file_name ? 'border-border/60 bg-muted/10' : 'border-border/60 bg-background'
    )}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-6 w-6 items-center justify-center text-xs font-medium text-muted-foreground">
              {doc.slot_index}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-sm leading-snug">{doc.documento_nombre}</p>
              <p className="text-xs text-muted-foreground">
                {doc.file_name ? doc.file_name : 'Pendiente por cargar'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {doc.file_name ? (
              <Badge className="bg-green-500/15 text-green-400 border-green-500/30">Cargado</Badge>
            ) : (
              <Badge variant="outline">Pendiente</Badge>
            )}
            {(doc.l1_status || doc.l2_status) ? statusBadge(doc.l1_status || doc.l2_status || 'pendiente') : null}
          </div>
        </div>

        {observed ? <p className="text-xs text-destructive">{doc.l1_observaciones || doc.l2_observaciones || 'Documento observado: cargar corrección'}</p> : null}
        <div className="flex flex-col items-start gap-2 md:items-end">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {!canReplace ? 'Solo lectura' : uploading ? 'Subiendo...' : doc.file_name ? 'Reemplazar' : 'Subir archivo'}
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
              disabled={!carpetaId || !canReplace || uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  uploadFile(file);
                }
              }}
            />
          </label>
          {fileName ? (
            <span className="text-xs text-muted-foreground">Archivo: {fileName}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PortalContent({
  session,
  onRefresh,
}: {
  session: PortalSession;
  onRefresh: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  const eeccFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return session.eecc_list;

    return session.eecc_list.filter((item) =>
      [item.name, item.rut, item.representative, item.email, item.phone]
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [search, session.eecc_list]);

  const submitCarpeta = async () => {
    if (!session.carpeta?.id) return;
    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/portal/subcontratistas/carpeta/${session.carpeta.id}/submit`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo enviar la carpeta');
      }

      toast.success('Carpeta enviada a revisión');
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo enviar la carpeta');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/portal/subcontratistas/logout', {
      method: 'POST',
      credentials: 'include',
    });
    onRefresh();
  };

  return (
    <div className="space-y-5">
      <header className="space-y-5 border-b border-border/70 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground">MOTIL / Contratistas</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{session.eecc?.name || 'Documentos'}</h1>
            <p className="mt-1 text-sm text-muted-foreground">RUT {session.session.rut_display}</p>
          </div>
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={handleLogout}>
            <LogOut className="h-4 w-4" /> Salir
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium tabular-nums">{session.uploaded_count} / {session.total_documents} documentos</span>
            {statusBadge(session.carpeta?.status || 'pendiente')}
          </div>
          <Button size="sm" disabled={!session.carpeta || !['pendiente', 'rechazado'].includes(session.carpeta.status) || submitting} onClick={submitCarpeta}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {session.carpeta?.status === 'rechazado' ? 'Reenviar correcciones' : 'Enviar a revisión'}
          </Button>
        </div>
        <Progress value={session.total_documents > 0 ? session.uploaded_count / session.total_documents * 100 : 0} className="h-1" />
        {session.warning ? <p role="alert" className="text-sm text-destructive">{session.warning}</p> : null}
      </header>

      <Tabs defaultValue="documentos" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 sm:w-[340px]">
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="eecc">Empresa</TabsTrigger>
          <TabsTrigger value="estado">Estado</TabsTrigger>
        </TabsList>

        <TabsContent value="documentos" className="space-y-4">
          <Card className="border-border/60 bg-card shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Documentos requeridos</CardTitle>
              <CardDescription>
                Primero los pendientes. PDF, Word o Excel, hasta 50 MB por archivo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!session.carpeta ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                  No se pudo crear la carpeta todavía. Revisa que la EECC tenga correo de contacto.
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-muted-foreground">
                  {session.uploaded_count} de {session.total_documents} documentos cargados
                </div>
                <div className="text-sm font-medium text-primary">
                  {(session.total_documents > 0 ? Math.round(session.uploaded_count / session.total_documents * 100) : 0)}%
                </div>
              </div>

              <div className="space-y-2">
                {[...session.docs].sort((a, b) => Number(Boolean(a.file_name)) - Number(Boolean(b.file_name)) || a.slot_index - b.slot_index).map((doc) => (
                  <PortalDocRow
                    key={doc.id}
                    doc={doc}
                    carpetaId={session.carpeta?.id || ''}
                    onUploaded={onRefresh}
                    canUpload={session.can_upload && !!session.carpeta && !['aprobado', 'en_revision_l1', 'en_revision_l2'].includes(session.carpeta.status)}
                    isCorrection={session.carpeta?.status === 'rechazado'}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="eecc" className="space-y-4">
          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle>Listado de EECC</CardTitle>
              <CardDescription>
                Las empresas asociadas al RUT se muestran aquí para trazabilidad y control.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-muted-foreground">
                  {session.eecc_list.length} registro(s) encontrados para este RUT.
                </div>
                <div className="w-full md:w-80">
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por nombre, RUT o representante"
                  />
                </div>
              </div>

              <div className="grid gap-3">
                {eeccFiltered.map((eecc) => (
                  <div key={eecc.id} className="rounded-xl border border-border bg-background/60 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{eecc.name}</p>
                          {eecc.is_active ? (
                            <Badge className="bg-green-500/15 text-green-400 border-green-500/30">Activa</Badge>
                          ) : (
                            <Badge variant="outline">Inactiva</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">RUT: {eecc.rut || '-'}</p>
                        <p className="text-sm text-muted-foreground">Representante: {eecc.representative || '-'}</p>
                      </div>
                      <div className="space-y-1 text-sm md:text-right">
                        <p>{eecc.email || 'Sin correo'}</p>
                        <p className="text-muted-foreground">{eecc.phone || 'Sin telefono'}</p>
                      </div>
                    </div>
                    {eecc.notes ? (
                      <p className="mt-3 text-sm text-muted-foreground">{eecc.notes}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estado" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="text-base">Resumen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">RUT</span>
                  <span className="font-mono">{session.session.rut_display}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Empresa</span>
                  <span className="font-medium">{session.eecc?.name || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Carpeta</span>
                  <span className="font-mono text-xs">{session.carpeta?.id || 'Sin carpeta'}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="text-base">Trazabilidad</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  La sesion usa una clave firmada y los archivos quedan asociados a un identificador UUID de portal.
                </p>
                <p className="text-muted-foreground">
                  El flujo reutiliza la carpeta de arranque para mantener una sola fuente de verdad.
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="text-base">Accion rapida</CardTitle>
              </CardHeader>
              <CardContent>
                <Button className="w-full gap-2" variant="outline" onClick={onRefresh}>
                  <FileUp className="h-4 w-4" />
                  Actualizar estado
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function SubcontractorPortal() {
  const { data, error, isLoading, mutate } = useSWR('/api/portal/subcontratistas/session', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
  });

  const refresh = () => mutate();

  if (isLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Cargando portal...
      </div>
    );
  }

  if (error || !data?.authenticated) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center px-4 py-10">
        <div className="w-full space-y-4">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Portal de subcontratistas
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Acceso a documentos</h1>
            <p className="text-sm text-muted-foreground">
              Revisa y entrega los antecedentes de tu empresa.
            </p>
          </div>
          <LoginPanel onSuccess={refresh} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <PortalContent session={data} onRefresh={refresh} />
    </div>
  );
}
