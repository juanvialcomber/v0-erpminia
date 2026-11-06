export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/guard';
import { createContract, listContractsForOrganization } from '@/lib/api/contracts';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized || !auth.organizationId || !auth.user) {
    return auth.response || NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const search = new URL(request.url).searchParams.get('search');
    const result = await listContractsForOrganization(auth.organizationId, search);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron cargar los contratos legales';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized || !auth.organizationId || !auth.user) {
    return auth.response || NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    const payload =
      contentType.includes('multipart/form-data') ? await request.formData() : await request.json();

    const readField = (keys: string[], fallback = '') => {
      for (const key of keys) {
        const value =
          payload instanceof FormData ? payload.get(key) : (payload as Record<string, unknown>)[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
      return fallback;
    };

    const parseNumber = (keys: string[], fallback = 0) => {
      for (const key of keys) {
        const value =
          payload instanceof FormData ? payload.get(key) : (payload as Record<string, unknown>)[key];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim()) {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) return parsed;
        }
      }
      return fallback;
    };

    const optionalNumber = (keys: string[]) => {
      for (const key of keys) {
        const value = payload instanceof FormData ? payload.get(key) : (payload as Record<string, unknown>)[key];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim()) {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) return parsed;
        }
      }
      return undefined;
    };

    const contract = await createContract({
      organizationId: auth.organizationId,
      createdBy: auth.user.id,
      title: readField(['title', 'nombreContrato']),
      contractNumber:
        readField(['contractNumber', 'contract_number']) ||
        `CNT-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
      description: readField(['description']) || undefined,
      contractType: readField(['contractType', 'contract_type'], 'Principal'),
      status: readField(['status', 'estado'], 'En Revisión'),
      contractValue: parseNumber(['contractValue', 'contract_value', 'monto_total']),
      currency: readField(['currency'], 'CLP'),
      paidAmount: parseNumber(['paidAmount', 'paid_amount']),
      executionPercentage: optionalNumber(['executionPercentage', 'execution_percentage']),
      startDate: readField(['startDate', 'start_date', 'fecha_inicio']) || undefined,
      endDate: readField(['endDate', 'end_date', 'fecha_fin']) || undefined,
      reviewDueDate: readField(['reviewDueDate', 'review_due_date']) || undefined,
      responsiblePerson: readField(['responsiblePerson', 'responsible_person']) || undefined,
      responsibleArea: readField(['responsibleArea', 'responsible_area']) || undefined,
      contractorName: readField(['contractorName', 'contractor_name', 'contratista']) || undefined,
      propertyName: readField(['propertyName', 'property_name', 'propiedad']) || undefined,
      projectName: readField(['projectName', 'project_name', 'proyecto']) || undefined,
      royaltyRate: parseNumber(['royaltyRate', 'royalty_rate']),
      guaranteeAmount: parseNumber(['guaranteeAmount', 'guarantee_amount']),
      complianceStatus: readField(['complianceStatus', 'compliance_status'], 'Pendiente'),
      complianceNotes: readField(['complianceNotes', 'compliance_notes']) || undefined,
      fileUrl: readField(['fileUrl', 'file_url']) || undefined,
      filePath: readField(['filePath', 'file_path']) || undefined,
      fileName: readField(['fileName', 'file_name']) || undefined,
      fileSizeBytes: parseNumber(['fileSizeBytes', 'file_size_bytes']),
      fileMimeType: readField(['fileMimeType', 'file_mime_type']) || undefined,
    });

    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear el contrato legal';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
