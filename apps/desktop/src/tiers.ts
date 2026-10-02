import type { Role, RoleTable } from '@hexcards/data';
import { buildTierList, type TierList } from '@hexcards/engine';

/**
 * One role's tier list in a bracket. Only champions tagged for the role (the same set the browser
 * shows), so one-off off-role games don't land in it. The browser and champion page share this, so
 * a champion's tier reads the same in both.
 */
export function roleTierList(roles: RoleTable, role: Role): TierList {
  return buildTierList(roles.roleStats(role).filter((s) => roles.championRoles(s.championId).some((r) => r.role === role)));
}
