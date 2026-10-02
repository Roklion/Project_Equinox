"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Share the browser-local calendar used by valuation entry with server reads. */
export function ChartReportingDate({ serverDate, resolvePath, range }: { serverDate?: string; resolvePath?: "/" | "/updates"; range?: string }) {
  const router = useRouter();
  useEffect(() => {
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (localDate !== serverDate) {
      document.cookie = `equinox-chart-date=${localDate}; Path=/; SameSite=Lax`;
      if (!resolvePath) router.refresh();
    }
    if (resolvePath) {
      const params = new URLSearchParams({ date: localDate });
      if (range) params.set("range", range);
      router.replace(resolvePath + "?" + params, { scroll: false });
    }
  }, [router, serverDate, resolvePath, range]);
  return null;
}
