export interface TierStyle {
	color: string;
	label: string;
	description: string;
	icon: string;
}

export const TIER_CONFIG: Record<string, TierStyle> = {
	platinum: { color: '#b4c7dc', label: 'Platinum', description: 'Works perfectly out of the box',     icon: '✦'  },
	gold:     { color: '#cfb53b', label: 'Gold',     description: 'Works great with only minor issues', icon: '★'  },
	silver:   { color: '#a8a9ad', label: 'Silver',   description: 'Works with workarounds',             icon: '●'  },
	bronze:   { color: '#cd7f32', label: 'Bronze',   description: 'Runs but with significant issues',   icon: '◆'  },
	borked:   { color: '#ff4444', label: 'Borked',   description: 'Does not run under Proton',          icon: '✕'  },
	native:   { color: '#4caf50', label: 'Native',   description: 'Has a native Linux build',           icon: '🐧' },
	// ProtonDB's own tier for a game too new or too quiet to rate. Listed here
	// so it reads as a real state rather than falling through to the unknown
	// style, which showed it in the raw, lowercase, beside Title Case tiers.
	pending:  { color: '#8f98a0', label: 'Pending',  description: 'Not enough reports yet',             icon: '…'  },
};

export const CONFIDENCE_COLORS: Record<string, string> = {
	high: '#4caf50', medium: '#cfb53b', low: '#ff4444',
};

export interface AnticheatStyle {
	color: string;
	label: string;
	/** True when this status means the game's protected modes will not run. */
	blocking: boolean;
}

export const ANTICHEAT_CONFIG: Record<string, AnticheatStyle> = {
	supported: { color: '#4caf50', label: 'Supported', blocking: false },
	running:   { color: '#cfb53b', label: 'Running',   blocking: false },
	planned:   { color: '#8f98a0', label: 'Planned',   blocking: false },
	broken:    { color: '#ff4444', label: 'Broken',    blocking: true  },
	denied:    { color: '#ff4444', label: 'Denied',    blocking: true  },
};

const UNKNOWN_TIER: TierStyle = { color: '#888888', label: 'Unknown', description: '', icon: '?' };
const UNKNOWN_ANTICHEAT: AnticheatStyle = { color: '#888888', label: 'Unknown', blocking: false };

export function tierCfg(tier: string | undefined): TierStyle {
	if (!tier) return UNKNOWN_TIER;
	return TIER_CONFIG[tier.toLowerCase()] ?? { ...UNKNOWN_TIER, label: tier };
}

export function anticheatCfg(status: string | undefined): AnticheatStyle {
	if (!status) return UNKNOWN_ANTICHEAT;
	return ANTICHEAT_CONFIG[status.toLowerCase()] ?? { ...UNKNOWN_ANTICHEAT, label: status };
}
