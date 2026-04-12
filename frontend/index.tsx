import { IconsModule, definePlugin, Field } from '@steambrew/client';

const SettingsContent = () => {
	return (
		<>
			<Field
				label="ProtonDB Ratings"
				description="Shows ProtonDB compatibility tiers (Platinum / Gold / Silver / Bronze / Borked / Native) as a badge on Steam store pages. Click the badge to open the full ProtonDB page for that game."
				icon={<IconsModule.Settings />}
				bottomSeparator="standard"
				focusable={false}
			/>
			<Field
				label="Tiers"
				description="Platinum - works perfectly. Gold - works great. Silver - runs with workarounds. Bronze - runs but has significant issues. Borked - does not run. Native - has a Linux build."
				bottomSeparator="none"
				focusable={false}
			/>
		</>
	);
};

export default definePlugin(() => {
	return {
		title: 'ProtonDB',
		icon: <IconsModule.Settings />,
		content: <SettingsContent />,
	};
});
