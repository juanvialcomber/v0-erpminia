'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Loader2, Search } from 'lucide-react';
import type { Locale } from '@/lib/i18n/dictionaries';

type Person = { id: string; name: string };
type PeopleResult = { people: Person[] };

async function searchPeople(url: string): Promise<PeopleResult> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error('Search unavailable');
  return response.json() as Promise<PeopleResult>;
}

export function RecipientSearch({
  locale, busy, onSelect,
}: {
  locale: Locale;
  busy: boolean;
  onSelect: (personId: string) => void;
}) {
  const es = locale !== 'en';
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(search.trim()), 180);
    return () => window.clearTimeout(handle);
  }, [search]);

  const normalized = useMemo(() => debounced.slice(0, 60), [debounced]);
  const active = normalized.length >= 2;
  const { data, error, isLoading } = useSWR<PeopleResult>(
    active ? '/api/messages/people?q=' + encodeURIComponent(normalized) : null,
    searchPeople,
    { keepPreviousData: false, dedupingInterval: 5000 },
  );
  const results = active && search.trim() === debounced ? data?.people || [] : [];

  const choose = (id: string) => {
    setSearch('');
    setDebounced('');
    onSelect(id);
  };

  return (
    <div className="relative">
      <label htmlFor="motil-recipient-search" className="mb-2 block text-xs font-semibold">
        {es ? 'Nueva conversación' : 'New conversation'}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/>
        <input id="motil-recipient-search" type="search" value={search}
          autoComplete="off" disabled={busy} maxLength={60}
          placeholder={es ? 'Buscar persona…' : 'Find a coworker…'}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results[0] && !busy) {
              event.preventDefault();
              choose(results[0].id);
            }
            if (event.key === 'Escape') setSearch('');
          }}
          className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"/>
        {busy ? <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground"/> : null}
      </div>
      {active && !busy ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-md border bg-popover p-1 shadow-lg"
          role="listbox" aria-label={es ? 'Personas de la organización' : 'Organization members'}>
          {isLoading ? <p className="px-3 py-3 text-xs text-muted-foreground">
            {es ? 'Buscando…' : 'Searching…'}
          </p> : error ? <p className="px-3 py-3 text-xs text-destructive">
            {es ? 'Error al buscar. Intenta nuevamente.' : 'Search failed. Retry.'}
          </p> : results.length ? results.map((person) =>
            <button key={person.id} type="button" role="option" aria-selected={false}
              onClick={() => choose(person.id)}
              className="block w-full rounded px-3 py-2.5 text-left text-sm hover:bg-accent focus-visible:bg-accent">
              {person.name}
            </button>
          ) : <p className="px-3 py-3 text-xs text-muted-foreground">
            {es ? 'Sin coincidencias.' : 'No matches.'}
          </p>}
        </div>
      ) : null}
    </div>
  );
}
