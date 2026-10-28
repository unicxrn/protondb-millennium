import type * as React from 'react';

/**
 * Re-exposes React's JSX types globally.
 *
 * The frontend compiles JSX with the classic runtime (`jsxFactory` pointing at
 * Steam's own React instance), which resolves intrinsic elements like `<div>`
 * through a global `JSX` namespace. React 19's types moved that namespace into
 * the module, so without this every lowercase tag is an error while component
 * elements still typecheck, so the problem only shows up in files that render
 * plain DOM.
 *
 * Types only; it changes nothing the compiler emits.
 */
declare global {
	namespace JSX {
		interface Element extends React.JSX.Element {}
		interface ElementClass extends React.JSX.ElementClass {}
		interface ElementAttributesProperty extends React.JSX.ElementAttributesProperty {}
		interface ElementChildrenAttribute extends React.JSX.ElementChildrenAttribute {}
		interface IntrinsicAttributes extends React.JSX.IntrinsicAttributes {}
		interface IntrinsicElements extends React.JSX.IntrinsicElements {}
	}
}

export {};
