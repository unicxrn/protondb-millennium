/**
 * Types for the virtual `millennium` module.
 *
 * Starlight resolves `millennium` itself at compile time, and `starlight lsp`
 * would normally generate its types from a `types.zip` that this Millennium
 * install does not ship, which leaves the module untyped and every import an
 * `any`.
 *
 * The module is Millennium's TypeScript SDK (`src/typescript/sdk`), which is
 * also what the deprecated `@steambrew/client` package was built from, so that
 * package's type definitions describe the same surface. It is kept as a
 * dev dependency for exactly this reason: types only, never imported at
 * runtime, which starlight rejects outright.
 *
 * If a future Millennium ships `types.zip`, delete this file and let
 * `starlight lsp` generate `.millennium/lsp/ts` instead.
 */
declare module 'millennium' {
	export * from '@steambrew/client';
}
