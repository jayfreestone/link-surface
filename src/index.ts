const PRIMARY_LINK_SELECTOR = "a[data-primary-link][href]";

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "audio[controls]",
  "video[controls]",
  "iframe",
  "object",
  "embed",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]",
  "[data-link-surface-ignore]",
].join(",");

// Importing the package must be safe in server-rendered module graphs. The
// class only becomes a real HTMLElement in a browser, where it can connect.
const BaseElement = (
  typeof HTMLElement === "undefined" ? class {} : HTMLElement
) as typeof HTMLElement;

export const linkSurfaceTagName = "link-surface" as const;

/**
 * Progressively expands a real anchor's plain-click target across otherwise
 * inert content. The anchor stays the only semantic and keyboard-operable
 * link; the element proxies eligible pointer clicks to it via `click()`.
 *
 * Style a ready surface with `link-surface:has(a[data-primary-link][href])`
 * (see `styles.css`); no attribute is reflected.
 *
 * @customElement link-surface
 * @slot - Arbitrary card content containing an `a[data-primary-link][href]` descendant (light DOM).
 */
export class LinkSurface extends BaseElement {
  connectedCallback(): void {
    this.addEventListener("click", this.#handleClick);
  }

  disconnectedCallback(): void {
    this.removeEventListener("click", this.#handleClick);
  }

  /**
   * The first valid `a[data-primary-link][href]` descendant owned by this
   * surface, or `undefined` when the surface is not ready.
   */
  get primaryLink(): HTMLAnchorElement | undefined {
    return this.#resolvePrimaryLink();
  }

  #handleClick = (event: MouseEvent): void => {
    const primaryLink = this.#resolvePrimaryLink();
    if (primaryLink === undefined || event.defaultPrevented) return;

    if (!isPlainPrimaryButtonClick(event)) return;

    // Read the composed path rather than event.target. When a click originates
    // inside a child's open shadow-root it is retargeted, so event.target would
    // report the shadow host instead.
    const path = event.composedPath();
    if (path.includes(primaryLink)) return;
    if (pathContainsInteractiveContent(path, this)) return;
    if (selectionBelongsTo(this)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    primaryLink.click();
  };

  #resolvePrimaryLink(): HTMLAnchorElement | undefined {
    for (const link of this.querySelectorAll<HTMLAnchorElement>(
      PRIMARY_LINK_SELECTOR,
    )) {
      if (link.closest(linkSurfaceTagName) === this) return link;
    }

    return undefined;
  }
}

/**
 * Registers `LinkSurface` as `<link-surface>`. Safe to call repeatedly and in
 * non-browser environments, where it does nothing.
 */
export function defineLinkSurface(): void {
  if (typeof customElements === "undefined") return;
  if (customElements.get(linkSurfaceTagName) !== undefined) return;

  customElements.define(linkSurfaceTagName, LinkSurface);
}

function isPlainPrimaryButtonClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

// Walks the composed path (see #handleClick) rather than testing the click
// target alone. This matters for two reasons: the click lands on the deepest
// node — often a non-interactive leaf (an icon inside a button) whose
// interactive ancestor we still need to see — and the path may cross open
// shadow boundaries where event.target has been retargeted away from the real
// control. The walk stops at the surface so only controls *between* the click
// and the surface count; anything the surface itself is nested inside is
// ignored.
function pathContainsInteractiveContent(
  path: EventTarget[],
  surface: LinkSurface,
): boolean {
  for (const target of path) {
    if (target === surface) return false;
    if (target instanceof Element && target.matches(INTERACTIVE_SELECTOR)) {
      return true;
    }
  }

  return false;
}

function selectionBelongsTo(surface: LinkSurface): boolean {
  const selection = surface.ownerDocument.getSelection();
  if (selection === null || selection.isCollapsed) return false;

  return (
    (selection.anchorNode !== null && surface.contains(selection.anchorNode)) ||
    (selection.focusNode !== null && surface.contains(selection.focusNode))
  );
}

declare global {
  interface HTMLElementTagNameMap {
    "link-surface": LinkSurface;
  }
}
