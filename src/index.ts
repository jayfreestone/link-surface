const PRIMARY_LINK_SELECTOR = "a[data-primary-link][href]";
const READY_ATTRIBUTE = "data-link-surface-ready";
const POINTER_MOVEMENT_TOLERANCE = 8;

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

interface PointerGesture {
  cancelled: boolean;
  moved: boolean;
  pointerId: number;
  selectionAtStart: boolean;
  startX: number;
  startY: number;
}

// Importing the package must be safe in server-rendered module graphs. The
// class only becomes a real HTMLElement in a browser, where it can connect.
const BaseElement = (
  typeof HTMLElement === "undefined" ? class {} : HTMLElement
) as typeof HTMLElement;

export const linkSurfaceTagName = "link-surface" as const;

export class LinkSurface extends BaseElement {
  #connected = false;
  #mutationObserver?: MutationObserver;
  #pointerGesture?: PointerGesture;
  #primaryLink?: HTMLAnchorElement;

  connectedCallback(): void {
    if (this.#connected) return;

    this.#connected = true;
    this.addEventListener("click", this.#handleClick);
    this.addEventListener("pointercancel", this.#handlePointerCancel);
    this.addEventListener("pointerdown", this.#handlePointerDown);
    this.addEventListener("pointermove", this.#handlePointerMove);
    this.addEventListener("pointerup", this.#handlePointerUp);

    this.#mutationObserver = new MutationObserver(() => {
      this.#syncPrimaryLink();
    });
    this.#mutationObserver.observe(this, {
      attributeFilter: ["data-primary-link", "href"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    this.#syncPrimaryLink();
  }

  disconnectedCallback(): void {
    if (!this.#connected) return;

    this.#connected = false;
    this.removeEventListener("click", this.#handleClick);
    this.removeEventListener("pointercancel", this.#handlePointerCancel);
    this.removeEventListener("pointerdown", this.#handlePointerDown);
    this.removeEventListener("pointermove", this.#handlePointerMove);
    this.removeEventListener("pointerup", this.#handlePointerUp);
    this.#mutationObserver?.disconnect();
    this.#mutationObserver = undefined;
    this.#pointerGesture = undefined;
    this.#primaryLink = undefined;
    this.removeAttribute(READY_ATTRIBUTE);
  }

  get primaryLink(): HTMLAnchorElement | undefined {
    return this.#primaryLink;
  }

  #handleClick = (event: MouseEvent): void => {
    const gesture = this.#pointerGesture;
    this.#pointerGesture = undefined;
    this.#syncPrimaryLink();

    const primaryLink = this.#primaryLink;
    if (primaryLink === undefined || event.defaultPrevented) return;
    if (
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }

    const path = event.composedPath();
    if (path.includes(primaryLink)) return;
    if (pathContainsInteractiveContent(path, this)) return;
    if (gesture?.cancelled || gesture?.moved || gesture?.selectionAtStart) {
      return;
    }
    if (selectionBelongsTo(this)) return;

    // Suppress the inert source click. The meaningful generated anchor click
    // is allowed to bubble normally, so routers and analytics see it once.
    event.preventDefault();
    event.stopImmediatePropagation();
    primaryLink.click();
  };

  #handlePointerCancel = (event: PointerEvent): void => {
    if (this.#pointerGesture?.pointerId === event.pointerId) {
      this.#pointerGesture.cancelled = true;
    }
  };

  #handlePointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0) {
      this.#pointerGesture = undefined;
      return;
    }

    this.#pointerGesture = {
      cancelled: false,
      moved: false,
      pointerId: event.pointerId,
      selectionAtStart: selectionBelongsTo(this),
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  #handlePointerMove = (event: PointerEvent): void => {
    this.#updatePointerMovement(event);
  };

  #handlePointerUp = (event: PointerEvent): void => {
    this.#updatePointerMovement(event);
  };

  #syncPrimaryLink(): void {
    const primaryLinks = Array.from(
      this.querySelectorAll<HTMLAnchorElement>(PRIMARY_LINK_SELECTOR),
    ).filter((link) => belongsToSurface(link, this));

    this.#primaryLink =
      primaryLinks.length === 1 ? primaryLinks[0] : undefined;
    this.toggleAttribute(READY_ATTRIBUTE, this.#primaryLink !== undefined);
  }

  #updatePointerMovement(event: PointerEvent): void {
    const gesture = this.#pointerGesture;
    if (gesture === undefined || gesture.pointerId !== event.pointerId) return;

    const distance = Math.hypot(
      event.clientX - gesture.startX,
      event.clientY - gesture.startY,
    );
    if (distance > POINTER_MOVEMENT_TOLERANCE) {
      gesture.moved = true;
    }
  }
}

export function defineLinkSurface(
  name: string = linkSurfaceTagName,
  registry: CustomElementRegistry | undefined =
    typeof customElements === "undefined" ? undefined : customElements,
): CustomElementConstructor | undefined {
  if (registry === undefined) return undefined;

  const existing = registry.get(name);
  if (existing !== undefined) return existing;

  // A registry cannot use the same constructor for two names. A fresh subclass
  // supports aliases while preserving `instanceof LinkSurface`.
  class RegisteredLinkSurface extends LinkSurface {}

  registry.define(name, RegisteredLinkSurface);
  return RegisteredLinkSurface;
}

function belongsToSurface(link: HTMLAnchorElement, surface: LinkSurface): boolean {
  let ancestor = link.parentElement;

  while (ancestor !== null && ancestor !== surface) {
    if (ancestor instanceof LinkSurface) return false;
    ancestor = ancestor.parentElement;
  }

  return ancestor === surface;
}

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
