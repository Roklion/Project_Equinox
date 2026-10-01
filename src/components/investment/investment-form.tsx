"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { InvestmentChoices, InvestmentMetadata } from "@/application/ports";

const dimensions = [
  ["assetClassId", "Asset class", "assetClasses"], ["accountTypeId", "Account type", "accountTypes"],
  ["taxStatusId", "Tax status", "taxStatuses"], ["liquidityId", "Liquidity", "liquidities"],
  ["institutionId", "Institution", "institutions"],
] as const;
type Values = { name: string; ownerIds: string[]; groupIds: string[] } & Partial<Record<typeof dimensions[number][0], string | null>>;

export function InvestmentForm({ investmentId }: { investmentId?: string }) {
  const [choices, setChoices] = useState<InvestmentChoices | null>(null);
  const [investment, setInvestment] = useState<InvestmentMetadata | null>(null);
  const [values, setValues] = useState<Values>({ name: "", ownerIds: [], groupIds: [] });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [saved, setSaved] = useState<{ id: string; operation: string } | null>(null);
  const [closedOn, setClosedOn] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/investments${investmentId ? `?investmentId=${encodeURIComponent(investmentId)}` : ""}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(data.formError || "Unable to load investment choices.");
        setChoices(data.choices);
        if (data.investment) { setInvestment(data.investment); setValues(data.investment); }
      }).catch((error) => { if (!cancelled) setFormError(error.message || "Unable to load investment choices."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [investmentId, retry]);

  async function save(operation: "create" | "edit" | "close") {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setFieldErrors({}); setFormError(""); setSaved(null);
    try {
      const response = await fetch("/api/investments", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, operation, investmentId, closedOn, confirmed }) });
      const data = await response.json();
      if (!response.ok) { setFieldErrors(data.fieldErrors ?? {}); setFormError(data.formError ?? ""); return; }
      setSaved({ id: data.id, operation });
      if (operation === "close") { setInvestment((current) => current && { ...current, status: "closed", closedOn }); setConfirming(false); }
    } catch { setFormError("Unable to save this investment. Your entered values are still here; please try again."); }
    finally { submitting.current = false; setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void save(investmentId ? "edit" : "create"); }
  const error = (field: string) => fieldErrors[field] && <span className="field-error" id={`${field}-error`} role="alert">{fieldErrors[field]}</span>;
  const accessibility = (field: string) => ({ "aria-invalid": !!fieldErrors[field], "aria-describedby": fieldErrors[field] ? `${field}-error` : undefined });
  function toggle(field: "ownerIds" | "groupIds", id: string) {
    setValues((current) => ({ ...current, [field]: current[field].includes(id) ? current[field].filter((value) => value !== id) : [...current[field], id] }));
  }
  if (loading) return <p role="status">Loading investment choices…</p>;
  if (!choices) return <div role="alert"><p>{formError}</p><button className="primary-button" onClick={() => {
    setLoading(true); setFormError(""); setRetry((value) => value + 1);
  }}>Try again</button></div>;
  if (saved?.operation === "create") return <section className="entry-panel entry-success" role="status"><h2>Investment created</h2>
    <p>No contribution or valuation was created. Add those separately when ready.</p><div className="entry-actions">
      <Link className="primary-button" href={`/investments/${saved.id}`}>View investment</Link><Link href="/investments">Investments</Link>
    </div></section>;
  return <div className="investment-management">
    {saved && <p role="status">{saved.operation === "close" ? "Investment closed. History is preserved." : "Investment updated. Financial history is unchanged."}</p>}
    {formError && <p className="form-error" role="alert">{formError}</p>}
    {investment?.status === "closed" && <p className="correction-notice">Closed on {investment.closedOn}. Historical actions and valuations remain available. Reopening is not supported.</p>}
    <form className="entry-panel entry-form" onSubmit={submit} noValidate>
      <fieldset className="investment-fields" disabled={busy}>
        <div className="entry-field"><label htmlFor="investment-name">Display name</label>
          <input id="investment-name" maxLength={200} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} {...accessibility("name")} />{error("name")}</div>
        <fieldset className="investment-options" {...accessibility("ownerIds")}><legend>Owners</legend>
          <p className="field-help">Choose one or more owners. Joint ownership does not assign percentages.</p>
          {choices.owners.length === 0 && <p>Add owner records to the household before creating an investment.</p>}
          {choices.owners.map((choice) => <label key={choice.id}><input type="checkbox" checked={values.ownerIds.includes(choice.id)} onChange={() => toggle("ownerIds", choice.id)} />{choice.label}</label>)}{error("ownerIds")}
        </fieldset>
        <div className="investment-classifications">{dimensions.map(([field, label, lookup]) => <div className="entry-field" key={field}>
          <label htmlFor={field}>{label}</label><select id={field} value={values[field] ?? ""} {...accessibility(field)} onChange={(event) => setValues({ ...values, [field]: event.target.value || null })}>
            <option value="">Not classified</option>{choices[lookup].map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
          </select>{error(field)}</div>)}</div>
        <fieldset className="investment-options" {...accessibility("groupIds")}><legend>Custom groups (optional)</legend>
          {choices.customGroups.length === 0 && <p className="field-help">No custom groups are configured.</p>}
          {choices.customGroups.map((choice) => <label key={choice.id}><input type="checkbox" checked={values.groupIds.includes(choice.id)} onChange={() => toggle("groupIds", choice.id)} />{choice.label}</label>)}{error("groupIds")}
        </fieldset>
      </fieldset>
      <p className="entry-hint">Metadata changes preserve investment identity and do not create cash flows or valuation marks.</p>
      <div className="entry-actions"><button className="primary-button" disabled={busy || choices.owners.length === 0}>{busy ? "Saving…" : investmentId ? "Save investment" : "Create investment"}</button>
        <Link href={investmentId ? `/investments/${investmentId}` : "/investments"}>Cancel</Link></div>
    </form>
    {investment?.status === "active" && <section className="entry-panel"><h2>Close investment</h2>
      <p>Closing preserves all historical actions and valuation marks. Ordinary activity after the close date stops. Reopening is not supported.</p>
      {!confirming ? <button className="text-button" disabled={busy} onClick={() => { setConfirming(true); setSaved(null); }}>Close investment</button>
        : <form className="entry-form" noValidate onSubmit={(event) => { event.preventDefault(); void save("close"); }}>
          <div className="entry-field"><label htmlFor="closedOn">Close date</label><input type="date" id="closedOn" disabled={busy} value={closedOn} onChange={(event) => setClosedOn(event.target.value)} {...accessibility("closedOn")} />{error("closedOn")}</div>
          <div className="investment-options"><label><input type="checkbox" disabled={busy} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} {...accessibility("confirmed")} />I confirm closure and understand that history is preserved.</label>{error("confirmed")}</div>
          <div className="entry-actions"><button className="primary-button" disabled={busy}>{busy ? "Closing…" : "Confirm close"}</button>
            <button type="button" className="text-button" disabled={busy} onClick={() => { setConfirming(false); setConfirmed(false); }}>Cancel close</button></div>
        </form>}
    </section>}
  </div>;
}
