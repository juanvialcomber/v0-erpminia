'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Download, Plus, FileText, CheckCircle2, AlertCircle, Clock, CircleDot } from 'lucide-react';
import CarpetaArranqueForm from '@/components/prevention/carpeta-arranque-form';
import CarpetaArranqueList from '@/components/prevention/carpeta-arranque-list';

interface Stats {
  total: number;
  pendientes: number;
  en_revision: number;
  aprobadas: number;
  rechazadas: number;
}

function formatPeriodLabel(dateValue?: string | null) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-CL', { month: 'short', year: 'numeric' });
}

export default function CarpetaArranquePage({ legalContext = false }: { legalContext?: boolean } = {}) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [activeTab, setActiveTab] = useState('bandeja');
  const [stats, setStats] = useState<Stats>({ total: 0, pendientes: 0, en_revision: 0, aprobadas: 0, rechazadas: 0 });
  const [listKey, setListKey] = useState(0);
  const [carpetas, setCarpetas] = useState<any[]>([]);

  const fetchStats = useCallback(async () => {
    const res = await fetch('/api/carpeta-arranque', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    const carpetas: Array<{ status: string }> = data.carpetas || [];
    setCarpetas(data.carpetas || []);
    setStats({
      total: carpetas.length,
      pendientes: carpetas.filter((c) => c.status === 'pendiente').length,
      en_revision: carpetas.filter((c) => ['en_revision_l1', 'en_revision_l2'].includes(c.status)).length,
      aprobadas: carpetas.filter((c) => c.status === 'aprobado').length,
      rechazadas: carpetas.filter((c) => c.status === 'rechazado').length,
    });
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats, listKey]);

  const handleFormSuccess = () => {
    setShowNewForm(false);
    setListKey((k) => k + 1);
    setActiveTab('bandeja');
  };

  const handleExportCsv = () => {
    const rows: Array<Array<string | number>> = [
      ['Empresa', 'RUT', 'Estado', 'Período carpeta', 'Documento', 'Slot', 'Archivo', 'Período documento', 'Estado revisión L1', 'Estado revisión L2', 'Cargado'],
      ...carpetas.flatMap((carpeta: any) =>
        (carpeta.carpeta_documentos || []).map((doc: any) => [
          carpeta.empresa_nombre || '',
          carpeta.empresa_rut || '',
          carpeta.status || '',
          formatPeriodLabel(carpeta.submitted_at || carpeta.created_at) || '',
          doc.documento_nombre || '',
          doc.slot_index || '',
          doc.file_name || '',
          formatPeriodLabel(doc.uploaded_at) || '',
          doc.l1_status || '',
          doc.l2_status || '',
          doc.file_name ? 'Sí' : 'No',
        ])
      ),
    ];

    const csv = rows
      .map((row) => row.map((cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carpeta_arranque_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
        <h1 className="text-3xl font-bold tracking-tight">Carpeta de Arranque</h1>
        <p className="text-muted-foreground">Revisión documental de empresas contratistas · Responsable operativo: Elías</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link href={legalContext ? "/dashboard/legal/contratistas-documentos/importar" : "/dashboard/sostenibilidad/prevencion-riesgos/carpeta-arranque/importar"}>
              Plantilla
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href={legalContext ? "/dashboard/legal/contratistas-documentos/importar" : "/dashboard/sostenibilidad/prevencion-riesgos/carpeta-arranque/importar"}>
              <Plus className="h-4 w-4" />
              Importar Excel
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Carpetas registradas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-orange-500" />
              Pendientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats.pendientes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <CircleDot className="h-4 w-4 text-blue-500" />
              Segunda revisión
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{stats.en_revision}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Aprobadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.aprobadas}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Rechazadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{stats.rechazadas}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="bandeja">Documentos por revisar ({carpetas.reduce((count, c) => count + ((c.status === 'en_revision_l1' || c.status === 'pendiente') ? (c.carpeta_documentos || []).filter((d: { file_name?: string | null; l1_status?: string | null }) => d.file_name && !d.l1_status).length : 0), 0)})</TabsTrigger>
          <TabsTrigger value="mis-carpetas">Todas</TabsTrigger>
            <TabsTrigger value="en-revision" className="gap-2">
             En revisión
            {carpetas.filter(c => c.status === 'en_revision_l2').length > 0 && (
              <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-xs font-bold leading-none text-white">
                {carpetas.filter(c => c.status === 'en_revision_l2').length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="documentos-std">Documentos Requeridos</TabsTrigger>
        </TabsList>

        <TabsContent value="bandeja" className="space-y-4">
          <div><h2 className="text-lg font-semibold">Bandeja de primera revisión</h2><p className="text-sm text-muted-foreground">Elías revisa documentos, registra observaciones y decide si corresponde solicitar otra firma.</p></div>
          <CarpetaArranqueList key={`l1-${listKey}`} status="en_revision_l1" />
        </TabsContent>

        <TabsContent value="mis-carpetas" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Carpetas de Arranque</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleExportCsv} className="gap-2">
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
              <Button onClick={() => setShowNewForm(!showNewForm)} className="gap-2">
                <Plus className="h-4 w-4" />
                Nueva Carpeta
              </Button>
            </div>
          </div>
          {showNewForm && (
            <Card>
              <CardHeader>
                <CardTitle>Crear Nueva Carpeta de Arranque</CardTitle>
                <CardDescription>
                  Ingresa los datos de la empresa contratista y carga los 19 documentos requeridos.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CarpetaArranqueForm onSuccess={handleFormSuccess} />
              </CardContent>
            </Card>
          )}
          <CarpetaArranqueList key={listKey} status="todas" />
        </TabsContent>

        <TabsContent value="en-revision" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Carpetas en revisión</h2>
            <p className="text-sm text-muted-foreground">
              Carpetas derivadas a una segunda firma, cuando Legal lo solicita.
            </p>
          </div>
          <CarpetaArranqueList key={`rev-${listKey}`} status="en_revision_l2" />
        </TabsContent>

        <TabsContent value="documentos-std" className="space-y-4">
          <h2 className="text-lg font-semibold">Documentos Requeridos por la EECC</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">19 Documentos Obligatorios</CardTitle>
              <CardDescription>
                Esta es la lista base de la carpeta. Legal debe confirmar la aplicabilidad de cada documento según actividad y normativa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  'Certificado de afiliacion y cotizacion a Organismo Administrador',
                  'Certificado de Accidentabilidad (últimos 2 años)',
                  'Reglamento interno de orden, higiene y seguridad',
                  'Copia IRL de todos sus colaboradores',
                  'Contratos de trabajos de su personal',
                  'Registro de entrega de EPP',
                  'Registro interno de la empresa contratista',
                  'Recepción firmada del Sistema de Gestión y Seguridad en el Trabajo',
                  'Exámenes pre-ocupacionales (últimos 3 años)',
                  'Examenes ocupacionales (agentes como ruido, silice)',
                  'Documentación de trabajadores extranjeros',
                  'Procedimientos de trabajos actualizados con NRCT',
                  'Procedimiento en caso de accidente',
                  'Política de empresa contratista en control de riesgos',
                  'Copia carnet de identidad de todos los colaboradores',
                  'Licencias de conducción vigentes',
                  'Recepcion de conductores por reglamento interno',
                  'Programa de supervision a cargo personal',
                  'Matriz de Identificacion de Peligros (MIPER)',
                ].map((doc, idx) => (
                  <div key={idx} className="flex items-start gap-3 rounded-md border p-3">
                    <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span className="text-sm">
                      {idx + 1}. {doc}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
