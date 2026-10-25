import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext } from '@/lib/api/auth-session';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { listDocumentsForOrganization } from '@/lib/api/documents';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { sourceEvidenceStoragePath } from '@/lib/maintenance/source-evidence';

export const dynamic = 'force-dynamic';

const BUCKET = 'module-documents';
const SOURCE_WORKBOOK_CATEGORY = 'source-workbooks';
const MODULE_DOCUMENT_LIMIT = 1000;
const NO_STORE = { 'Cache-Control': 'private, no-store' };

// Review/list consumers need these document fields, but never a workbook's
// entire cell manifest or its potentially large search_text in a list response.
const WORKBOOK_COLUMNS = 'id,module,category,document_name,document_type,document_type_category,file_path,file_size_bytes,description,uploaded_by,uploaded_at,valid_from,valid_until,version,previous_version_id,status,reviewed_by_l1,reviewed_at_l1,l1_status,l1_observations,reviewed_by_l2,reviewed_at_l2,l2_status,l2_observations,is_active,deleted_at,created_at,updated_at,document_code,tags,expires_at,asset_id,canonical_section,organization_id,provenance_status,canonical_role,canonicalized_at,workbook_schema:extracted_data->>schemaVersion,workbook_review:extracted_data->>review_status,workbook_name:extracted_data->manifest->file->>name,workbook_extension:extracted_data->manifest->file->>extension,workbook_bytes:extracted_data->manifest->file->>byteLength,workbook_sha256:extracted_data->manifest->file->>sha256,workbook_sheets:extracted_data->manifest->counts->>sheets,workbook_hidden_sheets:extracted_data->manifest->counts->>hiddenSheets,workbook_cells:extracted_data->manifest->counts->>cells,workbook_formulas:extracted_data->manifest->counts->>formulaCells,workbook_cached_formulas:extracted_data->manifest->counts->>cachedFormulaCells,workbook_merged_ranges:extracted_data->manifest->counts->>mergedRanges,workbook_defined_names:extracted_data->manifest->counts->>definedNames,workbook_dependencies:extracted_data->manifest->counts->>dependencies';

type ModuleDocumentRow = Record<string, unknown> & {
  id: string;
  module: string;
  category: string | null;
  organization_id: string;
  created_at: string | null;
  file_path: string | null;
};

function outlineText(value: unknown, max = 255): string | null {
  return typeof value === 'string' ? value.slice(0, max) : null;
}

function outlineCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function workbookOutline(row: ModuleDocumentRow): ModuleDocumentRow {
  const {
    workbook_schema, workbook_review, workbook_name, workbook_extension, workbook_bytes, workbook_sha256,
    workbook_sheets, workbook_hidden_sheets, workbook_cells, workbook_formulas, workbook_cached_formulas,
    workbook_merged_ranges, workbook_defined_names, workbook_dependencies, ...document
  } = row;
  return {
    ...document,
    extracted_data: {
      schemaVersion: outlineText(workbook_schema, 80),
      summaryOnly: true,
      review_status: outlineText(workbook_review, 80),
      manifest: {
        file: {
          name: outlineText(workbook_name), extension: outlineText(workbook_extension, 10),
          byteLength: outlineCount(workbook_bytes), sha256: outlineText(workbook_sha256, 64),
        },
        counts: {
          sheets: outlineCount(workbook_sheets), hiddenSheets: outlineCount(workbook_hidden_sheets),
          cells: outlineCount(workbook_cells), formulaCells: outlineCount(workbook_formulas),
          cachedFormulaCells: outlineCount(workbook_cached_formulas), mergedRanges: outlineCount(workbook_merged_ranges),
          definedNames: outlineCount(workbook_defined_names), dependencies: outlineCount(workbook_dependencies),
        },
      },
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuthContext(request);
    if (!auth || !auth.organizationId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401, headers: NO_STORE });
    }
    const organizationId = auth.organizationId;

    const searchParams = request.nextUrl.searchParams;
    const module = searchParams.get('module');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const assetId = searchParams.get('assetId');
    const canonicalSection = searchParams.get('canonicalSection');
    const limit = Number(searchParams.get('limit') || '50');
    const offset = Number(searchParams.get('offset') || '0');

    if (module) {
      const wantsWorkbooks = !category || category === SOURCE_WORKBOOK_CATEGORY;
      let canReadWorkbooks = wantsWorkbooks;
      if (wantsWorkbooks && ['mantenimiento', 'maintenance'].includes(module)) {
        const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
        canReadWorkbooks = access.authorized && access.organizationId === organizationId;
        if (!canReadWorkbooks && category === SOURCE_WORKBOOK_CATEGORY) {
          return !access.authorized ? access.response : NextResponse.json(
            { error: 'No se pudo verificar la organización autorizada.' }, { status: 403, headers: NO_STORE },
          );
        }
      }
      const supabase = getSupabaseServerClient();

      const queryFor = (columns: string) => {
        let query = supabase.from('module_documents').select(columns, { count: 'exact' })
          .eq('organization_id', organizationId).eq('module', module)
          .eq('is_active', true).is('deleted_at', null)
          .order('created_at', { ascending: false }).order('id', { ascending: false })
          .limit(MODULE_DOCUMENT_LIMIT + 1);
        if (category) query = query.eq('category', category);
        if (status) query = query.eq('status', status);
        if (assetId) query = query.eq('asset_id', assetId);
        if (canonicalSection) query = query.eq('canonical_section', canonicalSection);
        if (search) query = query.ilike('document_name', `%${search}%`);
        return query;
      };

      // Keep legacy extraction data for EquipmentDocumentWorkspace and the
      // review modal. Native workbooks use a separate SQL projection, so the
      // large manifest is never fetched just to discard it in JavaScript.
      const [legacyResult, workbookResult] = await Promise.all([
        category !== SOURCE_WORKBOOK_CATEGORY
          ? queryFor('*').or('category.is.null,category.neq.source-workbooks')
          : Promise.resolve({ data: [], error: null, count: 0 }),
        canReadWorkbooks
          ? queryFor(WORKBOOK_COLUMNS).eq('category', SOURCE_WORKBOOK_CATEGORY)
          : Promise.resolve({ data: [], error: null, count: 0 }),
      ]);
      if (legacyResult.error || workbookResult.error)
        return NextResponse.json({ error: 'Error al obtener documentos.' }, { status: 500, headers: NO_STORE });

      const legacy = (legacyResult.data || []) as unknown as ModuleDocumentRow[];
      const workbooks = ((workbookResult.data || []) as unknown as ModuleDocumentRow[]).map(workbookOutline);
      const visibleRows = [...legacy, ...workbooks]
        .filter(doc => doc.organization_id === organizationId && doc.module === module)
        .sort((a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0) || b.id.localeCompare(a.id))
        .slice(0, MODULE_DOCUMENT_LIMIT);
      const total = typeof legacyResult.count === 'number' && typeof workbookResult.count === 'number'
        ? legacyResult.count + workbookResult.count : null;

      const documents = await Promise.all(
        visibleRows.map(async (doc) => {
          let file_url: string | null = null;
          const path = doc.category === SOURCE_WORKBOOK_CATEGORY
            ? sourceEvidenceStoragePath('module_document', doc.file_path, organizationId)
            : doc.file_path;
          if (path) {
            const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
            file_url = signed?.signedUrl || null;
          }
          return { ...doc, file_url };
        })
      );

      const truncated = total === null
        ? legacy.length + workbooks.length > documents.length ? true : null
        : total > documents.length;
      return NextResponse.json({ documents, total, limit: MODULE_DOCUMENT_LIMIT, truncated }, { headers: NO_STORE });
    }

    const data = await listDocumentsForOrganization(organizationId, {
      status,
      category,
      search,
      limit,
      offset,
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        documents: [],
        total: 0,
      },
      { status: 500 }
    );
  }
}
