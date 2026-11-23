import { NextRequest, NextResponse } from 'next/server';
import { MODULE_KEYS, requireModuleAccess, type ModuleAccessResult, type ModuleKey } from '@/lib/api/module-access';

const DOCUMENT_MODULE_KEYS: Record<string, ModuleKey> = {
  'prevención': MODULE_KEYS.HSE_DOCUMENTACION,
  prevencion: MODULE_KEYS.HSE_DOCUMENTACION,
  hse: MODULE_KEYS.HSE_DOCUMENTACION,
  legal: MODULE_KEYS.LEGAL_MODULO,
  mantenimiento: MODULE_KEYS.MANT_DOCUMENTOS,
  bodega: MODULE_KEYS.BODEGA_DOCUMENTOS,
  finanzas: MODULE_KEYS.FIN_FINANZAS,
};

export type DocumentModuleAccessResult =
  | ModuleAccessResult
  | { authorized: false; response: NextResponse };

export async function requireDocumentModuleAccess(
  request: NextRequest,
  documentModule: string,
  requireWrite = false,
): Promise<DocumentModuleAccessResult> {
  const normalizedModule = String(documentModule || '').trim().toLowerCase();
  const moduleKey = DOCUMENT_MODULE_KEYS[normalizedModule];

  if (!moduleKey) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Módulo documental inválido' }, { status: 400 }),
    };
  }

  return requireModuleAccess(request, moduleKey, requireWrite);
}
