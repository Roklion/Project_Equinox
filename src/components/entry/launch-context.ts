import { optionalDate, singleParam, type PageQuery } from "@/components/financial/reporting-context";

/** URL context is a default only; the entry API owns household and lifecycle eligibility. */
export function entryLaunchContext(query: PageQuery) {
  const investmentId = singleParam(query.investmentId) || undefined;
  let date: string | undefined;
  let start: string | undefined;
  try { date = optionalDate(query.date); } catch { /* Use editable browser-local today. */ }
  try { start = optionalDate(query.start); } catch { /* Ignore invalid reporting context. */ }
  const origin = singleParam(query.from);
  const from = origin === "updates" || (origin === "investment" && investmentId) ? origin : undefined;
  const params = new URLSearchParams();
  if (investmentId) params.set("investmentId", investmentId);
  if (date) params.set("date", date);
  if (from) params.set("from", from);
  if (from === "investment" && start && date && start <= date) params.set("start", start);
  const suffix = params.size ? "?" + params.toString() : "";
  // Construct only known internal routes; never accept a client-supplied return URL.
  const detailParams = new URLSearchParams();
  if (date) detailParams.set("date", date);
  if (params.has("start")) detailParams.set("start", params.get("start")!);
  const returnHref = from === "investment"
    ? "/investments/" + encodeURIComponent(investmentId!) + (detailParams.size ? "?" + detailParams : "")
    : undefined;
  return { investmentId, date, suffix, launcherHref: "/add" + suffix, returnHref, returnToUpdates: from === "updates" };
}
