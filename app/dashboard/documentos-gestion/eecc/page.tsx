'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Building2,
  CheckCircle,
  Mail,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EeccFormDialog, type EeccRow } from '@/components/eecc/eecc-form-dialog';
import { EeccImportXls } from '@/components/eecc/eecc-import-xls';
import { useModuleAccess } from '@/hooks/use-module-access';
import { useAuth } from '@/hooks/use-auth';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) return null;
  return payload;
};

export default function EeccPage() {
  const { canEdit, isAdmin } = useModuleAccess();
  const { user } = useAuth();
  const email = String(user?.email || '').trim().toLowerCase();
  const canManage = isAdmin || canEdit('legal_eecc') || canEdit('contratos_visualizacion') || email === 'ariellopez@lapatagua.cl';
  const canDelete = isAdmin || canEdit('contratos_visualizacion');

  const [searchTerm, setSearchTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<EeccRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EeccRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading, mutate } = useSWR('/api/eecc', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
  });

  const eeccList = (data?.eecc || []) as EeccRow[];

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) return eeccList;
    return eeccList.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.rut.toLowerCase().includes(term) ||
        item.representative.toLowerCase().includes(term) ||
        item.email.toLowerCase().includes(term)
    );
  }, [eeccList, searchTerm]);

  const stats = {
    total: eeccList.length,
    active: eeccList.filter((item) => item.is_active).length,
    withEmail: eeccList.filter((item) => item.email).length,
  };

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (item: EeccRow) => {
    setEditing(item);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/eecc/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error || 'No se pudo eliminar');
      }
      toast.success('EECC eliminada correctamente');
      setDeleteTarget(null);
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ocurrió un error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/dashboard/documentos-gestion/contratos"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a contratos
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-balance">Empresas Contratistas (EECC)</h1>
            <p className="text-sm text-muted-foreground">
              Directorio de empresas de servicios complementarios asociadas a contratos.
            </p>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" />
                Nueva EECC
              </Button>
              <Button variant="outline" onClick={() => setShowImport(!showImport)}>
                <Plus className="mr-2 h-4 w-4" />
                Importar Excel
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total EECC
            </CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Activas</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Con correo
            </CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats.withEmail}</p>
          </CardContent>
        </Card>
      </div>

      {showImport && canManage && (
        <EeccImportXls />
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Directorio de empresas
            </CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, RUT o representante"
                className="pl-8"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Cargando EECC...</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No se encontraron empresas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>RUT</TableHead>
                    <TableHead>Representante</TableHead>
                    <TableHead>Correo</TableHead>
                    <TableHead>Estado</TableHead>
                    {canManage && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-muted-foreground">{item.rut || ''}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.representative || ''}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.email ? (
                          <a href={`mailto:${item.email}`} className="hover:text-foreground">
                            {item.email}
                          </a>
                        ) : (
                          ''
                        )}
                      </TableCell>
                      <TableCell>
                        {item.is_active ? (
                          <Badge variant="secondary">Activa</Badge>
                        ) : (
                          <Badge variant="outline">Inactiva</Badge>
                        )}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Editar"
                              onClick={() => openEdit(item)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {canDelete ? <Button
                              variant="ghost"
                              size="sm"
                              title="Eliminar"
                              onClick={() => setDeleteTarget(item)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button> : null}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EeccFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        eecc={editing}
        onSaved={() => mutate()}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar esta EECC?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminar <span className="font-medium">{deleteTarget?.name}</span> del directorio.
              Esta accin no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
