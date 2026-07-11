# link-surface

`link-surface` progressively expands a real anchor's plain-click target across otherwise inert content.

It is a small, framework-neutral custom element. The anchor remains the only semantic and keyboard-operable link, and continues to own its `href`, accessible name, router behavior, `target`, `download`, and `rel`.

**[Live demo](https://jayfreestone.github.io/link-surface/)**

Run the demo locally with `npm run dev` for live reload. Use `npm run site` to
build the package and compile the deployable demo into `_site`; `npm run serve`
builds and previews that production output.

## Install

```sh
npm install link-surface
```

## Use

Register the element once in browser code:

```js
import { defineLinkSurface } from "link-surface";
import "link-surface/styles.css";

defineLinkSurface();
```

Or use the side-effecting registration entry:

```js
import "link-surface/auto";
import "link-surface/styles.css";
```

### Without a bundler

A single self-contained file registers the element with no imports. Drop it in
with a plain `<script>` tag — it defines `<link-surface>` on load and exposes the
API on `window.linkSurface`:

```html
<link rel="stylesheet" href="https://unpkg.com/link-surface/styles.css">
<script src="https://unpkg.com/link-surface"></script>
```

Then provide a real descendant anchor marked with `data-primary-link`:

```html
<ul>
  <li>
    <link-surface>
      <h2>
        <a data-primary-link href="/articles/card-design-woes">
          Card design woes
        </a>
      </h2>

      <p>Ten common pitfalls to avoid when designing card components.</p>

      <small>
        By <a href="/authors/heydon">Heydon Pickering</a>
      </small>

      <button type="button">Bookmark</button>
    </link-surface>
  </li>
</ul>
```

Before JavaScript loads, the anchor works normally. Once the component is registered, it proxies eligible clicks on inert content to `anchor.click()` whenever the surface contains a valid `a[data-primary-link][href]`. If a surface contains several, the first one it owns in document order is used.

The component does not add a role or `tabindex`, clone the link, use Shadow DOM, or navigate to a URL itself.

## Nested interaction

Clicks on the primary anchor, secondary anchors, and common interactive content are left alone. This includes buttons, form controls, labels, summaries, controlled media, embedded content, editable content, and anything with `tabindex`.

No selector can detect every interactive custom element. Mark an arbitrary excluded subtree explicitly:

```html
<map-menu data-link-surface-ignore></map-menu>
```

The component checks the full composed event path, so descendants inside a marked control are excluded too. For a control with a closed shadow root, put `data-link-surface-ignore` on its visible custom-element host.

## Styling

The optional stylesheet only supplies block layout and the ready-state cursor. Card appearance remains application-owned.

The ready state is expressed purely in CSS, so no attribute is reflected and no `MutationObserver` runs. Style a surface that is registered *and* holds a valid primary link with `:defined:has()`:

```css
link-surface:defined:has(a[data-primary-link][href]) {
  cursor: pointer;
}
```

`:defined` keeps the styling off until the element is registered (preserving the pre-enhancement appearance), and `:has()` keeps it off for a surface with no valid primary link. Do not use `:defined` alone as the clickable-state signal — an upgraded element can still be missing a valid primary link.

Note that `:has()` cannot exclude a link belonging to a nested surface, so a nested-only surface can still match the style rule even though it will not proxy clicks (the JS enforces ownership). Pair any hover treatment with a real focus treatment. For example:

```css
link-surface:focus-within {
  outline: 0.2rem solid currentColor;
  outline-offset: 0.2rem;
}
```

## Pointer behavior and limitations

Only an unmodified primary-button click on inert content is proxied. The component declines modified clicks, other mouse buttons, and interactions while text in the surface is selected.

Complete native link behavior remains available on the actual anchor. Inert surface space does not reproduce native context menus, URL dragging, browser status-bar previews, middle-click, or modifier-click behavior.

During a proxy activation, the original inert click is cancelled and stopped at the host. The generated anchor click bubbles normally, allowing a browser or owning router to handle it. Capture-phase observers can still see the original event.

## Frameworks and SSR

Both package entry points are safe to import in a server environment. Explicit registration is tree-shakeable and is the recommended default.

Framework link components must render a genuine anchor carrying `data-primary-link`. The component deliberately calls that anchor's `click()` method instead of owning routing. Framework compatibility should be validated in the consuming application's current router version.

For React TypeScript projects, add the intrinsic element to an application declaration file if your JSX types do not already accept custom elements:

```ts
import type * as React from "react";
import type { LinkSurface } from "link-surface";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "link-surface": React.DetailedHTMLProps<
        React.HTMLAttributes<LinkSurface>,
        LinkSurface
      >;
    }
  }
}
```

## Browser support

The package ships modern ESM and targets current evergreen browsers with Custom Elements, private class fields, Pointer Events, `Event.composedPath()`, and `Selection` support. The optional stylesheet also uses the CSS `:has()` selector. The browser test suite runs against current Playwright Chromium, Firefox, and WebKit.

## Prior art

This component packages and modernizes the redundant-click technique from Heydon Pickering's [Inclusive Cards](https://inclusive-components.design/cards/). It is a pointer convenience, not a complete card component or an accessibility guarantee. Authors remain responsible for semantic list structure, heading hierarchy, descriptive link text, focus appearance, target spacing, alternative text, source order, and content design.

## API

```ts
defineLinkSurface(): void;
```

Registers `LinkSurface` as `<link-surface>`. Calling it repeatedly is safe, and it does nothing outside a browser. `LinkSurface`, `linkSurfaceTagName`, and the DOM `HTMLElementTagNameMap` declaration are also exported.

The package ships a [custom elements manifest](https://github.com/webcomponents/custom-elements-manifest) (`custom-elements.json`) for editor and tooling support.

## License

[0BSD](./LICENSE) — use it however you like, no attribution required.
