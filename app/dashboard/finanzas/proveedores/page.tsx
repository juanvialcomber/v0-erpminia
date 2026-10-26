import { SuppliersList } from '@/components/compras/suppliers-list';

export const metadata = {
  title: 'Proveedores | Finanzas',
  description: 'Directorio y actividad de proveedores.',
};

export default function FinanceSuppliersPage() {
  return (
    <div className="space-y-6">
      <section className="border-b border-border/70 pb-6">
        <p className="text-sm font-medium text-muted-foreground">Finanzas</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Proveedores</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Identidad, compras, productos, montos y actividad reciente en una sola vista.</p>
      </section>
      <SuppliersList />
    </div>
  );
}
