import { SuppliersList } from '@/components/compras/suppliers-list';
import { FinanceSupplierCommitments } from '@/components/finance/finance-supplier-commitments';

export const metadata = {
  title: 'Proveedores | Finanzas',
  description: 'Maestro canónico y desempeño de proveedores.',
};

export default function FinanceSuppliersPage() {
  return (
    <div className="space-y-6">
      <section className="border-b border-border/70 pb-6">
        <p className="text-sm font-medium text-muted-foreground">Finanzas · Abastecimiento</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Proveedores</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Revisa dónde se concentran las compras comprometidas y qué nombres siguen pendientes de vínculo al maestro.</p>
      </section>
      <FinanceSupplierCommitments />
      <section className="space-y-4" aria-labelledby="canonical-supplier-list-title">
        <div>
          <h2 id="canonical-supplier-list-title" className="text-lg font-semibold">Maestro canónico</h2>
          <p className="mt-1 text-sm text-muted-foreground">Busca una ficha por razón social, nombre, RUT o email y abre su historial financiero.</p>
        </div>
        <SuppliersList />
      </section>
    </div>
  );
}
