import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { page } from "vitest/browser";

import { defineLinkSurface, LinkSurface } from "./index";

beforeAll(() => {
  defineLinkSurface();
});

beforeEach(() => {
  document.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("primary-link discovery", () => {
  test("enhances only a surface with exactly one designated anchor", () => {
    const valid = mount();
    expect(valid.primaryLink).toBe(valid.querySelector("a"));
    expect(valid).toHaveAttribute("data-link-surface-ready");

    const missing = mount("<p data-inert>Summary</p>");
    expect(missing.primaryLink).toBeUndefined();
    expect(missing).not.toHaveAttribute("data-link-surface-ready");

    const ambiguous = mount(`
      <a data-primary-link href="#one">One</a>
      <a data-primary-link href="#two">Two</a>
      <p data-inert>Summary</p>
    `);
    expect(ambiguous.primaryLink).toBeUndefined();
    expect(ambiguous).not.toHaveAttribute("data-link-surface-ready");
  });

  test("tracks replacement, removal, and relevant attribute changes", async () => {
    const surface = mount("<p data-inert>Summary</p>");
    const link = document.createElement("a");
    link.dataset.primaryLink = "";
    link.href = "#article";
    link.textContent = "Article";
    surface.prepend(link);

    await expect.poll(() => surface.primaryLink).toBe(link);
    expect(surface).toHaveAttribute("data-link-surface-ready");

    link.removeAttribute("href");
    await expect.poll(() => surface.primaryLink).toBeUndefined();
    expect(surface).not.toHaveAttribute("data-link-surface-ready");

    link.href = "#article";
    await expect.poll(() => surface.primaryLink).toBe(link);

    link.remove();
    await expect.poll(() => surface.primaryLink).toBeUndefined();
    expect(surface).not.toHaveAttribute("data-link-surface-ready");
  });

  test("does not adopt the designated link from a nested surface", () => {
    const outer = mount(`
      <p data-inert>Outer content</p>
      <link-surface>
        <a data-primary-link href="#inner">Inner link</a>
        <p>Inner content</p>
      </link-surface>
    `);
    const inner = outer.querySelector("link-surface");

    expect(outer.primaryLink).toBeUndefined();
    expect(inner).toBeInstanceOf(LinkSurface);
    expect(inner).toHaveAttribute("data-link-surface-ready");
  });
});

describe("activation", () => {
  test("activates through a real browser click", async () => {
    const surface = mount();
    const link = requireElement(surface, "a");
    const clicks = trackClicks(link);

    await page.getByText("Article summary", { exact: true }).click();

    expect(clicks.count).toBe(1);
  });

  test("activates the primary anchor once from inert content", () => {
    const surface = mount();
    const link = requireElement(surface, "a");
    const inert = requireElement(surface, "[data-inert]");
    const clicks = trackClicks(link);

    inert.click();

    expect(clicks.count).toBe(1);
  });

  test("leaves direct primary-link activation alone", () => {
    const surface = mount(`<a data-primary-link href="#article"><span>Article</span></a>`);
    const link = requireElement(surface, "a");
    const nested = requireElement(surface, "span");
    const clicks = trackClicks(link);

    nested.click();

    expect(clicks.count).toBe(1);
  });

  test("does not proxy secondary links or their descendants", () => {
    const surface = mount(`
      <a data-primary-link href="#article">Article</a>
      <a href="#author"><span>Author</span></a>
    `);
    const primary = requireElement(surface, "[data-primary-link]");
    const secondary = requireElement(surface, "a:not([data-primary-link])");
    const nested = requireElement(secondary, "span");
    const primaryClicks = trackClicks(primary);
    const secondaryClicks = trackClicks(secondary);

    nested.click();

    expect(primaryClicks.count).toBe(0);
    expect(secondaryClicks.count).toBe(1);
  });

  test.each([
    ["button", "<button type='button'><span data-target>Bookmark</span></button>"],
    ["input", "<input data-target>"],
    ["select", "<select data-target><option>One</option></select>"],
    ["textarea", "<textarea data-target></textarea>"],
    ["label", "<label><span data-target>Label</span></label>"],
    ["summary", "<details><summary><span data-target>More</span></summary></details>"],
    ["audio", "<audio controls data-target></audio>"],
    ["video", "<video controls data-target></video>"],
    ["tabindex", "<span tabindex='-1' data-target>Focusable</span>"],
    ["contenteditable", "<span contenteditable='true' data-target>Edit</span>"],
    ["ignore", "<custom-control data-link-surface-ignore><span data-target>Control</span></custom-control>"],
  ])("does not proxy clicks inside %s content", (_name, markup) => {
    const surface = mount(`
      <a data-primary-link href="#article">Article</a>
      ${markup}
    `);
    const link = requireElement(surface, "a");
    const target = requireElement(surface, "[data-target]");
    const clicks = trackClicks(link);

    target.click();

    expect(clicks.count).toBe(0);
  });

  test("respects cancellation and unsupported mouse gestures", () => {
    const surface = mount();
    const link = requireElement(surface, "a");
    const inert = requireElement(surface, "[data-inert]");
    const clicks = trackClicks(link);

    inert.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    inert.click();
    dispatchClick(inert, { ctrlKey: true });
    dispatchClick(inert, { metaKey: true });
    dispatchClick(inert, { shiftKey: true });
    dispatchClick(inert, { altKey: true });
    dispatchClick(inert, { button: 1 });

    expect(clicks.count).toBe(0);
  });

  test("suppresses the inert source click and bubbles the anchor click", () => {
    const surface = mount();
    const link = requireElement(surface, "a");
    const inert = requireElement(surface, "[data-inert]");
    const bodyTargets: EventTarget[] = [];

    link.addEventListener("click", (event) => event.preventDefault());
    document.body.addEventListener(
      "click",
      (event) => bodyTargets.push(event.target as EventTarget),
      { once: true },
    );

    inert.click();

    expect(bodyTargets).toEqual([link]);
  });

  test("does not accumulate listeners after reconnecting", () => {
    const surface = mount();
    const link = requireElement(surface, "a");
    const inert = requireElement(surface, "[data-inert]");
    const clicks = trackClicks(link);

    surface.remove();
    document.body.append(surface);
    inert.click();

    expect(clicks.count).toBe(1);
  });
});

describe("gesture safeguards", () => {
  test("does not activate after pointer movement or cancellation", () => {
    const surface = mount();
    const link = requireElement(surface, "a");
    const inert = requireElement(surface, "[data-inert]");
    const clicks = trackClicks(link);

    dispatchPointer(inert, "pointerdown", { clientX: 10, clientY: 10 });
    dispatchPointer(inert, "pointermove", { clientX: 30, clientY: 10 });
    dispatchPointer(inert, "pointerup", { clientX: 30, clientY: 10 });
    inert.click();

    dispatchPointer(inert, "pointerdown", { clientX: 10, clientY: 10 });
    dispatchPointer(inert, "pointercancel", { clientX: 10, clientY: 10 });
    inert.click();

    expect(clicks.count).toBe(0);
  });

  test("allows a small amount of pointer tremor", () => {
    const surface = mount();
    const link = requireElement(surface, "a");
    const inert = requireElement(surface, "[data-inert]");
    const clicks = trackClicks(link);

    dispatchPointer(inert, "pointerdown", { clientX: 10, clientY: 10 });
    dispatchPointer(inert, "pointermove", { clientX: 14, clientY: 13 });
    dispatchPointer(inert, "pointerup", { clientX: 14, clientY: 13 });
    inert.click();

    expect(clicks.count).toBe(1);
  });

  test("does not activate while text in the surface is selected", () => {
    const surface = mount();
    const link = requireElement(surface, "a");
    const inert = requireElement(surface, "[data-inert]");
    const text = inert.firstChild;
    const clicks = trackClicks(link);

    if (text === null) throw new Error("Expected inert text");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 4);
    document.getSelection()?.addRange(range);

    inert.click();

    expect(clicks.count).toBe(0);
  });
});

describe("semantics and registration", () => {
  test("does not add a role or another tab stop", () => {
    const surface = mount();
    const link = requireElement(surface, "a");

    expect(surface).not.toHaveAttribute("role");
    expect(surface).not.toHaveAttribute("tabindex");
    expect(surface.tabIndex).toBe(-1);
    expect(link.tabIndex).toBe(0);
  });

  test("registers idempotently and supports custom names", () => {
    const first = defineLinkSurface("test-link-surface");
    const second = defineLinkSurface("test-link-surface");

    expect(second).toBe(first);
    expect(document.createElement("test-link-surface")).toBeInstanceOf(
      LinkSurface,
    );
  });
});

function mount(
  contents = `
    <h2><a data-primary-link href="#article">Article title</a></h2>
    <p data-inert>Article summary</p>
  `,
): LinkSurface {
  const container = document.createElement("div");
  container.innerHTML = `<link-surface>${contents}</link-surface>`;
  const surface = container.firstElementChild;
  if (!(surface instanceof LinkSurface)) {
    throw new Error("Expected a defined link-surface element");
  }

  document.body.append(surface);
  return surface;
}

function requireElement(
  root: ParentNode,
  selector: string,
): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Expected an HTMLElement matching ${selector}`);
  }
  return element;
}

function trackClicks(element: HTMLElement): { readonly count: number } {
  let count = 0;
  element.addEventListener("click", (event) => {
    count += 1;
    event.preventDefault();
  });

  return {
    get count() {
      return count;
    },
  };
}

function dispatchClick(
  target: Element,
  init: MouseEventInit,
): void {
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, ...init }),
  );
}

function dispatchPointer(
  target: Element,
  type: "pointercancel" | "pointerdown" | "pointermove" | "pointerup",
  init: PointerEventInit,
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      isPrimary: true,
      pointerId: 1,
      ...init,
    }),
  );
}
