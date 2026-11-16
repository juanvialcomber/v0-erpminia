import { getSupabaseServerClient } from '@/lib/supabase-server';
import { deriveMopSearch, isMopQuestion, toMopPartida, toMopReference, MOP_2025_URL } from '@/lib/engineering/mop-reference.mjs';

type ServerDb = ReturnType<typeof getSupabaseServerClient>;

export type MopReference = {
  documentId: string; title: string; edition: string; volume: number | null;
  pdfPage: number; section: string | null; sha256: string; sourceUrl: string;
  label: string; excerpt: string; isTechnicalReference: boolean; applicability: string;
};
export type MopPartida = {
  code: string; chapter: string; description: string; unit: string;
  sourceRow: number | null; edition: string; sha256: string;
  sourceUrl: string; hasUnitPrice: boolean;
};

export async function getEngineeringMopLibraryStatus(db: ServerDb) {
  const query = await db.from('engineering_mop_documents_v1')
    .select('id,kind,ingestion_state,page_count,text_page_count,storage_path')
    .eq('edition','2025').limit(25);
  if (query.error) return {
    state:'not_connected' as const, sourceCount:0, expectedSourceCount:12,
    indexedTextPages:0, pagesWithOriginalStored:0, visualReviewRequired:true,
    url:MOP_2025_URL,
  };
  const rows = (query.data || []).filter(row => row.ingestion_state === 'text_indexed');
  const sourceCount = rows.length;
  return {
    state: sourceCount === 12 ? 'text_indexed_visual_review_pending' as const
      : sourceCount > 0 ? 'partially_indexed' as const : 'not_indexed' as const,
    sourceCount, expectedSourceCount:12,
    indexedTextPages:rows.reduce((n,row) => n + Number(row.text_page_count || 0),0),
    pagesWithOriginalStored:rows.filter(row => Boolean(row.storage_path)).length,
    visualReviewRequired:true, url:MOP_2025_URL,
  };
}

export async function searchEngineeringMopLibrary(db: ServerDb, question: string): Promise<{
  searched: boolean; connected: boolean; references: MopReference[]; partidas: MopPartida[];
  query: string;
}> {
  if (!isMopQuestion(question)) {
    return { searched:false,connected:false,references:[],partidas:[],query:'' };
  }
  const query = deriveMopSearch(question);
  if (query.length < 2) return {
    searched:true,connected:false,references:[],partidas:[],query,
  };
  const needPartidas = /presupuesto|costo|precio|partidas?|cubicaci[oó]n|especificaciones|licitaci[oó]n|contratista/i.test(question);
  const [main,items] = await Promise.all([
    db.rpc('search_engineering_mop_v1',{query_text:query,max_results:6}),
    needPartidas
      ? db.rpc('search_engineering_mop_partidas_v1',{query_text:query,max_results:5})
      : Promise.resolve({data:[],error:null}),
  ]);
  return {
    searched:true, connected:!main.error && !items.error,
    references:Array.isArray(main.data)
      ? main.data.map(row => toMopReference(row)).filter(Boolean) as MopReference[] : [],
    partidas:Array.isArray(items.data)
      ? items.data.map(row => toMopPartida(row)).filter(Boolean) as MopPartida[] : [],
    query,
  };
}
