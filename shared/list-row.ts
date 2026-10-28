/** The attributes and link a list row might identify its game with. */
export interface RowIdentity {
	/** `data-ds-appid`, on search results and capsules. */
	dsAppId?: string | null;
	/** `data-app-id`, used by wishlist rows. */
	appId?: string | null;
	/** `data-ds-itemkey`, e.g. `App_620`. Absent on some surfaces. */
	itemKey?: string | null;
	/** The row's own link, used only when no attribute identifies it. */
	href?: string | null;
}

/**
 * Decides whether a store list row can carry a tier badge.
 *
 * Only single-app rows qualify: a bundle or package has no one ProtonDB tier,
 * and Steam marks those with a different `data-ds-itemkey` prefix. A
 * comma-separated appid means the row covers several games, which has no
 * single answer either.
 *
 * Several attribute shapes are accepted because Steam does not use one across
 * its list surfaces: search results carry `data-ds-appid` and wishlist rows
 * carry `data-app-id`. The link is a last resort for rows that carry neither.
 */
/**
 * Item-key shapes that mean "this row is a single app".
 *
 * Steam uses two. Store pages and search results write `App_620`; the search
 * box's autocomplete writes `0_620`, where the prefix is the store item type
 * and 0 is an app. Every other shape (`Sub_`, `Bundle_`, and whatever number
 * those map to in the second form) is a package covering several games, which
 * no single tier can describe.
 *
 * Unrecognised shapes are rejected rather than assumed to be apps: a missing
 * badge is invisible, a wrong one is a lie.
 */
const APP_ITEM_KEY = /^(?:App_|0_)\d+$/;

export function resolveRowAppId(identity: RowIdentity): string | null {
	const { itemKey } = identity;
	// A bundle or package row is disqualified however it identifies itself.
	if (itemKey && !APP_ITEM_KEY.test(itemKey)) return null;

	for (const candidate of [identity.dsAppId, identity.appId]) {
		if (!candidate) continue;
		if (candidate.includes(',')) return null;
		// Steam puts data-ds-appid="0" on front-page promo banners that link to
		// a sale rather than a game. Zero is not an appid, and treating it as
		// one spends a fetch to learn that nothing is there.
		//
		// `continue`, not `return`: zero means the attribute states no app,
		// which is the same situation as the attribute being absent, so the
		// remaining candidates and the link still get their turn. A comma
		// below is different. That row covers several games and no single
		// tier can describe it, so it is disqualified outright.
		if (/^0+$/.test(candidate)) continue;
		if (/^\d+$/.test(candidate)) return candidate;
	}

	if (identity.href) {
		const match = identity.href.match(/\/app\/(\d+)(?:[/?#]|$)/);
		if (match) return match[1];
	}

	return null;
}

/**
 * The original two-attribute form, kept because it reads clearly at the call
 * sites that only ever see those two.
 */
export function appIdFromRowData(appId: string | null, itemKey: string | null): string | null {
	return resolveRowAppId({ dsAppId: appId, itemKey });
}

/**
 * Groups rows by appId, preserving every row for a repeated id rather than
 * keeping only the last one. The same game can appear in two carousels (or
 * a carousel and a search result) on a single page. A plain
 * `new Map(rows.map(r => [r.appId, r.row]))` silently drops every row but
 * the last for that id, leaving the dropped ones permanently undecorated
 * once their budget is spent. Generic over the row type so this stays free
 * of any DOM dependency and is unit-testable on its own.
 */
export function groupRowsByAppId<T>(rows: Array<{ row: T; appId: string }>): Map<string, T[]> {
	const out = new Map<string, T[]>();
	for (const { row, appId } of rows) {
		const existing = out.get(appId);
		if (existing) existing.push(row);
		else out.set(appId, [row]);
	}
	return out;
}
