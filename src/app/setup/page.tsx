import Link from "next/link";
import { redirect } from "next/navigation";
import { householdSetupService } from "@/app/setup-data";
import { SetupForm } from "@/components/setup/setup-form";

export const dynamic = "force-dynamic";
export default async function SetupPage() {
  let state;
  try { state = await householdSetupService().getState(); }
  catch {
    return <section className="entry-panel" role="alert"><h1>Setup unavailable</h1>
      <p>We could not check household setup. Please retry when the database is available.</p><Link href="/setup" prefetch={false}>Retry setup</Link></section>;
  }
  if (state.status === "configured") redirect("/");
  if (state.status === "inconsistent") return <section className="entry-panel" role="alert">
    <h1>Household configuration needs attention</h1><p>Multiple households exist. Equinox supports one household in this personal app.
      Reconcile the database with your administrator before continuing. No household has been selected or changed.</p>
    <Link href="/setup" prefetch={false}>Check again</Link></section>;
  return <><section className="page-heading entry-heading"><p className="eyebrow">Welcome to Equinox</p>
    <h1>Set up your household</h1><p className="introduction">Create the one household for this app and its initial owners.
      Investments and their financial records come next. Currency is USD.</p></section><SetupForm /></>;
}
