'use client';

import { useState } from 'react';
import { Activity, ChevronDown, CircleDollarSign, FileText, FolderOpen, Settings, Upload, Wrench } from 'lucide-react';
import Link from 'next/link';
import type { Equipment } from '@/lib/types/equipment';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EquipmentList } from '@/components/maintenance/equipment-list';
import { EquipmentSheet } from '@/components/maintenance/equipment-sheet';
import { DataSourceStatusStrip } from '@/components/data/data-source-status-strip';
import { DataReceptionReadiness } from '@/components/data/data-reception-readiness';
import { useDataSourceStatus } from '@/hooks/use-data-source-status';

const assetViews = [
  { href: '/dashboard/mantenimiento/disponibilidad', label: 'Disponibilidad', icon: Activity },
  { href: '/dashboard/mantenimiento/costos', label: 'Costos', icon: CircleDollarSign },
  { href: '/dashboard/mantenimiento/fichas-tecnicas', label: 'Datos técnicos', icon: FileText },
  { href: '/dashboard/mantenimiento/documentos/expedientes', label: 'Documentos', icon: FolderOpen },
  { href: '/dashboard/mantenimiento/neumaticos', label: 'Neumáticos', icon: Settings },
  { href: '/dashboard/mantenimiento/componentes-mayores', label: 'Componentes', icon: Wrench },
];

export default function EquiposPage() {
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const sourceStatus = useDataSourceStatus();

  const handleSelectEquipment = (equipment: Equipment) => {
    setSelectedEquipment(equipment);
    setIsSheetOpen(true);
  };

  const handleCloseSheet = () => {
    setIsSheetOpen(false);
    setSelectedEquipment(null);
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-border/70 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Mantenimiento · Flota operacional</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Equipos</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Estado, trabajo pendiente, preventivos, horómetro y confiabilidad por activo. Cada fila conduce a la acción principal o a su Ficha 360.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline">Vistas del activo<ChevronDown className="ml-2 h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              {assetViews.map(({ href, label, icon: Icon }) => <DropdownMenuItem key={href} asChild><Link href={href}><Icon className="h-4 w-4" />{label}</Link></DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild><Link href="/dashboard/mantenimiento/equipos/importar"><Upload className="mr-2 h-4 w-4" />Importar activos</Link></Button>
        </div>
      </section>

      <DataSourceStatusStrip
        reviewHref="/dashboard/calidad-datos"
        sources={[
          { key: 'maintenance', label: 'Mantenimiento', state: 'updated', detail: 'OT, horómetros, evidencia y condición operacional.' },
          sourceStatus.source('procurement', { key: 'procurement', label: 'Compras', state: 'pending', detail: 'Costos y repuestos vinculables al activo.' }),
          sourceStatus.source('laudus', { key: 'laudus', label: 'Laudus', state: 'pending', detail: 'Activo fijo y costo financiero: pendiente de API.' }),
          { key: 'documents', label: 'Documentos', state: 'updated', detail: 'Ficha técnica y expediente permanecen trazables.' },
        ]}
      />

      <DataReceptionReadiness
        description="La Ficha 360 puede enriquecerse con activo fijo, compras y costos de Laudus sin reemplazar el historial operacional de MOTIL."
        items={[
          { label: 'Identidad del activo', ready: true, detail: 'Activo canónico como autoridad operacional.' },
          { label: 'Historial de OT', ready: true, detail: 'Mantenimiento y evidencia disponibles.' },
          { label: 'Compras y costos', ready: true, detail: 'Relaciones financieras ya modeladas.' },
          { label: 'Activo fijo Laudus', ready: false, detail: 'Se activará después de reconciliar IDs.' },
        ]}
      />

      <EquipmentList onSelectEquipment={handleSelectEquipment} />

      <EquipmentSheet equipment={selectedEquipment} isOpen={isSheetOpen} onClose={handleCloseSheet} canEdit={true} />
    </div>
  );
}
