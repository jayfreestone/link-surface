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
  test("uses the first owned designated anchor in document order", () => {
    const valid = mount();
    expect(valid.primaryLink).toBe(valid.querySelector("a"));

    const missing = mount("<p data-inert>Summary</p>");
    expect(missing.primaryLink).toBeUndefined();

    const duplicated = mount(`
      <a data-primary-link href="#one">One</a>
      <a data-primary-link href="#two">Two</a>
      <p data-inert>Summary</p>
    `);
    expect(duplicated.primaryLink).toBe(duplicated.querySelector("a"));
  });

  test("resolves the primary link live as the DOM changes", () => {
    const surface = mount("<p data-inert>Summary</p>");
    const link = document.createElement("a");
    link.dataset.primaryLink = "";
    link.href = "#article";
    link.textContent = "Article";
    surface.prepend(link);
    expect(surface.primaryLink).toBe(link);

    link.removeAttribute("href");
    expect(surface.primaryLink).toBeUndefined();

    link.href = "#article";
    expect(surface.primaryLink).toBe(link);

    link.remove();
    expect(surface.primaryLink).toBeUndefined();
  });

  test("does not adopt the designated link from a nested surface", () => {
    const outer = mount(`
      <p data-inert>Outer content</p>
      <link-surface>
        <a data-primary-link href="#inner">Inner link</a>
        <p>Inner content</p>
      </link-surface>
    `);
    const inner = outer.querySelector<LinkSurface>("link-surface");

    expect(outer.primaryLink).toBeUndefined();
    expect(inner).toBeInstanceOf(LinkSurface);
    expect(inner?.primaryLink).toBe(inner?.querySelector("a"));
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

  test("does not proxy interactive content inside an open shadow root", () => {
    // The click retargets to the shadow host (a plain <div>) as the surface's
    // listener sees it, so event.target alone would miss the nested <button>.
    // composedPath() keeps the button in view and suppression must still apply.
    const surface = mount(`<a data-primary-link href="#article">Article</a>`);
    const link = requireElement(surface, "a");
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<button type="button"><span data-target>Save</span></button>`;
    surface.append(host);
    const target = requireElement(root, "[data-target]");
    const clicks = trackClicks(link);

    target.click();

    expect(clicks.count).toBe(0);
  });

  test("proxies inert content inside an open shadow root", () => {
    const surface = mount(`<a data-primary-link href="#article">Article</a>`);
    const link = requireElement(surface, "a");
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<span data-target>Summary</span>`;
    surface.append(host);
    const target = requireElement(root, "[data-target]");
    const clicks = trackClicks(link);

    target.click();

    expect(clicks.count).toBe(1);
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

describe("selection safeguard", () => {
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

  test("registers idempotently", () => {
    expect(() => {
      defineLinkSurface();
      defineLinkSurface();
    }).not.toThrow();
    expect(document.createElement("link-surface")).toBeInstanceOf(LinkSurface);
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
