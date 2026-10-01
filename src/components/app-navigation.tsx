"use client";

import { usePathname } from "next/navigation";
import { NavigationLinks } from "./navigation-links";

export function AppNavigation() {
  const pathname = usePathname();
  return pathname === "/login" ? null : <NavigationLinks pathname={pathname} />;
}
