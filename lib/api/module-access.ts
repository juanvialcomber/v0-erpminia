import { type NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { resolveAuthContext, type AuthContext } from '@/lib/api/auth-session';

export type AccessLevel = 'ED' | 'LEC' | 'SR';

export const MODULE_KEYS = {
  HSE_KPLS: 'hse_kpls',
  HSE_DOCUMENTACION: 'hse_documentacion',
  HSE_EPP: 'hse_epp',
  HSE_INCIDENTE: 'hse_incidente',
  HSE_RIESGOS: 'hse_riesgos',
  HSE_INVESTIGACIONES: 'hse_investigaciones',
  HSE_CAPACITACIONES: 'hse_capacitaciones',
  HSE_TABLERO: 'hse_tablero',
  HSE_DOCUMENTOS_EXTRA: 'hse_documentos_extra',
  CONTRATOS_SOLICITAR_LINK: 'contratos_solicitar_link',
  CONTRATOS_SUBIR_INFO: 'contratos_subir_info',
  CONTRATOS_APROBAR: 'contratos_aprobar',
  CONTRATOS_AUTORIZAR: 'contratos_autorizar',
  CONTRATOS_VISUALIZACION: 'contratos_visualizacion',
  SOS_TABLERO: 'sos_tablero',
  SOS_MEDIO_AMBIENTE: 'sos_medio_ambiente',
  SOS_COMUNIDADES: 'sos_comunidades',
  SOS_DOCUMENTOS: 'sos_documentos',
  SOS_CALENDARIO: 'sos_calendario',
  MANT_OPERACIONES: 'mant_operaciones',
  MANT_GERENCIAL: 'mant_gerencial',
  MANT_RECURSOS: 'mant_recursos',
  MANT_DOCUMENTOS: 'mant_documentos',
  BODEGA_INVENTARIO: 'bodega_inventario',
  BODEGA_DOCUMENTOS: 'bodega_documentos',
  FIN_COMPRAS: 'fin_compras',
  FIN_FINANZAS: 'fin_finanzas',
  FIN_REPORTES: 'fin_reportes',
  LEGAL_MODULO: 'legal_modulo',
  LEGAL_CONTRATOS: 'legal_contratos',
  LEGAL_EECC: 'legal_eecc',
  PROD_OPERACIONES: 'prod_operaciones',
  PROD_GEOLOGIA: 'prod_geologia',
  PROD_TOPOGRAFIA: 'prod_topografia',
  PROD_QUIMICA: 'prod_quimica',
  PROD_SONDAJE_EXPLORACION: 'prod_sondaje_exploracion',
  PROD_SONDAJE_PRODUCCION: 'prod_sondaje_produccion',
  PROD_TELEMETRIA: 'prod_telemetria',
  CORE_ALERTAS: 'core_alertas',
  CORE_CENTROS_COSTOS: 'core_centros_costos',
  CORE_CENTROS_COSTOS_ASIGNACION: 'core_centros_costos_asignacion',
  CORE_DESEMPENO: 'core_desempeno',
} as const;

export type ModuleKey = (typeof MODULE_KEYS)[keyof typeof MODULE_KEYS];
const ADMIN_BYPASS_ROLES = new Set(['admin', 'superadmin', 'super_admin']);
export function isAdminRole(role?: string | null): boolean { return !!role && ADMIN_BYPASS_ROLES.has(role); }
export type ModuleAccessMap = Record<string, AccessLevel>;
export interface UserModuleAccess { hasCargo: boolean; access: ModuleAccessMap; }

export async function getUserModuleAccess(userId: string): Promise<UserModuleAccess> {
  const supabase = getSupabaseServerClient();
  const { data: profile } = await supabase.from('profiles').select('cargo_id').eq('id', userId).maybeSingle();
  if (!profile?.cargo_id) return { hasCargo: false, access: {} };
  const { data: rows } = await supabase.from('role_matrix').select('module_key, access_level').eq('cargo_id', profile.cargo_id);
  const map: ModuleAccessMap = {};
  for (const row of rows ?? []) map[row.module_key as string] = row.access_level as AccessLevel;
  return { hasCargo: true, access: map };
}

export async function getModuleAccessLevel(userId: string, role: string | null | undefined, moduleKey: ModuleKey): Promise<AccessLevel> {
  if (isAdminRole(role)) return 'ED';
  const { hasCargo, access } = await getUserModuleAccess(userId);
  if (!hasCargo) return 'SR';
  return access[moduleKey] ?? 'SR';
}

export type ModuleAccessResult =
  | { authorized: false; accessLevel: AccessLevel; canWrite: boolean; user: AuthContext['user'] | null; role: string | null; organizationId: string | null; response: NextResponse; }
  | { authorized: true; accessLevel: AccessLevel; canWrite: boolean; user: AuthContext['user']; role: string | null; organizationId: string | null; response: null; };

export async function requireModuleAccess(request: NextRequest, moduleKey: ModuleKey, requireWrite = false): Promise<ModuleAccessResult> {
  const authContext = await resolveAuthContext(request);
  if (!authContext?.user) {
    return { authorized: false, accessLevel: 'SR', canWrite: false, user: null, role: null, organizationId: null, response: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }
  const role = authContext.role || null;
  const organizationId = authContext.organizationId || authContext.user.organization_id || null;
  const accessLevel = await getModuleAccessLevel(authContext.user.id, role, moduleKey);
  const canWrite = accessLevel === 'ED';
  const canRead = accessLevel === 'ED' || accessLevel === 'LEC';
  const allowed = requireWrite ? canWrite : canRead;
  if (!allowed) {
    const message = accessLevel === 'SR' ? 'No tienes acceso a este módulo' : 'No tienes permiso para realizar esta acción (solo lectura)';
    return { authorized: false, accessLevel, canWrite, user: authContext.user, role, organizationId, response: NextResponse.json({ error: message }, { status: 403 }) };
  }
  return { authorized: true, accessLevel, canWrite, user: authContext.user, role, organizationId, response: null };
}
