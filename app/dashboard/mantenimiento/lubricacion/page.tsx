import { MaintenanceLubricationIntelligence } from '@/components/maintenance/maintenance-lubrication-intelligence';

export const metadata = {
  title: 'Aceites y lubricación',
  description: 'Consumo, stock, residuos y proyección de lubricantes para Mantención.',
};

export default function MaintenanceLubricationPage() {
  return <MaintenanceLubricationIntelligence />;
}
