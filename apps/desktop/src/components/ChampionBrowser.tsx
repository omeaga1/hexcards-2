import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchField } from '@/registry/components/search-field/search-field';
import { championIconUrl, type ChampionInfo } from '@hexcards/data';
import styles from './ChampionBrowser.module.css';

/** "Kha'Zix", "Nunu & Willump", "Renata Glasc" all match loose typing like "khazix" or "nunu". */
const normalize = (s: string) => s.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

interface ChampionBrowserProps {
  version: string;
  champions: ChampionInfo[];
  hasBuild: (championId: number) => boolean;
  onSelect: (championId: number) => void;
}

export function ChampionBrowser({ version, champions, hasBuild, onSelect }: ChampionBrowserProps) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(() => [...champions].sort((a, b) => a.name.localeCompare(b.name)), [champions]);
  const results = useMemo(() => {
    const q = normalize(query);
    if (!q) return sorted;
    // Names that start with the query first, then names that contain it.
    const starts = sorted.filter((c) => normalize(c.name).startsWith(q) || normalize(c.key).startsWith(q));
    const contains = sorted.filter((c) => !starts.includes(c) && normalize(c.name).includes(q));
    return [...starts, ...contains];
  }, [query, sorted]);

  // Ctrl+K or "/" jumps to search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section className={styles.browser} aria-labelledby="champions-heading">
      <div className={styles.head}>
        <h1 id="champions-heading" className={styles.title}>Champions</h1>
        <div className={styles.search}>
          <SearchField
            ref={searchRef}
            label="Search champions"
            placeholder="Search champions"
            value={query}
            onValueChange={setQuery}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) onSelect(results[0].id);
            }}
          />
        </div>
      </div>

      {results.length === 0 ? (
        <p className={styles.empty}>No champion matches "{query}".</p>
      ) : (
        <ul className={styles.grid}>
          {results.map((c) => (
            <li key={c.id}>
              <button type="button" className={styles.card} onClick={() => onSelect(c.id)}>
                <img className={styles.icon} src={championIconUrl(version, c.key)} alt="" loading="lazy" />
                <span className={styles.name}>{c.name}</span>
                {hasBuild(c.id) && <span className={styles.ready}>Build ready</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
