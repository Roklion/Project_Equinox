"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SurfaceState } from "./primitives";

/** Resolve today's financial calendar in the browser before requesting analytics. */
export function LocalReportingDate({ pathname, range }: { pathname: "/" | "/updates"; range?: string }) {
  const router = useRouter();
  useEffect(() => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const params = new URLSearchParams({ date });
    if (range) params.set("range", range);
    router.replace(pathname + "?" + params, { scroll: false });
  }, [pathname, range, router]);
  return <SurfaceState kind="loading" title="Loading your investment context">Using your local calendar date.</SurfaceState>;
}
