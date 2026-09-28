"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import type { InvestmentOption, StoredMark } from "@/application/ports";
import { formatCents, netValue, parseSignedCents } from "@/domain/financial";

type Mark = StoredMark & { netValue: string };
type InvestmentRow = InvestmentOption & { existing: Mark | null; previous: Mark | null; latest: Mark | null };
type RowInput = { grossValue: string; debt: string; operation: "create" | "replace" };
const blank: RowInput = { grossValue: "", debt: "", operation: "create" };
const subscribe = () => () => {};
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function money(value: string) {
  const negative = value.startsWith("-");
  const [whole, fraction] = value.replace("-", "").split(".");
  return `${negative ? "−" : ""}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction ?? "00"}`;
}

export function BatchForm() {
  const browserDate = useSyncExternalStore(subscribe, today, () => "");
  const [date, setDate] = useState<string | null>(null);
  const selectedDate = date ?? browserDate;
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [inputs, setInputs] = useState<Record<string, RowInput>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!selectedDate) return;
    const controller = new AbortController();
    fetch(`/api/valuations/batch?date=${encodeURIComponent(selectedDate)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.formError);
        return body as { investments: InvestmentRow[] };
      })
      .then((body) => { if (!controller.signal.aborted) { setInvestments(body.investments); setMessage(""); } })
      .catch(() => { if (!controller.signal.aborted) setMessage("Unable to load valuation context. Try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedDate, refresh]);

  function update(id: string, change: Partial<RowInput>) {
    setInputs((current) => ({ ...current, [id]: { ...(current[id] ?? blank), ...change } }));
    setErrors((current) => { const next = { ...current }; delete next[id]; return next; });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || saving) return;
    const rows = investments.flatMap((investment) => {
      const input = inputs[investment.id] ?? blank;
      return input.grossValue.trim() || input.debt.trim()
        ? [{ investmentId: investment.id, ...input }] : [];
    });
    if (rows.length === 0) { setMessage("Enter at least one gross value to save."); return; }
    const nextErrors: Record<string, string> = {};
    rows.forEach((row) => {
      if (!row.grossValue.trim()) nextErrors[row.investmentId] = "Enter a gross value for this row.";
      else if (investments.find((item) => item.id === row.investmentId)?.existing && row.operation !== "replace") {
        nextErrors[row.investmentId] = "Choose correction explicitly for the existing mark.";
      }
    });
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); setMessage("Review the highlighted rows."); return; }
    setSaving(true); setMessage(""); setErrors({});
    try {
      const response = await fetch("/api/valuations/batch", { method: "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ date: selectedDate, rows }) });
      const body = await response.json();
      if (!response.ok) {
        setErrors(body.rowErrors ?? {});
        setMessage(body.formError ?? "Review the highlighted rows. No marks were saved.");
      } else {
        setInputs({}); setMessage(`${rows.length} valuation ${rows.length === 1 ? "mark" : "marks"} saved for ${selectedDate}.`);
        setLoading(true); setRefresh((value) => value + 1);
      }
    } catch { setMessage("Unable to save marks. Your entries remain here."); }
    finally { setSaving(false); }
  }

  return <form className="batch-form" onSubmit={submit}>
    <div className="entry-field batch-date"><label htmlFor="batch-date">Shared as-of date</label>
      <input id="batch-date" type="date" value={selectedDate} required onChange={(event) => {
        if (Object.values(inputs).some((input) => input.grossValue || input.debt) &&
          !window.confirm("Changing the date clears entered marks. Continue?")) return;
        setDate(event.target.value); setInputs({}); setErrors({}); setInvestments([]); setLoading(true); setMessage("");
      }} /></div>
    <p className="entry-muted">Active investments appear in a stable order. Blank rows are skipped. All entered rows save together.</p>
    {loading && <p role="status">Loading investments and marks…</p>}
    {!loading && investments.length === 0 && <p className="entry-muted">No active investments are available for this date.</p>}
    <div className="batch-list">{investments.map((investment) => {
      const input = inputs[investment.id] ?? blank;
      let net: string | null = null;
      let delta: string | null = null;
      try {
        if (input.grossValue.trim()) {
          net = netValue(input.grossValue.trim(), input.debt.trim() || (input.operation === "replace" ? investment.existing?.debt : null) || "0");
          if (investment.previous) delta = formatCents(parseSignedCents(net) - parseSignedCents(investment.previous.netValue));
        }
      } catch { /* Field validation appears on save. */ }
      const prior = investment.previous ?? investment.latest;
      return <section className="batch-row" key={investment.id} aria-labelledby={`name-${investment.id}`}>
        <div className="batch-row-heading"><div><h2 id={`name-${investment.id}`}>{investment.name}</h2>
          <p>{[investment.institution, investment.assetClass, investment.accountType].filter(Boolean).join(" · ") || "Investment"}</p></div>
          {investment.existing && <span className="batch-existing">Mark exists on {selectedDate}</span>}</div>
        {prior && <p className="batch-prior">{investment.previous ? "Previous" : "Latest"} net value {money(prior.netValue)} · {prior.asOfDate}</p>}
        {investment.existing && <p className="batch-prior">Current mark: gross {money(investment.existing.grossValue)}, debt {money(investment.existing.debt)}, net {money(investment.existing.netValue)}</p>}
        <div className="batch-fields"><div className="entry-field"><label htmlFor={`gross-${investment.id}`}>Gross value</label>
          <input id={`gross-${investment.id}`} type="text" inputMode="decimal" placeholder="0.00" value={input.grossValue}
            aria-invalid={Boolean(errors[investment.id])} onChange={(event) => update(investment.id, { grossValue: event.target.value })} /></div>
          <div className="entry-field"><label htmlFor={`debt-${investment.id}`}>Linked debt</label>
            <input id={`debt-${investment.id}`} type="text" inputMode="decimal" placeholder={investment.existing ? `Keep ${investment.existing.debt}` : "0.00"}
              value={input.debt} onChange={(event) => update(investment.id, { debt: event.target.value })} /></div>
          {investment.existing && <div className="entry-field"><label htmlFor={`operation-${investment.id}`}>Save as</label>
            <select id={`operation-${investment.id}`} value={input.operation} onChange={(event) => update(investment.id,
              { operation: event.target.value as RowInput["operation"] })}>
              <option value="create">Choose correction</option><option value="replace">Correct existing mark</option>
            </select></div>}</div>
        {net !== null && <p className="batch-net">Entered net value <strong>{money(net)}</strong>{delta !== null &&
          <span> · Change from previous {parseSignedCents(delta) > 0n ? "+" : ""}{money(delta)}</span>}</p>}
        {errors[investment.id] && <p className="field-error" role="alert">{errors[investment.id]}</p>}
      </section>;
    })}</div>
    {message && <p role="status" className={Object.keys(errors).length ? "form-error" : "entry-muted"}>{message}</p>}
    <div className="entry-actions"><button className="primary-button" type="submit" disabled={loading || saving || investments.length === 0}>
      {saving ? "Saving…" : "Save entered marks"}</button><Link href="/add">All actions</Link></div>
  </form>;
}
