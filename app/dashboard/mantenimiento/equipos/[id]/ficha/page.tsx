import { Asset360Overview } from '@/components/maintenance/asset-360-overview';
import { AssetHseControls } from '@/components/maintenance/asset-hse-controls';
import { getDictionaryForRequest } from '@/lib/i18n/server';
import { AssetEconomicOperationalHistory } from '@/components/maintenance/asset-economic-operational-history';
import { AssetEconomicConditionTrend } from '@/components/maintenance/asset-economic-condition-trend';
import { AssetSupplyEconomics } from '@/components/maintenance/asset-supply-economics';

export const metadata = {
  title: 'Equipo 360° | Mantenimiento',
  description: 'Ficha 360 única del activo: identidad, estado, atención, trabajo, historial y documentación.',
};

type FichaPageProps = {
  params: Promise<{ id: string }>;
};

export default async function FichaPage({ params }: FichaPageProps) {
  const { id } = await params;
  const assetId = decodeURIComponent(id);
  const { locale } = await getDictionaryForRequest();

  return (
    <div className="space-y-4">
      <Asset360Overview assetId={assetId} locale={locale} />
      <AssetSupplyEconomics assetId={assetId} />
      <AssetHseControls assetId={assetId} />
      <details className="group rounded-lg border border-border bg-card">
        <summary className="cursor-pointer list-none px-5 py-4">
          <span className="block text-sm font-semibold">Análisis histórico avanzado</span>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            Evolución de costos, uso observado y causas auditadas
          </span>
        </summary>
        <div className="border-t border-border p-4">
          <AssetEconomicOperationalHistory assetId={assetId} />
        </div>
      </details>
      <details className="group rounded-lg border border-border bg-card">
        <summary className="cursor-pointer list-none px-5 py-4">
          <span className="block text-sm font-semibold">Tendencia costo + condición</span>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            Dos ventanas consecutivas de 12 meses con evidencia mínima de 30 reportes
          </span>
        </summary>
        <div className="border-t border-border p-4">
          <AssetEconomicConditionTrend assetId={assetId} />
        </div>
      </details>
    </div>
  );
}