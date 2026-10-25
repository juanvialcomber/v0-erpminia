import { SuppliersList } from '@/components/compras/suppliers-list';
import { FinanceSupplierCommitments } from '@/components/finance/finance-supplier-commitments';

export const metadata = {
  title: 'Proveedores | Finanzas',
  description: 'Fichas e historial de compras de proveedores.',
};

export default function FinanceSuppliersPage() {
  return (
    <div className="space-y-6">
      <section className="border-b border-border/70 pb-6">
        <p className="text-sm font-medium text-muted-foreground">Finanzas · Compras</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Proveedores</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Revisa qué proveedores concentran las compras y cuáles aún no tienen una ficha en MOTIL.</p>
      </section>
      <FinanceSupplierCommitments />
      <section className="space-y-4" aria-labelledby="supplier-list-title">
        <div>
          <h2 id="supplier-list-title" className="text-lg font-semibold">Fichas de proveedores</h2>
          <p className="mt-1 text-sm text-muted-foreground">Busca por razón social, nombre, RUT o correo electrónico para consultar el historial de compras.</p>
        </div>
        <SuppliersList />
      </section>
    </div>
  );
}
