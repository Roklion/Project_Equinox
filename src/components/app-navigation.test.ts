import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppNavigation } from "./app-navigation";
import { NavigationLinks } from "./navigation-links";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

describe("application navigation", () => {
  it.each(["/", "/investments", "/investments/example", "/updates", "/valuations/batch", "/add/transfer"])(
    "offers the same concepts and one current destination on %s", (pathname) => {
      const html = renderToStaticMarkup(h(NavigationLinks, { pathname }));
      for (const route of ["/", "/investments", "/updates", "/add"]) expect(html).toContain(`href="${route}"`);
      expect(html.match(/aria-current="page"/g)).toHaveLength(1);
      const activeHref = pathname.startsWith("/investments") ? "/investments"
        : pathname.startsWith("/add") ? "/add" : pathname === "/" ? "/" : "/updates";
      const currentLink = html.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0];
      expect(currentLink).toContain(`href="${activeHref}"`);
      expect(html).toContain('aria-label="Primary"');
      expect(html).toContain('action="/api/auth/logout" method="post"');
    });

  it("keeps product navigation and sign-out off the sign-in screen", () => {
    route.pathname = "/login";
    expect(renderToStaticMarkup(h(AppNavigation))).toBe("");
    route.pathname = "/investments";
    expect(renderToStaticMarkup(h(AppNavigation))).toContain("Sign out");
  });
});
