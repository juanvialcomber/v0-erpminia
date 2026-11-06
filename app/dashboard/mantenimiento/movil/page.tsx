import { MobileTerrainPanel } from '@/components/maintenance/mobile-terrain-panel';

export const metadata = {
  title: 'Operación en terreno de mantenimiento',
  description: 'Vista rápida para terreno y técnicos de mantenimiento',
};

export default function MaintenanceMobilePage() {
  return <MobileTerrainPanel />;
}
