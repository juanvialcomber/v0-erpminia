'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, AlertCircle, CheckCircle, Clock, Eye, Download, Trash2, Upload } from 'lucide-react';
import useSWR from 'swr';
import { InspeccionExternaModal } from '@/components/sostenibilidad/inspeccion-externa-modal';
import { ConfirmDeleteDialog } from '@/components/sostenibilidad/confirm-delete-dialog';

interface InspeccionExterna {
  id: string;
  numero_inspeccion: string;
  fecha_planificada: string;
  fecha_realizada?: string;
  faena: string;
  inspector: string;
  empresa_externa: string;
  contacto_externo: string;
  hallazgos_count: number;
  estado: 'planificada' | 'realizada' | 'cerrada';
  reporte_url?: string;
}

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) return null;
  return payload;
};

export default function InspeccionesExternasPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedInspeccion, setSelectedInspeccion] = useState<InspeccionExterna | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { data: inspecciones = [], mutate } = useSWR(
    '/api/sostenibilidad/inspecciones?tipo=externas',
    fetcher
  );
  const handleReload = () => {
    void mutate();
  };

  const inspeccionesList = (inspecciones.data || inspecciones || []) as InspeccionExterna[];

  const filteredInspecciones = inspeccionesList.filter(
    (insp) =>
      insp.numero_inspeccion.toLowerCase().includes(searchTerm.toLowerCase()) ||
      insp.faena.toLowerCase().includes(searchTerm.toLowerCase()) ||
      insp.empresa_externa.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async () => {
    if (!selectedInspeccion?.id) return;
    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/sostenibilidad/inspecciones?id=${selectedInspeccion.id}&tipo=externas`,
        { method: 'DELETE' }
      );

      if (!response.ok) throw new Error('Error al eliminar');

      handleReload();
      setDeleteOpen(false);
      setSelectedInspeccion(null);
    } catch (error) {
      console.error('[v0] Delete error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditClick = (insp: InspeccionExterna) => {
    setSelectedInspeccion(insp);
    setModalOpen(true);
  };

  const handleDeleteClick = (insp: InspeccionExterna) => {
    setSelectedInspeccion(insp);
    setDeleteOpen(true);
  };

  const handleModalSuccess = () => {
    handleReload();
    setSelectedInspeccion(null);
  };

  const estadoIcon = {
    planificada: <Clock className="w-4 h-4 text-primary" />,
    realizada: <CheckCircle className="w-4 h-4 text-secondary" />,
    cerrada: <AlertCircle className="w-4 h-4 text-muted-foreground" />,
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Inspecciones Externas</h1>
          <p className="text-muted-foreground">
            Registro de auditorias y fiscalizaciones de organismos externos
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/sostenibilidad/prevencion-riesgos/inspecciones-externas/importar">
              Plantilla
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/sostenibilidad/prevencion-riesgos/inspecciones-externas/importar">
              <Upload className="mr-2 h-4 w-4" />
              Importar Excel
            </Link>
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90"
            onClick={() => {
              setSelectedInspeccion(null);
              setModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva Inspección
          </Button>
        </div>
      </div>

      <InspeccionExternaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        inspeccion={selectedInspeccion || undefined}
        onSuccess={handleModalSuccess}
      />

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        titulo={`Inspección ${selectedInspeccion?.numero_inspeccion}`}
        descripcion={`Se eliminará la inspección "${selectedInspeccion?.numero_inspeccion}" de ${selectedInspeccion?.empresa_externa}. Esta acción no se puede deshacer.`}
        onConfirm={handleDelete}
      />

      <div className="mb-6 flex gap-2">
        <Input
          placeholder="Buscar por numero, area o empresa..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <Button variant="outline" size="icon">
          <Search className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Inspecciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredInspecciones.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Planificadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {filteredInspecciones.filter((i) => i.estado === 'planificada').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Realizadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">
              {filteredInspecciones.filter((i) => i.estado === 'realizada').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cerradas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">
              {filteredInspecciones.filter((i) => i.estado === 'cerrada').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Hallazgos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredInspecciones.reduce((sum, i) => sum + i.hallazgos_count, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {filteredInspecciones.some((insp) => insp.hallazgos_count > 0) && (
        <div className="mb-5 flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Hallazgos que requieren clasificación</p>
            <p className="text-sm text-muted-foreground">Un hallazgo de inspección no constituye automáticamente una no conformidad. Revise el informe de origen antes de registrar seguimiento; conserve el número de inspección como referencia.</p>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/dashboard/sostenibilidad/no-conformidades">Revisar no conformidades</Link>
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Listado de Inspecciones</CardTitle>
          <CardDescription>Total: {filteredInspecciones.length} registros</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Numero</th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Faena</th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Empresa Externa</th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Contacto</th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Fecha</th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Hallazgos</th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Estado</th>
                  <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredInspecciones.map((insp) => (
                  <tr key={insp.id} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-4 font-medium">{insp.numero_inspeccion}</td>
                    <td className="py-3 px-4">{insp.faena}</td>
                    <td className="py-3 px-4">{insp.empresa_externa}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">{insp.contacto_externo}</td>
                    <td className="py-3 px-4 text-sm">
                      {new Date(insp.fecha_planificada).toLocaleDateString('es-CL')}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline">{insp.hallazgos_count}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {estadoIcon[insp.estado as keyof typeof estadoIcon]}
                        <span className="text-sm capitalize">{insp.estado}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEditClick(insp)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" disabled={isLoading}>
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(insp)}
                        disabled={isLoading}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredInspecciones.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No hay inspecciones que mostrar
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
