import Link from "next/link";
import { SettingsPanel } from "@/components/settings/settings-panel";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ section?: string; returnTo?: string }> }) {
  const params = await searchParams;
  const section = params.section === "classifications" ? "classifications" : "household";
  const returnTo = params.returnTo && /^\/investments\/(new|[\da-f-]{36}\/manage)$/.test(params.returnTo) ? params.returnTo : null;
  return <><section className="page-heading entry-heading"><p className="eyebrow">Settings</p><h1>{section === "household" ? "Household & owners" : "Classifications"}</h1>
    <p className="introduction">Maintain the names and choices used by your investments.</p></section>
    <nav className="settings-navigation" aria-label="Settings"><Link href={`/settings${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`} aria-current={section === "household" ? "page" : undefined}>Household & owners</Link>
      <Link href={`/settings?section=classifications${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`} aria-current={section === "classifications" ? "page" : undefined}>Classifications</Link></nav>
    {returnTo && <Link className="settings-return" href={returnTo} prefetch={false}>Return to investment form</Link>}
    <SettingsPanel key={section} section={section} /></>;
}
