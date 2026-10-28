export const PURCHASE_SELECTORS = ['#game_area_purchase', '.game_area_purchase', '.game_area_already_owned'];

export function getAppIdFromUrl(url: string): string | null {
	const match = url.match(/\/app\/(\d+)/);
	return match ? match[1] : null;
}

export function isDlcPage(): boolean {
	return !!document.querySelector('.game_area_dlc_bubble');
}

export function isLinuxNative(): boolean {
	return !!document.querySelector('.platform_img.linux');
}
