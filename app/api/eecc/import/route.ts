import { NextRequest, NextResponse } from 'next/server';
import { requireEeccProfileManager } from '@/lib/api/eecc-profile-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

type XlsxModule = {
  read: (buffer: Buffer, options: { type: 'buffer' }) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: (sheet: unknown) => Array<Record<string, unknown>>;
  };
};

export async function POST(request: NextRequest) {
  try {
    const manager = await requireEeccProfileManager(request);
    if (!manager.authorized || !manager.auth.user || !manager.auth.organizationId) {
      return manager.response;
    }
    const auth = manager.auth;

    // Get form data with file
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Read file as buffer and parse
    const buffer = Buffer.from(await file.arrayBuffer());
    const xlsx = (await import('xlsx')) as unknown as XlsxModule;
    const workbook = xlsx.read(buffer, { type: 'buffer' as const });

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json(
        { error: 'No sheets found in workbook' },
        { status: 400 }
      );
    }

    // Convert sheet to JSON
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No data rows found in spreadsheet' },
        { status: 400 }
      );
    }

    // Get organization ID from user's org
    const supabase = getSupabaseServerClient();

    const organizationId = auth.organizationId;

    // Parse and validate rows
    const eeccRecords: Array<{
      name: string;
      rut: string;
      representative?: string;
      email?: string;
      phone?: string;
    }> = [];

    for (const row of rows) {
      const record = row as Record<string, any>;

      // Map column names (case-insensitive, handle variations)
      const name =
        record['EMPRESA'] ||
        record['Empresa'] ||
        record['empresa'] ||
        record['NAME'] ||
        record['Nombre'] ||
        record['nombre'];

      const rut =
        record['RUT'] ||
        record['Rut'] ||
        record['rut'] ||
        record['RFC'] ||
        record['Rfc'] ||
        record['rfc'];

      const representative =
        record['REPRESENTANTE'] ||
        record['Representante'] ||
        record['representante'] ||
        record['CONTACT'] ||
        record['Contact'] ||
        record['contact'];

      const email =
        record['CORREO'] ||
        record['Correo'] ||
        record['correo'] ||
        record['EMAIL'] ||
        record['Email'] ||
        record['email'];

      const phone =
        record['TELÉFONO'] ||
        record['Telefono'] ||
        record['telefono'] ||
        record['PHONE'] ||
        record['Phone'] ||
        record['phone'];

      if (!name || !rut) {
        continue; // Skip rows without name or RUT
      }

      eeccRecords.push({
        name: String(name).trim(),
        rut: String(rut).trim(),
        representative: representative ? String(representative).trim() : undefined,
        email: email ? String(email).trim() : undefined,
        phone: phone ? String(phone).trim() : undefined,
      });
    }

    if (eeccRecords.length === 0) {
      return NextResponse.json(
        { error: 'No valid EECC records found in file' },
        { status: 400 }
      );
    }

    // Insert/update EECC records
    const { data, error } = await supabase
      .from('eecc')
      .upsert(
        eeccRecords.map((record) => ({
          organization_id: organizationId,
          name: record.name,
          rut: record.rut,
          representative: record.representative,
          email: record.email,
          phone: record.phone,
          is_active: true,
          created_by: auth.source === 'supabase' ? auth.user.id : null,
        })),
        {
          onConflict: 'organization_id,rut',
        }
      )
      .select();

    if (error) {
      console.error('[v0] Error upserting EECC:', error);
      return NextResponse.json(
        { error: `Failed to import EECC: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${eeccRecords.length} empresas importadas exitosamente`,
      imported: data?.length || eeccRecords.length,
    });
  } catch (error) {
    console.error('[v0] Import EECC error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
