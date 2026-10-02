"use client";

import { usePathname } from "next/navigation";
import { NavigationLinks } from "./navigation-links";

export function AppNavigation() {
  const pathname = usePathname();
  if (pathname === "/setup") return <form action="/api/auth/logout" method="post" className="shell-signout">
    <button className="text-button" type="submit">Sign out</button>
  </form>;
  return pathname === "/login" ? null : <NavigationLinks pathname={pathname} />;
}
