'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_name: string;
  item_code: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  delivery_date: string;
  status: string;
}

interface PaginationData {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function PurchaseOrdersList() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [scope, setScope] = useState<'current' | 'history'>('current');

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(search && { search }),
    ...(status && { status }),
    scope,
  });

  const { data, isLoading, error } = useSWR(
    `/api/compras/purchase-orders?${params}`,
    (url) => fetch(url).then((r) => r.json())
  );

  const orders: PurchaseOrder[] = data?.orders || [];
  const pagination: PaginationData = data?.pagination || { page: 0, pageSize: 50, total: 0, totalPages: 0 };

  const statusOptions = ['draft', 'pending', 'confirmed', 'received', 'cancelled'];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Órdenes de Compra</CardTitle>
        <CardDescription>
          {scope === 'current' ? 'Compras vigentes y operación actual.' : 'Archivo histórico importado; no representa compras vigentes.'}
          {pagination.totalPages > 0 ? ` · Página ${page + 1} de ${pagination.totalPages}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Select value={scope} onValueChange={(v) => { setScope(v as 'current' | 'history'); setPage(0); }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Vigentes</SelectItem>
              <SelectItem value="history">Histórico</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por PO #, vendedor o ítem..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="pl-10"
            />
          </div>
          <Select value={status || 'all'} onValueChange={(v) => { setStatus(v === 'all' ? '' : v); setPage(0); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <div className="text-red-500 text-sm">Error cargando órdenes</div>
        )}

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Cargando órdenes...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No hay órdenes que coincidan con la búsqueda</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO #</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Ítem</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Precio Unit.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.po_number}</TableCell>
                      <TableCell>{order.vendor_name}</TableCell>
                      <TableCell className="text-sm">{order.item_code}</TableCell>
                      <TableCell className="text-right">{order.quantity}</TableCell>
                      <TableCell className="text-right">${order.unit_price.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium">${order.total_amount.toFixed(2)}</TableCell>
                      <TableCell className="text-sm">
                        {order.delivery_date
                          ? new Date(order.delivery_date).toLocaleDateString('es-CL')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded ${
                          order.status === 'received' ? 'bg-green-100 text-green-800' :
                          order.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                          order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {order.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Página {page + 1} de {pagination.totalPages} · {pagination.total.toLocaleString()} órdenes
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.min(pagination.totalPages - 1, page + 1))}
                    disabled={page >= pagination.totalPages - 1}
                  >
                    Siguiente <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
