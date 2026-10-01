import Link from "next/link";

const destinations = [
  { href: "/", label: "Overview" },
  { href: "/investments", label: "Investments" },
  { href: "/updates", label: "Update Center" },
  { href: "/add", label: "Add entry" },
] as const;

export function NavigationLinks({ pathname }: { pathname: string }) {
  return <div className="shell-controls">
    <nav className="primary-navigation" aria-label="Primary">
      {destinations.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/"
          : href === "/updates" ? pathname === href || pathname.startsWith("/valuations/")
            : pathname === href || pathname.startsWith(href + "/");
        return <Link key={href} href={href} aria-current={active ? "page" : undefined}
          className={href === "/add" ? "navigation-add" : undefined}>{label}</Link>;
      })}
    </nav>
    <form action="/api/auth/logout" method="post" className="shell-signout">
      <button className="text-button" type="submit">Sign out</button>
    </form>
  </div>;
}
