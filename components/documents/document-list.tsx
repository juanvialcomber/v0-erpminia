'use client';

import { useState } from 'react';
import { FileText, Download, Eye, Trash2, CheckCircle2, AlertCircle, Clock, Search, Hash, Tag, X, ChevronDown, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface Document {
  id: string;
  document_name: string;
  document_type: string;
  document_type_category: string;
  document_code: string;
  tags: string[];
  file_size_bytes: number;
  uploaded_by: string;
  uploaded_at: string;
  valid_until: string;
  valid_from: string;
  status: string;
  l1_observations: string;
  l2_observations: string;
  is_expired: boolean;
  file_url: string;
  description: string;
  version: number;
  title: string;
  documentNumber: string;
  documentType: string;
  category: string;
  asset_id?: string | null;
  canonical_section?: string | null;
  extracted_data?: Record<string, unknown> | null;
  organization_id?: string | null;
  provenance_status?: 'operational' | 'canonical' | 'candidate' | 'supporting';
  canonical_role?: 'canonical' | 'supporting' | 'plan_only' | null;
  createdAt: string;
  createdByUser: { name: string };
  expiryDate: string;
  daysUntilExpiry: number;
  [key: string]: unknown;
}

interface DocumentListProps {
  documents: Document[];
  isLoading: boolean;
  onDelete?: (documentId: string) => Promise<void>;
  onView: (document: Document | string) => void;
  showSearch?: boolean;
}

const statusConfig: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  draft: { label: 'Borrador', color: 'bg-muted text-muted-foreground border border-border', icon: Clock },
  pending_l1: { label: 'Primera revisión', color: 'bg-blue-500/10 text-blue-400 border border-blue-500/30', icon: Clock },
  pending_l2: { label: 'Segunda revisión', color: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30', icon: Clock },
  en_revision_l1: { label: 'Primera revisión', color: 'bg-blue-500/10 text-blue-400 border border-blue-500/30', icon: Clock },
  en_revision_l2: { label: 'Segunda revisión', color: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30', icon: Clock },
  active: { label: 'Vigente', color: 'bg-green-500/10 text-green-400 border border-green-500/30', icon: CheckCircle2 },
  aprobado: { label: 'Vigente', color: 'bg-green-500/10 text-green-400 border border-green-500/30', icon: CheckCircle2 },
  rejected: { label: 'Rechazado', color: 'bg-red-500/10 text-red-400 border border-red-500/30', icon: AlertCircle },
  rechazado: { label: 'Rechazado', color: 'bg-red-500/10 text-red-400 border border-red-500/30', icon: AlertCircle },
};

const typeColors: Record<string, string> = {
  pdf: 'bg-red-500/10 text-red-400 border-red-500/30',
  docx: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  doc: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  xlsx: 'bg-green-500/10 text-green-400 border-green-500/30',
  xls: 'bg-green-500/10 text-green-400 border-green-500/30',
};

export function DocumentList({
  documents,
  isLoading = false,
  onDelete,
  onView,
  showSearch = true,
}: DocumentListProps) {
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string>('');
  const [activeType, setActiveType] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [deletingId, setDeletingId] = useState<string>('');

  const allTags = Array.from(
    new Set(documents.flatMap((d) => d.tags || []))
  ).sort();

  const allTypes = Array.from(
    documents.reduce((acc, doc) => {
      const type = doc.document_type_category || doc.category || '';
      if (type) acc.set(type, (acc.get(type) || 0) + 1);
      return acc;
    }, new Map<string, number>())
  ).sort((a, b) => b[1] - a[1]);

  const filtered = documents.filter((doc) => {
    const name = (doc.document_name || doc.title || '').toLowerCase();
    const code = (doc.document_code || '').toLowerCase();
    const category = (doc.document_type_category || doc.category || '').toLowerCase();
    const desc = (doc.description || '').toLowerCase();
    const term = search.toLowerCase();

    const matchesSearch = !term ||
      name.includes(term) ||
      code.includes(term) ||
      category.includes(term) ||
      desc.includes(term);

    const matchesTag = !activeTag || (doc.tags || []).includes(activeTag);

    const matchesType = !activeType ||
      (doc.document_type_category || doc.category || '') === activeType;

    return matchesSearch && matchesTag && matchesType;
  });

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: string) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('es-CL', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  };

  const handleDelete = async (id: string) => {
    if (!onDelete) return;
    setDeletingId(id);
    try { await onDelete(id); } finally { setDeletingId(''); }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="flex gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-muted" />
                <div className="h-3 w-1/3 rounded bg-muted" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showSearch && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar por nombre, número o tipo de documento..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-9"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                showFilters || activeType || activeTag
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/50'
              )}
            >
              <Filter className="h-4 w-4" />
              Filtrar
              {(activeType || activeTag) && (
                <span className="ml-0.5 bg-primary-foreground text-primary rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-bold">
                  {[activeType, activeTag].filter(Boolean).length}
                </span>
              )}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showFilters && 'rotate-180')} />
            </button>
          </div>

          {showFilters && (
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
              {allTypes.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo de documento</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setActiveType('')}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                        !activeType
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/50'
                      )}
                    >
                      Todos ({documents.length})
                    </button>
                    {allTypes.map(([type, count]) => (
                      <button
                        key={type}
                        onClick={() => setActiveType(activeType === type ? '' : type)}
                        className={cn(
                          'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                          activeType === type
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/50'
                        )}
                      >
                        {type} ({count})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {allTags.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Etiquetas
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
                        className={cn(
                          'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                          activeTag === tag
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/50'
                        )}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(activeType || activeTag) && (
                <button
                  onClick={() => { setActiveType(''); setActiveTag(''); }}
                  className="text-xs text-primary hover:underline"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}

          {(search || activeTag || activeType) && (
            <p className="text-xs text-muted-foreground">
              {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
              {activeType && <span> en &quot;{activeType}&quot;</span>}
              {search && <span> para &quot;{search}&quot;</span>}
              {activeTag && <span> con etiqueta &quot;{activeTag}&quot;</span>}
              {(search || activeTag || activeType) && (
                <button
                  onClick={() => { setSearch(''); setActiveTag(''); setActiveType(''); }}
                  className="ml-2 text-primary hover:underline"
                >
                  Limpiar
                </button>
              )}
            </p>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {search || activeTag || activeType ? 'Sin resultados para esta búsqueda' : 'No hay documentos'}
          </p>
          {(search || activeTag || activeType) && (
            <button
              onClick={() => { setSearch(''); setActiveTag(''); setActiveType(''); }}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => {
            const statusKey = doc.status || 'draft';
            const statusCfg = statusConfig[statusKey] || statusConfig.draft;
            const StatusIcon = statusCfg.icon;
            const displayName = doc.document_name || doc.title || 'Sin nombre';
            const docType = (doc.document_type || '').toLowerCase();
            const typeLabel = docType.toUpperCase() || 'ARCHIVO';
            const typeColor = typeColors[docType] || 'bg-muted text-muted-foreground border-border';
            const uploadDate = formatDate(doc.uploaded_at || doc.createdAt);
            const validUntil = formatDate(doc.valid_until || doc.expiryDate);

            return (
              <Card key={doc.id} className="p-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center text-xs font-bold border',
                    typeColor
                  )}>
                    {typeLabel}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-tight mb-1.5">
                      {displayName}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {doc.document_code && (
                        <span className="inline-flex items-center gap-1 text-xs font-mono text-primary bg-primary/10 border border-primary/20 rounded px-2 py-0.5">
                          <Hash className="h-3 w-3" />
                          {doc.document_code}
                        </span>
                      )}
                      {doc.document_type_category && (
                        <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                          {doc.document_type_category}
                        </span>
                      )}
                      {doc.provenance_status === 'canonical' && (
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                          Documento de referencia
                        </Badge>
                      )}
                      {doc.canonical_section && (
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                          {doc.canonical_section}
                        </Badge>
                      )}
                      {doc.asset_id && (
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                          Con equipo
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', statusCfg.color)}>
                        <StatusIcon className="h-3 w-3" />
                        {statusCfg.label}
                      </span>
                      {doc.version && doc.version > 1 && (
                        <span>v{doc.version}</span>
                      )}
                      {doc.file_size_bytes && (
                        <span>{formatFileSize(doc.file_size_bytes)}</span>
                      )}
                      {uploadDate && <span>{uploadDate}</span>}
                      {validUntil && (
                        <span className={cn(doc.is_expired ? 'text-red-400' : '')}>
                          Válido hasta {validUntil}
                        </span>
                      )}
                    </div>

                    {doc.tags && doc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {doc.tags.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
                            className={cn(
                              'text-xs px-2 py-0.5 rounded-full border transition-colors',
                              activeTag === tag
                                ? 'bg-primary/20 text-primary border-primary/40'
                                : 'bg-muted/50 text-muted-foreground border-border hover:border-primary/30'
                            )}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}

                    {(doc.l1_observations || doc.l2_observations) && (
                      <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-300">
                        <span className="font-medium">Obs: </span>
                        {doc.l1_observations || doc.l2_observations}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1 flex-shrink-0">
                    {onView && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onView(doc)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {doc.file_url && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" asChild>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(doc.id)}
                        disabled={deletingId === doc.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
