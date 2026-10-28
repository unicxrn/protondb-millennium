import { useState } from 'react';

/**
 * Settings controls drawn by this plugin rather than taken from Steam.
 *
 * Millennium's SDK finds Steam's own ToggleField, DropdownItem and ButtonItem
 * by string-matching Steam's minified render functions, against markers its
 * source dates to October 2024. When a marker stops matching the lookup yields
 * nothing and React renders a broken control. That is what the settings panel
 * was doing: a toggle that showed as a grey block instead of a switch.
 *
 * These are plain elements with explicit styles, so they cannot break when
 * Steam reshuffles its bundles. They follow Steam's palette so they still look
 * at home.
 */

/**
 * Applied to every <button> here. Steam styles bare buttons globally, and a
 * settings control that inherits a store button's font and chrome looks
 * out of place; `appearance: none` and an explicit font settle both.
 */
const RESET = {
	appearance: 'none' as const,
	font: 'inherit',
	fontFamily: '"Motiva Sans", Arial, sans-serif',
	margin: 0,
	border: 'none',
};

const STEAM = {
	text: '#c6d4df',
	muted: '#8f98a0',
	track: '#3d4450',
	on: '#5ba32b',
	accent: '#4c6b8a',
	accentHover: '#5d7fa3',
	line: 'rgba(255,255,255,0.08)',
};

export interface SwitchProps {
	checked: boolean;
	onChange: (value: boolean) => void;
	label: string;
}

/** A sliding on/off switch. */
export function Switch({ checked, onChange, label }: SwitchProps): any {
	const [focused, setFocused] = useState(false);

	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			onClick={() => onChange(!checked)}
			onFocus={() => setFocused(true)}
			onBlur={() => setFocused(false)}
			style={{
				...RESET,
				position: 'relative',
				width: '40px',
				height: '22px',
				flexShrink: 0,
				padding: 0,
				borderRadius: '11px',
				cursor: 'pointer',
				background: checked ? STEAM.on : STEAM.track,
				transition: 'background 140ms ease',
				outline: focused ? `2px solid ${STEAM.accentHover}` : 'none',
				outlineOffset: '2px',
			}}
		>
			<span
				style={{
					position: 'absolute',
					top: '3px',
					left: checked ? '21px' : '3px',
					width: '16px',
					height: '16px',
					borderRadius: '50%',
					background: '#ffffff',
					transition: 'left 140ms ease',
					boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
				}}
			/>
		</button>
	);
}

export interface SegmentedProps<T extends string> {
	value: T;
	options: Array<{ value: T; label: string }>;
	onChange: (value: T) => void;
	label: string;
}

/** A small segmented picker, for settings with three or four choices. */
export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>): any {
	return (
		<div
			role="radiogroup"
			aria-label={label}
			style={{
				display: 'flex',
				flexShrink: 0,
				border: `1px solid ${STEAM.line}`,
				borderRadius: '3px',
				overflow: 'hidden',
			}}
		>
			{options.map(option => {
				const selected = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={selected}
						onClick={() => onChange(option.value)}
						style={{
							...RESET,
							padding: '5px 12px',
							fontSize: '12px',
							cursor: 'pointer',
							background: selected ? STEAM.accent : 'transparent',
							color: selected ? STEAM.text : STEAM.muted,
							transition: 'background 120ms ease',
						}}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}

export interface ActionButtonProps {
	onClick: () => void;
	disabled?: boolean;
	children: any;
}

/** A plain action button in Steam's accent colour. */
export function ActionButton({ onClick, disabled, children }: ActionButtonProps): any {
	const [hover, setHover] = useState(false);

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				...RESET,
				flexShrink: 0,
				borderRadius: '2px',
				padding: '6px 14px',
				fontSize: '12px',
				fontWeight: 'bold',
				cursor: disabled ? 'default' : 'pointer',
				opacity: disabled ? 0.5 : 1,
				color: STEAM.text,
				background: hover && !disabled ? STEAM.accentHover : STEAM.accent,
				transition: 'background 120ms ease',
			}}
		>
			{children}
		</button>
	);
}

export interface SettingRowProps {
	label: string;
	description: string;
	control: any;
	last?: boolean;
}

/**
 * One settings row: text on the left, control on the right.
 *
 * Steam's own Field is avoided here too. It takes its control through props
 * this plugin would have to guess at, and the same stale-lookup risk applies.
 */
export function SettingRow({ label, description, control, last }: SettingRowProps): any {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				gap: '20px',
				padding: '12px 0',
				borderBottom: last ? 'none' : `1px solid ${STEAM.line}`,
			}}
		>
			<div style={{ minWidth: 0 }}>
				<div style={{ fontSize: '14px', color: STEAM.text }}>{label}</div>
				<div style={{ fontSize: '12px', color: STEAM.muted, marginTop: '3px', maxWidth: '52ch' }}>
					{description}
				</div>
			</div>
			{control}
		</div>
	);
}
