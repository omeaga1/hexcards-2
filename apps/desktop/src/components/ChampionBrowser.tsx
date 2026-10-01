import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchField } from './arc/search-field/search-field';
import SegmentedControl from './arc/segmented-control/segmented-control';
import { Switch } from './arc/switch/switch';
import {
  ROLES, ROLE_LABELS, championIconUrl, championRoles, championSplashUrl, championTileUrl, roleIconUrl, rolePickRate, roleStats, rolesSample,
  type ChampionInfo, type Role,
} from '@hexcards/data';
import { buildTierList } from '@hexcards/engine';
import { settings } from '../lcu/settings';
import { TierList } from './TierList';
import styles from './ChampionBrowser.module.css';

/** "Kha'Zix", "Nunu & Willump", "Renata Glasc" all match loose typing like "khazix" or "nunu". */
const normalize = (s: string) => s.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
const percent = (share: number) => `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;

export interface FeaturedChampion {
  champion: ChampionInfo;
  /** e.g. "Top", the role the build is for. */
  role: string;
  variantLabels: string[];
}

interface ChampionBrowserProps {
  version: string;
  champions: ChampionInfo[];
  featured: FeaturedChampion[];
  recent: ChampionInfo[];
  hasBuild: (championId: number) => boolean;
  onSelect: (championId: number) => void;
}

type RoleFilter = Role | 'all';

export function ChampionBrowser({ version, champions, featured, recent, hasBuild, onSelect }: ChampionBrowserProps) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');
  const [view, setView] = useState<'tiers' | 'grid'>('tiers');
  const [showRoleIcons, setShowRoleIcons] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  // Saved preferences are read after mount: storage isn't available during the first render everywhere.
  useEffect(() => {
    setView(settings.roleView());
    setShowRoleIcons(settings.showRoleIcons());
  }, []);

  const byId = useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  // Only champions tagged for the role (the same set the grid shows), so one-off off-role games
  // don't land in the tier list.
  const tierList = useMemo(
    () => (role === 'all' ? null : buildTierList(roleStats(role).filter((s) => championRoles(s.championId).some((r) => r.role === role)))),
    [role],
  );
  const showTiers = role !== 'all' && view === 'tiers' && !query;

  const sorted = useMemo(() => [...champions].sort((a, b) => a.name.localeCompare(b.name)), [champions]);
  const playsRole = (c: ChampionInfo, r: Role) => championRoles(c.id).some((x) => x.role === r);
  const roleCounts = useMemo(() => Object.fromEntries(ROLES.map((r) => [r, sorted.filter((c) => playsRole(c, r)).length])), [sorted]);

  const matches = useMemo(() => {
    const q = normalize(query);
    // In a role, most picked first. Otherwise alphabetical.
    const pool = role === 'all' ? sorted : sorted.filter((c) => playsRole(c, role)).sort((a, b) => rolePickRate(b.id, role) - rolePickRate(a.id, role));
    if (!q) return pool;
    const starts = pool.filter((c) => normalize(c.name).startsWith(q) || normalize(c.key).startsWith(q));
    const contains = pool.filter((c) => !starts.includes(c) && normalize(c.name).includes(q));
    return [...starts, ...contains];
  }, [query, role, sorted]);

  // With no search or role filter, group by each champion's main role.
  const sections = useMemo(() => {
    if (query || role !== 'all') return null;
    const byRole = ROLES.map((r) => ({ role: r as Role | null, champions: sorted.filter((c) => championRoles(c.id)[0]?.role === r) }));
    const unseen = sorted.filter((c) => championRoles(c.id).length === 0);
    return [...byRole, ...(unseen.length ? [{ role: null, champions: unseen }] : [])];
  }, [query, role, sorted]);

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

  const tile = (c: ChampionInfo, pickRole?: Role) => (
    <li key={c.id}>
      <button type="button" className={styles.tile} data-no-build={!hasBuild(c.id) || undefined} onClick={() => onSelect(c.id)}>
        <span className={styles.art}>
          <img src={championTileUrl(c.key)} alt="" loading="lazy" draggable={false} />
        </span>
        <span className={styles.tileName}>{c.name}</span>
        <span className={styles.tileMeta}>
          {showRoleIcons && championRoles(c.id).map((r, i) => (
            <img
              key={r.role}
              className={styles.roleIcon}
              data-main={i === 0 || undefined}
              data-active={r.role === role || undefined}
              src={roleIconUrl(r.role)}
              alt={ROLE_LABELS[r.role]}
              title={`${ROLE_LABELS[r.role]}: ${Math.round(r.share * 100)}% of its games`}
            />
          ))}
          {pickRole && <span className={styles.pickRate}>{percent(rolePickRate(c.id, pickRole))} picked</span>}
        </span>
      </button>
    </li>
  );

  return (
    <div className={styles.layout}>
      <aside className={styles.rail}>
        <SearchField
          ref={searchRef}
          label="Search champions"
          placeholder="Search champions"
          value={query}
          onValueChange={setQuery}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) onSelect(matches[0].id);
          }}
        />

        <nav className={styles.roleNav} aria-label="Filter by role">
          {(['all', ...ROLES] as RoleFilter[]).map((r) => (
            <button key={r} type="button" className={styles.roleButton} aria-pressed={role === r} onClick={() => setRole(r)}>
              {r === 'all' ? <span className={styles.roleAll} aria-hidden /> : <img src={roleIconUrl(r)} alt="" />}
              <span>{r === 'all' ? 'All champions' : ROLE_LABELS[r]}</span>
              <span className={styles.count}>{r === 'all' ? sorted.length : roleCounts[r]}</span>
            </button>
          ))}
        </nav>

        {recent.length > 0 && (
          <div className={styles.recent}>
            <span className={styles.railTitle}>Recently viewed</span>
            <div className={styles.recentRow}>
              {recent.map((c) => (
                <button key={c.id} type="button" className={styles.recentButton} onClick={() => onSelect(c.id)} title={c.name}>
                  <img src={championIconUrl(version, c.key)} alt={c.name} />
                </button>
              ))}
            </div>
          </div>
        )}

        <Switch
          label="Role icons on champions"
          checked={showRoleIcons}
          onCheckedChange={(on) => {
            setShowRoleIcons(on);
            settings.setShowRoleIcons(on);
          }}
        />

        <p className={styles.caption}>
          Roles from {rolesSample.games.toLocaleString()} Challenger and Grandmaster games on patch {rolesSample.patch}.
        </p>
      </aside>

      <div className={styles.content}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>{role === 'all' ? 'Champions' : ROLE_LABELS[role]}</h1>
            <p className={styles.subtitle}>
              {query
                ? `${matches.length} ${matches.length === 1 ? 'match' : 'matches'} for "${query}"`
                : role === 'all'
                  ? 'Grouped by main role'
                  : showTiers
                    ? 'Ranked by win rate, adjusted for how many games each champion has. Top 10% are S tier.'
                    : 'Most picked first'}
            </p>
          </div>
          {role !== 'all' && !query && (
            <SegmentedControl
              label="View"
              value={view}
              onValueChange={(v) => {
                const next = v === 'grid' ? 'grid' : 'tiers';
                setView(next);
                settings.setRoleView(next);
              }}
              options={[{ value: 'tiers', label: 'Tier list' }, { value: 'grid', label: 'Most picked' }]}
            />
          )}
        </header>

        {sections && featured.length > 0 && (
          <section className={styles.featured} aria-labelledby="ready-heading">
            <h2 id="ready-heading" className={styles.sectionTitle}>Most played this patch</h2>
            <div className={styles.featuredRow}>
              {featured.map((f) => (
                <button key={f.champion.id} type="button" className={styles.feature} onClick={() => onSelect(f.champion.id)}>
                  <img className={styles.splash} src={championSplashUrl(f.champion.key)} alt="" draggable={false} />
                  <span className={styles.featureText}>
                    <span className={styles.featureName}>{f.champion.name}</span>
                    <span className={styles.featureMeta}>
                      {f.role} · {f.variantLabels.length} {f.variantLabels.length === 1 ? 'build' : 'builds'}: {f.variantLabels.join(', ')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {showTiers && tierList ? (
          <TierList role={role as Role} list={tierList} champions={byId} hasBuild={hasBuild} onSelect={onSelect} />
        ) : sections ? (
          sections.map((s) => (
            <section key={s.role ?? 'unseen'} className={styles.section} aria-labelledby={`role-${s.role ?? 'unseen'}`}>
              <h2 id={`role-${s.role ?? 'unseen'}`} className={styles.sectionTitle}>
                {s.role && <img src={roleIconUrl(s.role)} alt="" />}
                {s.role ? ROLE_LABELS[s.role] : 'Not seen this patch'}
                <span className={styles.count}>{s.champions.length}</span>
              </h2>
              <ul className={styles.grid}>{s.champions.map((c) => tile(c))}</ul>
            </section>
          ))
        ) : matches.length === 0 ? (
          <p className={styles.empty}>
            No {role === 'all' ? '' : `${ROLE_LABELS[role]} `}champion matches "{query}".
          </p>
        ) : (
          <ul className={styles.grid}>{matches.map((c) => tile(c, role === 'all' ? undefined : role))}</ul>
        )}
      </div>
    </div>
  );
}
