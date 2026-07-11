import { describe, expect, test } from "vitest";

import { defineLinkSurface, LinkSurface } from "./index";

describe("server imports", () => {
  test("evaluate without browser globals", () => {
    expect(globalThis.HTMLElement).toBeUndefined();
    expect(LinkSurface).toBeTypeOf("function");
    expect(defineLinkSurface()).toBeUndefined();
  });
});
