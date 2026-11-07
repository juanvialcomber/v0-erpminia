import Link from 'next/link';
import { UserRoundCog } from 'lucide-react';
import CarpetaArranquePage from '@/app/dashboard/sostenibilidad/prevencion-riesgos/carpeta-arranque/page';
import { Button } from '@/components/ui/button';

export default function LegalContractorDocumentsPage() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/documentos-gestion/eecc">
            <UserRoundCog className="mr-2 h-4 w-4" />
            Gestionar proveedores
          </Link>
        </Button>
      </div>
      <CarpetaArranquePage legalContext />
    </div>
  );
}
