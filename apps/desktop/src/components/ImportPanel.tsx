import { useEffect, useState } from 'react';
import { Button } from './arc/button/button';
import { Switch } from './arc/switch/switch';
import type { BuildVariant, ChampionBuilds, LcuPerkPage, Swap } from '@hexcards/data';
import { ImportError, importItemSets, importRunes, importSpells } from '@hexcards/engine';
import { PressKey, type KeyLight } from './PressKey';
import { lcuClient } from '../lcu/useLeagueClient';
import { settings } from '../lcu/settings';
import styles from './ImportPanel.module.css';

type Status =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'choose'; candidates: LcuPerkPage[] }
  | { kind: 'done'; lines: string[] }
  | { kind: 'error'; message: string; details: string[] };

interface ImportPanelProps {
  champion: ChampionBuilds;
  variant: BuildVariant;
  activeSwaps: Swap[];
  connected: boolean;
  inChampSelect: boolean;
}

export function ImportPanel({ champion, variant, activeSwaps, connected, inChampSelect }: ImportPanelProps) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [flashOnF, setFlashOnF] = useState(settings.flashKey() === 'F');
  // A result belongs to the build it imported; picking another build clears it.
  useEffect(() => setStatus({ kind: 'idle' }), [variant.id]);

  const run = async (replacePageId?: number) => {
    setStatus({ kind: 'running' });
    try {
      const runes = await importRunes(lcuClient, variant, { savedPageId: settings.runePageId(), replacePageId });
      if (runes.kind === 'choose') {
        setStatus({ kind: 'choose', candidates: runes.candidates });
        return;
      }
      settings.setRunePageId(runes.pageId);
      const lines = [`Rune page set to ${variant.label}`];

      await importItemSets(lcuClient, champion, (v) => (v.id === variant.id ? activeSwaps : []));
      lines.push(`Item sets saved for ${champion.variants.map((v) => v.label).join(' and ')}`);

      if (inChampSelect) {
        await importSpells(lcuClient, variant.spells, flashOnF ? 'F' : 'D');
        lines.push(`Summoner spells set, Flash on ${flashOnF ? 'F' : 'D'}`);
      } else {
        lines.push('Spells are set during champ select');
      }
      setStatus({ kind: 'done', lines });
    } catch (err) {
      const e = err as Error;
      setStatus({ kind: 'error', message: e.message ?? String(err), details: err instanceof ImportError ? err.details : [] });
    }
  };

  const disabledReason = !connected ? 'Open League to import.' : null;
  const light: KeyLight = !connected ? 'off'
    : status.kind === 'running' ? 'busy'
    : status.kind === 'done' ? 'done'
    : status.kind === 'error' ? 'error'
    : 'ready';

  return (
    <section className={styles.panel} aria-labelledby="import-heading">
      <div className={styles.row}>
        <div>
          <h2 id="import-heading" className={styles.title}>Send to League</h2>
          <p className={styles.note}>{disabledReason ?? `Runes, item sets and spells for ${variant.label}.`}</p>
        </div>
        <div className={styles.actions}>
          <Switch
            label="Flash on F"
            checked={flashOnF}
            onCheckedChange={(on) => {
              setFlashOnF(on);
              settings.setFlashKey(on ? 'F' : 'D');
            }}
          />
          <PressKey light={light} disabled={!connected || status.kind === 'running'} onPress={() => void run()}>
            {status.kind === 'running' ? 'Importing' : status.kind === 'done' ? 'Imported' : 'Import'}
          </PressKey>
        </div>
      </div>

      {status.kind === 'done' && (
        <ul className={styles.result} data-tone="success">
          {status.lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}

      {status.kind === 'error' && (
        <div className={styles.result} data-tone="danger" role="alert">
          <p>{status.message}</p>
          {status.details.length > 0 && <ul>{status.details.map((d) => <li key={d}>{d}</li>)}</ul>}
        </div>
      )}

      {status.kind === 'choose' && (
        <div className={styles.result} data-tone="warning">
          <p>You're at your rune page limit. Pick a page for Hex Cards to replace. Your other pages won't change.</p>
          <div className={styles.choices}>
            {status.candidates.map((page) => (
              <Button key={page.id} variant="secondary" size="sm" onClick={() => void run(page.id)}>
                Replace {page.name}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setStatus({ kind: 'idle' })}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
