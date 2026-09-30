"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import type { InvestmentOption, StoredMark } from "@/application/ports";
import { formatCents, netValue, parseSignedCents } from "@/domain/financial";

type Mark = StoredMark & { netValue: string };
type InvestmentRow = InvestmentOption & { existing: Mark | null; previous: Mark | null; latest: Mark | null };
type RowInput = { grossValue: string; debt: string; operation: "create" | "replace" };
type SubmittedRow = RowInput & { investmentId: string };
type RowErrorField = "grossValue" | "debt" | "amounts" | "operation" | "row";
type RowError = { message: string; field: RowErrorField };
const blank: RowInput = { grossValue: "", debt: "", operation: "create" };
const subscribe = () => () => {};

function fieldForRowError(message: string): RowErrorField {
  const normalized = message.toLowerCase();
  if (normalized.includes("correction") || normalized.includes("existing mark")) return "operation";
  if (normalized.includes("gross value and debt")) return "amounts";
  if (normalized.includes("gross value")) return "grossValue";
  if (normalized.includes("debt")) return "debt";
  return "row";
}

function normalizeRowErrors(value: unknown, submittedRows: SubmittedRow[]) {
  if (!value || typeof value !== "object") return {} as Record<string, RowError>;
  return Object.entries(value).reduce<Record<string, RowError>>((result, [key, message]) => {
    if (typeof message !== "string") return result;
    const investmentId = /^\d+$/.test(key) ? submittedRows[Number(key)]?.investmentId : key;
    if (investmentId) result[investmentId] = { message, field: fieldForRowError(message) };
    return result;
  }, {});
}

type EmptyStateProps = { hasDate: boolean; loading: boolean; loadFailed: boolean; investmentCount: number };

export function BatchEmptyState({ hasDate, loading, loadFailed, investmentCount }: EmptyStateProps) {
  return hasDate && !loading && !loadFailed && investmentCount === 0
    ? <p className="entry-muted">No active investments are available for this date.</p>
    : null;
}

export function BatchSaveNotice({ message }: { message: string }) {
  return message ? <p role="status" className="entry-muted">{message}</p> : null;
}

type BatchFieldsProps = {
  investment: InvestmentRow;
  input: RowInput;
  rowError?: RowError;
  onUpdate: (id: string, change: Partial<RowInput>) => void;
};

export function BatchFields({ investment, input, rowError, onUpdate }: BatchFieldsProps) {
  const errorId = `batch-error-${investment.id}`;
  const fieldError = (field: RowErrorField) => rowError?.field === field &&
    <p id={errorId} className="field-error" role="alert">{rowError.message}</p>;

  return <div className="batch-fields"><div className="entry-field"><label htmlFor={`gross-${investment.id}`}>Gross value</label>
    <input id={`gross-${investment.id}`} type="text" inputMode="decimal" placeholder="0.00" value={input.grossValue}
      aria-invalid={rowError?.field === "grossValue" || rowError?.field === "amounts"}
      aria-describedby={rowError?.field === "grossValue" || rowError?.field === "amounts" ? errorId : undefined}
      onChange={(event) => onUpdate(investment.id, { grossValue: event.target.value })} />{fieldError("grossValue")}</div>
    <div className="entry-field"><label htmlFor={`debt-${investment.id}`}>Linked debt</label>
      <input id={`debt-${investment.id}`} type="text" inputMode="decimal" placeholder={investment.existing ? `Keep ${investment.existing.debt}` : "0.00"}
        value={input.debt} aria-invalid={rowError?.field === "debt" || rowError?.field === "amounts"}
        aria-describedby={rowError?.field === "debt" || rowError?.field === "amounts" ? errorId : undefined}
        onChange={(event) => onUpdate(investment.id, { debt: event.target.value })} />{fieldError("debt")}</div>
    {investment.existing && <div className="entry-field"><label htmlFor={`operation-${investment.id}`}>Save as</label>
      <select id={`operation-${investment.id}`} value={input.operation} onChange={(event) => onUpdate(investment.id,
        { operation: event.target.value as RowInput["operation"] })} aria-invalid={rowError?.field === "operation"}
        aria-describedby={rowError?.field === "operation" ? errorId : undefined}>
        <option value="create">Choose correction</option><option value="replace">Correct existing mark</option>
      </select>{fieldError("operation")}</div>}
    {!investment.existing && fieldError("operation")}</div>;
}

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
  const [errors, setErrors] = useState<Record<string, RowError>>({});
  const [message, setMessage] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
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
      .then((body) => { if (!controller.signal.aborted) { setInvestments(body.investments); setLoadFailed(false); setMessage(""); } })
      .catch(() => { if (!controller.signal.aborted) { setLoadFailed(true); setMessage("Unable to load valuation context. Try again."); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedDate, refresh]);

  function update(id: string, change: Partial<RowInput>) {
    setInputs((current) => ({ ...current, [id]: { ...(current[id] ?? blank), ...change } }));
    setErrors((current) => {
      const error = current[id];
      const changedField = Object.keys(change)[0];
      if (!error || (error.field !== "row" && error.field !== "amounts" && error.field !== changedField)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSavedMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || saving) return;
    setSavedMessage("");
    const rows = investments.flatMap((investment) => {
      const input = inputs[investment.id] ?? blank;
      return input.grossValue.trim() || input.debt.trim()
        ? [{ investmentId: investment.id, ...input }] : [];
    });
    if (rows.length === 0) { setMessage("Enter at least one gross value to save."); return; }
    const nextErrors: Record<string, RowError> = {};
    rows.forEach((row) => {
      if (!row.grossValue.trim()) nextErrors[row.investmentId] = {
        message: "Enter a gross value for this row.", field: "grossValue",
      };
      else if (investments.find((item) => item.id === row.investmentId)?.existing && row.operation !== "replace") {
        nextErrors[row.investmentId] = {
          message: "Choose correction explicitly for the existing mark.", field: "operation",
        };
      }
    });
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); setMessage("Review the highlighted rows."); return; }
    setSaving(true); setMessage(""); setErrors({});
    try {
      const response = await fetch("/api/valuations/batch", { method: "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ date: selectedDate, rows }) });
      const body = await response.json();
      if (!response.ok) {
        const rowErrors = normalizeRowErrors(body.rowErrors, rows);
        setErrors(rowErrors);
        setMessage(body.formError ?? "Review the highlighted rows. No marks were saved.");
        if (investments.some((investment) => !investment.existing && rowErrors[investment.id]?.field === "operation")) {
          setLoading(true); setRefresh((value) => value + 1);
        }
      } else {
        setInputs({}); setMessage("");
        setSavedMessage(`${rows.length} valuation ${rows.length === 1 ? "mark" : "marks"} saved for ${selectedDate}.`);
        setLoadFailed(false); setLoading(true); setRefresh((value) => value + 1);
      }
    } catch { setMessage("Unable to save marks. Your entries remain here."); }
    finally { setSaving(false); }
  }

  return <form className="batch-form" onSubmit={submit}>
    <div className="entry-field batch-date"><label htmlFor="batch-date">Shared as-of date</label>
      <input id="batch-date" type="date" value={selectedDate} required onChange={(event) => {
        if (Object.values(inputs).some((input) => input.grossValue || input.debt) &&
          !window.confirm("Changing the date clears entered marks. Continue?")) return;
        const nextDate = event.target.value;
        setDate(nextDate); setInputs({}); setErrors({}); setInvestments([]); setLoadFailed(false);
        setLoading(Boolean(nextDate)); setMessage(""); setSavedMessage("");
      }} /></div>
    <p className="entry-muted">Active investments appear in a stable order. Blank rows are skipped. All entered rows save together.</p>
    {loading && <p role="status">Loading investments and marks…</p>}
    <BatchEmptyState hasDate={Boolean(selectedDate)} loading={loading} loadFailed={loadFailed} investmentCount={investments.length} />
    <div className="batch-list">{investments.map((investment) => {
      const input = inputs[investment.id] ?? blank;
      const rowError = errors[investment.id];
      const errorId = `batch-error-${investment.id}`;
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
        <BatchFields investment={investment} input={input} rowError={rowError} onUpdate={update} />
        {net !== null && <p className="batch-net">Entered net value <strong>{money(net)}</strong>{delta !== null &&
          <span> · Change from previous {parseSignedCents(delta) > 0n ? "+" : ""}{money(delta)}</span>}</p>}
        {(rowError?.field === "row" || rowError?.field === "amounts") &&
          <p id={errorId} className="field-error" role="alert">{rowError.message}</p>}
      </section>;
    })}</div>
    {message && <p role="status" className={Object.keys(errors).length ? "form-error" : "entry-muted"}>{message}</p>}
    <BatchSaveNotice message={savedMessage} />
    <div className="entry-actions"><button className="primary-button" type="submit" disabled={loading || saving || investments.length === 0}>
      {saving ? "Saving…" : "Save entered marks"}</button><Link href="/add">All actions</Link></div>
  </form>;
}
