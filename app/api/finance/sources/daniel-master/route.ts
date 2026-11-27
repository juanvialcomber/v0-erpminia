import { type NextRequest, NextResponse } from 'next/server';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { danielMasterSource } from '@/lib/finance/daniel-master-source';
import type { DanielMasterRow } from '@/lib/finance/daniel-master';

export const dynamic = 'force-dynamic';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (access.organizationId !== context.organizationId) {
    return json({ error: 'Organización no autorizada' }, 403);
  }

  const sheet = request.nextUrl.searchParams.get('sheet');
  const row = request.nextUrl.searchParams.get('row');
  const calculate = request.nextUrl.searchParams.get('calculate') === '1';
  if ((calculate && sheet !== null) || (sheet !== null && (!sheet.trim() || sheet.length > 31))
    || (row !== null && (!sheet || !/^[1-9][0-9]{0,6}$/.test(row) || Number(row) > 1_048_576))) {
    return json({ error: 'Hoja o fila inválida' }, 400);
  }

  const source = danielMasterSource(context);

  try {
    if (sheet) {
      const { data: registeredSheet, error: sheetError } = await source.fromSource('production_source_sheet_registry', 'source_sheet')
        .eq('source_sheet', sheet)
        .maybeSingle();
      if (sheetError) throw sheetError;
      if (!registeredSheet) return json({ error: 'Hoja no encontrada' }, 404);

      if (row !== null) {
        const { data, error } = await source.rawRows(sheet, 'source_row,source_values')
          .eq('source_row', Number(row))
          .maybeSingle<DanielMasterRow>();
        if (error) throw error;
        if (!data) return json({ error: 'Fila no encontrada' }, 404);
        return json(data);
      }

      const { data, error } = await source.rawRows(sheet, 'source_row')
        .order('source_row')
        .returns<Array<{ source_row: number }>>();
      if (error) throw error;
      return json({ rows: data.map(({ source_row }) => source_row) });
    }

    const master = await source.read();
    return json(calculate ? await source.calculate(master) : master);
  } catch (error) {
    console.error('Unable to read Daniel finance master', error);
    return json({ error: 'No se pudo consultar el maestro de Finanzas' }, 500);
  }
}
