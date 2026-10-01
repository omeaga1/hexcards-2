import { useEffect, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { Button } from './arc/button/button';
import styles from './UpdateBanner.module.css';

type State =
  | { kind: 'none' }
  | { kind: 'available'; update: Update }
  | { kind: 'installing'; update: Update; percent: number | null }
  | { kind: 'error'; message: string };

/**
 * Checks GitHub Releases once at launch. Updates are signed; the updater refuses anything not signed
 * with the project's key. Nothing downloads until you click.
 */
export function UpdateBanner() {
  const [state, setState] = useState<State>({ kind: 'none' });

  useEffect(() => {
    // Dev builds run from the dev server and aren't installed, so there's nothing to update.
    if (!isTauri() || import.meta.env.DEV) return;
    let cancelled = false;
    check()
      .then((update) => !cancelled && update && setState({ kind: 'available', update }))
      .catch(() => {
        // Offline or GitHub unreachable: try again next launch.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'none') return null;

  const install = async (update: Update) => {
    let total = 0;
    let done = 0;
    setState({ kind: 'installing', update, percent: null });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        if (event.event === 'Progress') {
          done += event.data.chunkLength;
          setState({ kind: 'installing', update, percent: total ? Math.round((done / total) * 100) : null });
        }
      });
      await relaunch();
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message ?? String(err) });
    }
  };

  return (
    <div className={styles.banner} role="status">
      {state.kind === 'error' ? (
        <p>Couldn't install the update. It'll be offered again next time you open Hex Cards. ({state.message})</p>
      ) : (
        <>
          <p>
            Hex Cards {state.update.version} is available.
            {state.kind === 'installing' && state.percent !== null && ` Downloading ${state.percent}%.`}
          </p>
          <Button size="sm" variant="primary" loading={state.kind === 'installing'} onClick={() => void install(state.update)}>
            Update and restart
          </Button>
        </>
      )}
    </div>
  );
}
