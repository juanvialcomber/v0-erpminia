import { Asset360Overview } from '@/components/maintenance/asset-360-overview';
import { getDictionaryForRequest } from '@/lib/i18n/server';

export const metadata = {
  title: 'Vehículo 360° | Mantenimiento',
  description: 'Ficha 360 única del activo: identidad, estado, atención, trabajo, historial y documentación.',
};

type FichaPageProps = {
  params: Promise<{ id: string }>;
};

export default async function FichaPage({ params }: FichaPageProps) {
  const { id } = await params;
  const assetId = decodeURIComponent(id);
  const { locale } = await getDictionaryForRequest();

  return <Asset360Overview assetId={assetId} scope="vehiculos" locale={locale} />;
}
