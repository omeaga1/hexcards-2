import { invoke, isTauri } from '@tauri-apps/api/core';
import type { OpggCall } from './players';

/**
 * Sends one OP.GG lookup. The desktop app sends it from Rust (opgg_call), since OP.GG doesn't allow
 * browser requests; the dev server forwards /opgg to it so the browser preview works too.
 */
export const opggCall: OpggCall = async (tool, args) => {
  if (isTauri()) return invoke<string>('opgg_call', { tool, arguments: args });
  if (!import.meta.env.DEV) throw new Error('Player lookups need the Hex Cards desktop app.');
  const res = await fetch('/opgg/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: { ...args, client_app: 'HexCards/dev' } } }),
  });
  const body = (await res.json()) as { error?: { message: string }; result?: { isError?: boolean; content?: { text: string }[] } };
  if (body.error) throw new Error(body.error.message);
  const text = body.result?.content?.[0]?.text;
  if (!text || body.result?.isError) throw new Error(text ?? 'OP.GG sent an empty answer.');
  return text;
};
