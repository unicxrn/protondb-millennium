import { anticheatCfg } from './vocabulary';

const HIGH_TIERS = new Set(['platinum', 'gold']);

/**
 * True when a reassuring ProtonDB tier hides a blocked anticheat.
 *
 * ProtonDB tiers skew toward singleplayer reports, so a game can sit at Gold
 * while its protected multiplayer modes cannot launch at all. Lower tiers
 * already warn the user, so the caveat would add nothing there.
 */
export function hasAnticheatConflict(tier: string | undefined, status: string | undefined): boolean {
	if (!tier || !status) return false;
	return HIGH_TIERS.has(tier.toLowerCase()) && anticheatCfg(status).blocking;
}
