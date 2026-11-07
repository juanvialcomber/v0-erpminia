import { redirect } from 'next/navigation';

export default function LegacyLaudusAssetReviewRoute() {
  redirect('/dashboard/finanzas/activos/conciliacion');
}
