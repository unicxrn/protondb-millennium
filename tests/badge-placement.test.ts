// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIST_BADGE_CLASS } from '../shared/dom';
import { ENVELOPE_VERSION } from '../shared/types';
import { decorateLists, resetLists } from '../webview/lists';

/**
 * Regression tests for where a tier badge lands, against markup taken from
 * live Steam pages rather than invented.
 *
 * These exist because badge placement silently skipped whole surfaces: the
 * code tried `.search_platforms` then `.title`, and a store front page has
 * neither on any of its 160 carousel rows, so every one of them was identified
 * and then dropped. Nothing failed and nothing logged. The badges simply were
 * not there. A unit test over the real row shapes is the only thing that would
 * have caught it, so each surface Steam is known to use gets one here.
 */

/** Answers every appid with the same tier, so placement is the only variable. */
function stubBackend(): void {
	(globalThis as any).backend = {
		fetch_cached_tiers: vi.fn(async (json: string) => {
			const ids: string[] = JSON.parse(json);
			const tiers: Record<string, { tier: string }> = {};
			for (const id of ids) tiers[id] = { tier: 'gold' };
			return JSON.stringify({ v: ENVELOPE_VERSION, tiers });
		}),
		fetch_app_data: vi.fn(),
		log_frontend: vi.fn(async () => {}),
	};
}

/** happy-dom lets the URL be set, which is what selects the wishlist pass. */
function navigateTo(path: string): void {
	window.history.replaceState({}, '', path);
}

beforeEach(() => {
	navigateTo('/');
	// happy-dom has no IntersectionObserver; the on-demand fetch path is
	// covered by tests/queue.test.ts, so a no-op stub is enough here.
	(globalThis as any).IntersectionObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
	stubBackend();
	document.body.innerHTML = '';
	resetLists();
});

function badgeIn(row: Element): HTMLElement | null {
	return row.querySelector<HTMLElement>(`.${LIST_BADGE_CLASS}`);
}

/** Waits for the debounced mutation-observer rescan to decorate something. */
async function waitForBadge(timeout = 2000): Promise<void> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (badgeIn(document.body)) return;
		await new Promise(resolve => setTimeout(resolve, 25));
	}
}

describe('badge placement across Steam list surfaces', () => {
	it('puts the badge beside the platform icons on a search result', async () => {
		document.body.innerHTML = `
			<a class="search_result_row ds_collapse_flag" href="https://store.steampowered.com/app/620/Portal_2/"
			   data-ds-appid="620" data-ds-itemkey="App_620">
				<div class="search_capsule"><img></div>
				<div class="responsive_search_name_combined">
					<div class="search_name ellipsis"><span class="title">Portal 2</span></div>
					<div class="search_platforms"><span class="platform_img win"></span></div>
				</div>
			</a>`;

		await decorateLists('label');

		const badge = badgeIn(document.body);
		expect(badge).not.toBeNull();
		expect(badge!.parentElement!.className).toBe('search_platforms');
	});

	it('puts the badge on the title of a store front carousel row', async () => {
		// The shape that was being dropped: a tab_row_item has no
		// .search_platforms and no .title anywhere inside it.
		document.body.innerHTML = `
			<a class="tab_row_item" href="https://store.steampowered.com/app/4287040/Vampys_Big_Day/"
			   data-ds-appid="4287040" data-ds-itemkey="App_4287040">
				<div class="tab_item_header capsule_image_ctn"><img></div>
				<div class="tab_item_content">
					<div class="tab_item_col">
						<div class="tab_item_title">Vampy's Big Day</div>
						<div class="tab_item_release_date">Released: 27 Oct, 2026</div>
					</div>
				</div>
			</a>`;

		await decorateLists('label');

		const badge = badgeIn(document.body);
		expect(badge).not.toBeNull();
		expect(badge!.parentElement!.className).toBe('tab_item_title');
	});

	it('puts the badge on the title of a wishlist row', async () => {
		document.body.innerHTML = `
			<div class="wishlist_row" data-app-id="620">
				<div class="capsule"><img></div>
				<div class="title">Portal 2</div>
			</div>`;

		await decorateLists('label');

		const badge = badgeIn(document.body);
		expect(badge).not.toBeNull();
		expect(badge!.parentElement!.className).toBe('title');
	});

	it('overlays the badge on a capsule that carries no text', async () => {
		document.body.innerHTML = `
			<a class="store_capsule" href="https://store.steampowered.com/app/570/Dota_2/"
			   data-ds-appid="570" data-ds-itemkey="App_570"><img></a>`;

		await decorateLists('label');

		const row = document.querySelector('.store_capsule') as HTMLElement;
		const badge = badgeIn(row);
		expect(badge).not.toBeNull();
		// Out of flow, so it cannot disturb the capsule's own layout.
		expect(badge!.parentElement).toBe(row);
		expect(badge!.style.position).toBe('absolute');
		// And anchored to the row rather than escaping to an outer ancestor.
		expect(row.style.position).toBe('relative');
	});

	it('overlays a capsule that shows text but has no text slot', async () => {
		// Steam's sale capsules paint the title and price over the artwork and
		// offer no label element. They also measure nothing until their
		// carousel slide is shown, so placement cannot be decided by size. A row
		// Steam gives an appid and no text slot is a capsule, full stop.
		document.body.innerHTML = `
			<a class="sale_capsule" href="https://store.steampowered.com/app/3218230/ArcheAge/"
			   data-ds-appid="3218230" data-ds-itemkey="App_3218230">
				<div class="bg" style="background-image:url(x.jpg)"></div>
				<div class="cap_title">ArcheAge Chronicles</div>
				<div class="cap_sub">Available now</div>
			</a>`;

		await decorateLists('label');

		const badge = badgeIn(document.body)!;
		expect(badge.style.position).toBe('absolute');
	});

	it('leaves a row Steam already positions alone', async () => {
		document.body.innerHTML = `
			<a class="store_capsule" style="position: absolute"
			   href="https://store.steampowered.com/app/570/" data-ds-appid="570"><img></a>`;

		await decorateLists('label');

		const row = document.querySelector('.store_capsule') as HTMLElement;
		expect(badgeIn(row)).not.toBeNull();
		expect(row.style.position).toBe('absolute');
	});
});

describe('rows that are not games', () => {
	it('skips a nav button whose appid does not belong to what it links to', async () => {
		// Steam's "Customize, Explore by Tag" button carries a real appid but
		// links to /recommender/. It is marked ds_no_flags, like every other
		// element Steam does not decorate itself.
		document.body.innerHTML = `
			<a class="btnv6_white_transparent btn_small ds_no_flags" href="https://store.steampowered.com/recommender/"
			   data-ds-appid="1156220"><span>Customize, Explore by Tag</span></a>
			<a class="search_result_row" href="https://store.steampowered.com/app/620/"
			   data-ds-appid="620" data-ds-itemkey="App_620"><span class="title">Portal 2</span></a>`;

		await decorateLists('label');

		expect(badgeIn(document.querySelector('.btnv6_white_transparent')!)).toBeNull();
		// The real row beside it still gets one, so this is not just a dead scan.
		expect(badgeIn(document.querySelector('.search_result_row')!)).not.toBeNull();
	});

	it('skips a promo banner, which Steam gives appid 0', async () => {
		document.body.innerHTML = `
			<a class="home_page_takeunder ds_no_flags" href="https://store.steampowered.com/sale/nextfest"
			   data-ds-appid="0"></a>`;

		await decorateLists('label');

		expect(badgeIn(document.body)).toBeNull();
	});

	it('does not ask the backend about a banner appid', async () => {
		document.body.innerHTML = `
			<a class="home_page_takeunder ds_no_flags" href="/sale/x" data-ds-appid="0"></a>`;

		await decorateLists('label');

		// No candidate rows at all, so the cache lookup never happens.
		expect((globalThis as any).backend.fetch_cached_tiers).not.toHaveBeenCalled();
	});
});

describe('the off setting', () => {
	it('decorates nothing', async () => {
		document.body.innerHTML = `
			<a class="search_result_row" href="https://store.steampowered.com/app/620/"
			   data-ds-appid="620" data-ds-itemkey="App_620"><span class="title">Portal 2</span></a>`;

		await decorateLists('off');

		expect(badgeIn(document.body)).toBeNull();
		expect((globalThis as any).backend.fetch_cached_tiers).not.toHaveBeenCalled();
	});
});

describe('the search box autocomplete', () => {
	// Markup copied from store.steampowered.com/search/suggest. Note the item
	// key: the dropdown writes `0_<appid>`, not `App_<appid>`, which the row
	// resolver used to reject outright, so every suggestion was discarded and
	// the dropdown never showed a badge.
	const SUGGEST = `
		<a class="match match_app match_category_top ds_collapse_flag"
		   data-ds-appid="3768760" data-ds-itemkey="0_3768760"
		   href="https://store.steampowered.com/app/3768760/007_First_Light">
			<div class="match_name">007 First Light</div>
			<div class="match_img"><img></div>
			<div class="match_subtitle">69,99€</div>
		</a>`;

	it('badges a suggestion despite its different item key', async () => {
		document.body.innerHTML = SUGGEST;

		await decorateLists('label');

		const badge = badgeIn(document.body);
		expect(badge).not.toBeNull();
		expect(badge!.parentElement!.className).toBe('match_name');
	});

	it('picks up a dropdown that only appears after the first scan', async () => {
		// The dropdown has no rows until the user types, so decoration cannot
		// depend on a row existing when the page loads.
		document.body.innerHTML = '';

		await decorateLists('label');
		expect(badgeIn(document.body)).toBeNull();

		document.body.innerHTML = SUGGEST;
		await waitForBadge();

		expect(badgeIn(document.body)).not.toBeNull();
	});
});

describe('the wishlist, which carries no appid attribute', () => {
	// Steam's current wishlist is a single-page app: rows are plain divs with
	// build-hashed class names and no data-ds-appid, data-app-id or item key.
	// The only stable handle is the link to the game's store page.
	const WISHLIST_ROW = `
		<div class="_0uIJq8Pia8Q-">
			<a class="hbW8A859huY-" href="https://store.steampowered.com/app/3768760/007_First_Light/"><img></a>
			<a class="ffvyer-fyXc-" href="https://store.steampowered.com/app/3768760/007_First_Light/">007 First Light</a>
			<div class="ojEsJSejN5U-">Added on 7 Jun 2026</div>
		</div>`;

	it('badges a row identified only by its link', async () => {
		navigateTo('/wishlist/profiles/76561198000000000/');
		document.body.innerHTML = WISHLIST_ROW;

		await decorateLists('label');

		const badge = badgeIn(document.body);
		expect(badge).not.toBeNull();
	});

	it('badges the title link rather than the artwork link', async () => {
		navigateTo('/wishlist/');
		document.body.innerHTML = WISHLIST_ROW;

		await decorateLists('label');

		// Both anchors point at the same game; only the one showing text
		// should carry a badge, and only once.
		expect(document.querySelectorAll(`.${LIST_BADGE_CLASS}`)).toHaveLength(1);
		const badge = badgeIn(document.body)!;
		expect(badge.parentElement!.textContent).toContain('007 First Light');
	});

	it('does not follow links on surfaces that identify rows properly', async () => {
		// An app page links to other games in its sidebar and breadcrumbs;
		// following those would clutter pages that read correctly today.
		navigateTo('/app/620/Portal_2/');
		document.body.innerHTML = `
			<a href="https://store.steampowered.com/app/3768760/007_First_Light/">007 First Light</a>`;

		await decorateLists('label');

		expect(badgeIn(document.body)).toBeNull();
	});
});

describe('the single-page-app search dropdown', () => {
	// Markup read off a live store page. Steam's current search dropdown
	// renders results as anchors with build-hashed class names and no appid
	// attribute of any kind, `dsAppIdCount` on that panel is zero, so the
	// only handle is the link.
	const DROPDOWN = `
		<div class="oZSaGCJH4G4-">
			<div class="results">
				<a class="QHiQcR8jG10- Focusable" tabindex="0"
				   href="https://store.steampowered.com/app/400/Portal?snr=1_7_15__13_1">
					<div class="img"><img></div><div class="name">Portal</div><div class="price">9,69€</div>
				</a>
				<a class="QHiQcR8jG10- Focusable" tabindex="0"
				   href="https://store.steampowered.com/app/620/Portal_2?snr=1_7_15__13_2">
					<div class="img"><img></div><div class="name">Portal 2</div><div class="price">9,69€</div>
				</a>
			</div>
			<a class="JhiIqI-S0Js-" href="https://store.steampowered.com/search/?term=portal">Advanced Search</a>
		</div>`;

	it('badges results that carry no appid attribute', async () => {
		document.body.innerHTML = DROPDOWN;

		await decorateLists('label');

		expect(document.querySelectorAll(`.${LIST_BADGE_CLASS}`)).toHaveLength(2);
	});

	it('skips only the result for the page you are already on', async () => {
		// The dropdown is reachable from a game page. That game already shows
		// the full panel above its buy cards, so its own row is left plain
		// while the others are badged.
		navigateTo('/app/620/Portal_2/');
		document.body.innerHTML = DROPDOWN;

		await decorateLists('label');

		const badges = document.querySelectorAll(`.${LIST_BADGE_CLASS}`);
		expect(badges).toHaveLength(1);
		expect(badges[0].closest('a')!.getAttribute('href')).toContain('/app/400/');
	});

	it('appears after the user types, so it is found by the observer', async () => {
		document.body.innerHTML = '';
		await decorateLists('label');
		expect(badgeIn(document.body)).toBeNull();

		document.body.innerHTML = DROPDOWN;
		await waitForBadge();

		expect(badgeIn(document.body)).not.toBeNull();
	});
});

describe('game links that are not list rows', () => {
	it('leaves links alone when they are far apart in the page', async () => {
		// A game page mentions other games in its description and its
		// announcements, sections of the page that are nowhere near each
		// other in the tree. "Learn More" wearing a compatibility tier is
		// noise, so a link counts as a row only when another game's link is
		// within a few levels of it. The nesting here mirrors how far apart
		// a real page puts these.
		navigateTo('/app/620/Portal_2/');
		document.body.innerHTML = `
			<div class="page">
				<div class="col"><div class="block"><div class="inner">
					<p>See <a href="/app/104600/The_Final_Hours/">Portal 2 - The Final Hours</a>.</p>
				</div></div></div>
				<div class="col"><div class="block"><div class="inner">
					<p><a class="Focusable" href="/app/593110/Steam_Labs/">Learn More</a></p>
				</div></div></div>
			</div>`;

		await decorateLists('label');

		expect(document.querySelectorAll(`.${LIST_BADGE_CLASS}`)).toHaveLength(0);
	});

	it('badges links that sit together as a list', async () => {
		// The same rule seen from the other side: neighbouring links to
		// different games are a list, however the surface is built.
		navigateTo('/category/action/');
		document.body.innerHTML = `
			<div class="rows">
				<div class="r"><a href="/app/620/Portal_2/">Portal 2</a></div>
				<div class="r"><a href="/app/400/Portal/">Portal</a></div>
			</div>`;

		await decorateLists('label');

		expect(document.querySelectorAll(`.${LIST_BADGE_CLASS}`)).toHaveLength(2);
	});

	it('does not add a second badge to a row the attribute pass already owns', async () => {
		navigateTo('/search/?term=portal');
		document.body.innerHTML = `
			<div class="results">
				<a class="search_result_row" href="https://store.steampowered.com/app/620/Portal_2/"
				   data-ds-appid="620" data-ds-itemkey="App_620"><span class="title">Portal 2</span></a>
				<a class="search_result_row" href="https://store.steampowered.com/app/400/Portal/"
				   data-ds-appid="400" data-ds-itemkey="App_400"><span class="title">Portal</span></a>
			</div>`;

		await decorateLists('label');

		// One each, placed by the attribute pass. Not two.
		expect(document.querySelectorAll(`.${LIST_BADGE_CLASS}`)).toHaveLength(2);
		document.querySelectorAll('.search_result_row').forEach(row => {
			expect(row.querySelectorAll(`.${LIST_BADGE_CLASS}`)).toHaveLength(1);
		});
	});
});

describe('the store front offer capsules', () => {
	// Each offer sits in its own carousel slide, so neighbouring games are
	// several levels up rather than beside it. These were being skipped.
	const OFFERS = `
		<div class="carousel">
			<div class="slide"><div class="pad">
				<a class="capsule" href="https://store.steampowered.com/app/867210?snr=1_4_4__40_1">
					<div class="art"><img><div class="ribbon">Midweek Deal</div></div>
					<div class="price"><div>-80%</div><div>29,99€</div><div>5,99€</div></div>
				</a>
			</div></div>
			<div class="slide"><div class="pad">
				<a class="capsule" href="https://store.steampowered.com/app/1496590?snr=1_4_4__40_2">
					<div class="art"><img><div class="ribbon">Today's Deal</div></div>
					<div class="price"><div>-90%</div><div>29,99€</div><div>2,99€</div></div>
				</a>
			</div></div>
		</div>`;

	/** happy-dom does not lay out, so shapes are set to what a live page measures. */
	function shape(selector: string, width: number, height: number): void {
		document.querySelectorAll(selector).forEach(el => {
			(el as HTMLElement).getBoundingClientRect = () => ({ width, height }) as DOMRect;
		});
	}

	it('badges a capsule whose neighbours are several levels up', async () => {
		document.body.innerHTML = OFFERS;
		shape('.capsule', 277, 357);
		shape('.capsule img', 277, 321);

		await decorateLists('label');

		expect(document.querySelectorAll(`.${LIST_BADGE_CLASS}`)).toHaveLength(2);
	});

	it('overlays a tall capsule rather than appending to it', async () => {
		document.body.innerHTML = OFFERS;
		shape('.capsule', 277, 357);
		shape('.capsule img', 277, 321);

		await decorateLists('label');

		// Appending to a tile puts a bar across the bottom of the artwork and
		// makes the card taller; an overlay is out of flow.
		const badge = badgeIn(document.body)!;
		expect(badge.style.position).toBe('absolute');
	});

	it('overlays a wide capsule too, because it is still mostly artwork', async () => {
		// The offer row carries both shapes side by side. Going by
		// orientation put a full-width bar under every wide capsule; what
		// actually distinguishes a tile is how much of it is picture.
		document.body.innerHTML = OFFERS;
		shape('.capsule', 375, 230);
		shape('.capsule img', 375, 160);

		await decorateLists('label');

		const badge = badgeIn(document.body)!;
		expect(badge.style.position).toBe('absolute');
	});

	it('overlays a capsule that has not been laid out yet', async () => {
		// A carousel slide waiting its turn measures zero. Treating that as a
		// text row is what put a bar across some capsules and not others,
		// depending only on which were on screen when the page was scanned.
		document.body.innerHTML = OFFERS;
		shape('.capsule', 0, 0);
		shape('.capsule img', 0, 0);

		await decorateLists('label');

		const badge = badgeIn(document.body)!;
		expect(badge.style.position).toBe('absolute');
	});

	it('appends inline on a row that is mostly text', async () => {
		// A search dropdown row: same width as a wide capsule, but the image
		// is a 56x56 thumbnail, so the badge belongs after the label and an
		// overlay would cover the price.
		document.body.innerHTML = OFFERS;
		shape('.capsule', 346, 56);
		shape('.capsule img', 56, 56);

		await decorateLists('label');

		const badge = badgeIn(document.body)!;
		expect(badge.style.position).toBe('');
	});
});
