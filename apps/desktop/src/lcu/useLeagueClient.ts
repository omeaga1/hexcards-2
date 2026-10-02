import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { LcuClient } from '@hexcards/engine';

/** The parts of `/lol-champ-select/v1/session` Hex Cards reads. */
export interface ChampSelectSession {
  localPlayerCellId: number;
  myTeam: { cellId: number; championId: number; championPickIntent: number; assignedPosition: string }[];
  theirTeam: { cellId: number; championId: number }[];
  /** Champions banned so far, as the client shows them. */
  bans?: { myTeamBans: number[]; theirTeamBans: number[] };
}

export interface LeagueClientState {
  /** False in a plain browser, where there's no League client to reach. */
  available: boolean;
  connected: boolean;
  message: string;
  phase: string | null;
  session: ChampSelectSession | null;
  /** Champions you can play right now (owned, free this week or rented), once the client has said. */
  owned: Set<number> | null;
}

/** The parts of `/lol-champions/v1/owned-champions-minimal` Hex Cards reads. */
interface OwnedChampion {
  id: number;
  freeToPlay?: boolean;
  ownership?: { owned?: boolean; rental?: { rented?: boolean } };
}

/** Talks to the Rust core, which forwards an allowlist of League client requests. */
export const lcuClient: LcuClient = {
  request: (method, path, body) => invoke('lcu_request', { method, path, body: body ?? null }),
};

interface LcuEvent {
  uri: string;
  eventType: 'Create' | 'Update' | 'Delete';
  data: unknown;
}

export function useLeagueClient(): LeagueClientState {
  const available = isTauri();
  const [state, setState] = useState<LeagueClientState>({
    available,
    connected: false,
    message: available ? 'Waiting for the League client' : 'Browser preview: open the desktop app to connect',
    phase: null,
    session: null,
    owned: null,
  });

  // Which champions you can play, read once each champ select, so suggestions stick to them.
  const inChampSelect = !!state.session;
  useEffect(() => {
    if (!available || !state.connected || !inChampSelect) return;
    let cancelled = false;
    lcuClient
      .request<OwnedChampion[]>('GET', '/lol-champions/v1/owned-champions-minimal')
      .then((res) => {
        if (cancelled || res.status !== 200 || !Array.isArray(res.body)) return;
        const owned = new Set(res.body.filter((c) => c.ownership?.owned || c.freeToPlay || c.ownership?.rental?.rented).map((c) => c.id));
        setState((s) => ({ ...s, owned }));
      })
      .catch(() => {
        // Without it, suggestions just include champions you might not own.
      });
    return () => {
      cancelled = true;
    };
  }, [available, state.connected, inChampSelect]);

  // Development only: ?demo=champ-select fakes a champ select (lcu/demo.ts). Release builds drop it.
  useEffect(() => {
    if (!import.meta.env.DEV || available) return;
    let cancelled = false;
    void import('./demo').then(({ demoSession }) => {
      const demo = demoSession();
      if (demo && !cancelled) setState((s) => ({ ...s, message: 'Demo champ select', phase: 'ChampSelect', session: demo }));
    });
    return () => {
      cancelled = true;
    };
  }, [available]);

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    const update = (patch: Partial<LeagueClientState>) => !cancelled && setState((s) => ({ ...s, ...patch }));

    // Catch up on state the event stream won't repeat, e.g. already being in champ select.
    const loadCurrent = async () => {
      const phase = await lcuClient.request<string>('GET', '/lol-gameflow/v1/gameflow-phase').catch(() => null);
      const session = await lcuClient.request<ChampSelectSession>('GET', '/lol-champ-select/v1/session').catch(() => null);
      update({
        phase: phase && phase.status === 200 ? phase.body : null,
        session: session && session.status === 200 ? session.body : null,
      });
    };

    const unlisteners = [
      listen<{ connected: boolean; message: string }>('lcu-status', ({ payload }) => {
        update({ connected: payload.connected, message: payload.message, ...(payload.connected ? {} : { phase: null, session: null }) });
        if (payload.connected) void loadCurrent();
      }),
      listen<LcuEvent>('lcu-event', ({ payload }) => {
        if (payload.uri === '/lol-gameflow/v1/gameflow-phase') update({ phase: payload.data as string });
        if (payload.uri === '/lol-champ-select/v1/session') {
          update({ session: payload.eventType === 'Delete' ? null : (payload.data as ChampSelectSession) });
        }
      }),
    ];

    invoke<boolean>('lcu_status').then((connected) => {
      if (!connected) return;
      update({ connected: true, message: 'Connected to the League client' });
      void loadCurrent();
    });

    return () => {
      cancelled = true;
      unlisteners.forEach((p) => p.then((unlisten) => unlisten()));
    };
  }, [available]);

  return state;
}
