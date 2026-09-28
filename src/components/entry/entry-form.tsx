"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { InvestmentOption, StoredMark } from "@/application/ports";
import { formatCents, netValue, parseCents, parseSignedCents } from "@/domain/financial";

type Kind = "contribution" | "withdrawal" | "transfer" | "valuation";
type MarkWithNet = StoredMark & { netValue: string };
type ValuationContext = { existing: MarkWithNet | null; previous: MarkWithNet | null };
type LatestMark = MarkWithNet & { investmentId: string };
type FieldErrors = Record<string, string>;

function localCalendarDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptySubscribe() {
  return () => {};
}

function serverCalendarDate() {
  return "";
}

function money(value: string) {
  const negative = value.startsWith("-");
  const cents = parseCents(negative ? value.slice(1) : value, true);
  const normalized = formatCents(cents);
  const [whole, fraction] = normalized.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "−" : ""}$${grouped}.${fraction}`;
}

function inputError(errors: FieldErrors, field: string) {
  return errors[field] ? <span className="field-error" role="alert">{errors[field]}</span> : null;
}

function InvestmentSelect({ id, label, value, onChange, options, errors, exclude }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  options: InvestmentOption[]; errors: FieldErrors; exclude?: string;
}) {
  return (
    <div className="entry-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}
        required aria-invalid={Boolean(errors[id])} aria-describedby={errors[id] ? `${id}-error` : undefined}>
        <option value="">Choose an investment</option>
        {options.filter((option) => option.id !== exclude).map((option) => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </select>
      {errors[id] && <span id={`${id}-error`} className="field-error" role="alert">{errors[id]}</span>}
    </div>
  );
}

export function EntryForm({ kind }: { kind: Kind }) {
  const saving = useRef(false);
  const lastFetched = useRef<{ date: string; investmentId: string; kind: Kind; refresh: number } | null>(null);
  const browserDate = useSyncExternalStore(emptySubscribe, localCalendarDate, serverCalendarDate);
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const date = dateOverride ?? browserDate;
  const [investmentId, setInvestmentId] = useState("");
  const [destinationInvestmentId, setDestinationInvestmentId] = useState("");
  const [amount, setAmount] = useState("");
  const [grossValue, setGrossValue] = useState("");
  const [debt, setDebt] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [investments, setInvestments] = useState<InvestmentOption[]>([]);
  const [context, setContext] = useState<ValuationContext | null>(null);
  const [latest, setLatest] = useState<LatestMark | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedLabel, setSavedLabel] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const contextInvestmentId = kind === "valuation" ? investmentId : "";
  useEffect(() => {
    if (!date) return;
    if (lastFetched.current?.date === date && lastFetched.current.investmentId === contextInvestmentId &&
      lastFetched.current.kind === kind && lastFetched.current.refresh === refresh) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const query = new URLSearchParams({ date });
    if (contextInvestmentId) query.set("investmentId", contextInvestmentId);
    fetch(`/api/entries?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.formError ?? "Unable to load investments.");
        return body as { investments: InvestmentOption[]; context: ValuationContext | null; latest: LatestMark | null };
      })
      .then((body) => {
        if (controller.signal.aborted) return;
        setInvestments(body.investments);
        const nextContextInvestmentId = kind === "valuation" && contextInvestmentId &&
          body.investments.some((item) => item.id === contextInvestmentId) ? contextInvestmentId : "";
        setInvestmentId((previous) => previous && !body.investments.some((item) => item.id === previous) ? "" : previous);
        setDestinationInvestmentId((previous) =>
          previous && !body.investments.some((item) => item.id === previous) ? "" : previous);
        lastFetched.current = { date, investmentId: nextContextInvestmentId, kind, refresh };
        setContext(body.context);
        setLatest(body.latest);
        setLoadError("");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setLoadError("Unable to load investments. Please try again.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, contextInvestmentId, kind, refresh]);

  let enteredNet: string | null = null;
  let enteredDelta: string | null = null;
  if (kind === "valuation" && grossValue !== "") {
    try {
      enteredNet = netValue(grossValue, debt || context?.existing?.debt || "0");
      if (context?.previous) {
        enteredDelta = formatCents(parseSignedCents(enteredNet) - parseSignedCents(context.previous.netValue));
      }
    } catch { /* Show field validation after submit. */ }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || loading) return;
    saving.current = true;
    setBusy(true);
    setErrors({});
    setSaveError("");
    const payload = {
      kind, date, investmentId, sourceInvestmentId: investmentId, destinationInvestmentId,
      amount, grossValue, debt, notes, sourceReference,
      operation: context?.existing ? "replace" : "create",
    };
    try {
      const response = await fetch("/api/entries", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        const fieldErrors = body.fieldErrors ?? {};
        setErrors(fieldErrors);
        if (fieldErrors.notes || fieldErrors.sourceReference) setDetailsOpen(true);
        setSaveError(body.formError ?? (body.fieldErrors ? "Review the highlighted fields." : "Unable to save this entry."));
        if (kind === "valuation") { setLoading(true); setRefresh((current) => current + 1); }
        return;
      }
      setSavedLabel(kind === "valuation" ? (context?.existing ? "Valuation corrected" : "Valuation saved")
        : kind === "transfer" ? "Transfer saved" : kind === "contribution" ? "Contribution saved" : "Withdrawal saved");
      setSaved(true);
      setRefresh((current) => current + 1);
    } catch {
      setSaveError("Unable to save this entry. Please try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <section className="entry-panel entry-success" role="status">
        <p className="eyebrow">Saved</p><h2>{savedLabel}</h2>
        <p>Your entry is recorded for {date}. You can add another entry or return to the overview.</p>
        <div className="entry-actions">
          <button type="button" className="primary-button" onClick={() => {
            setSaved(false); setAmount(""); setGrossValue(""); setDebt("");
            setNotes(""); setSourceReference(""); setDestinationInvestmentId(""); setErrors({});
            setLoadError(""); setSaveError(""); setDetailsOpen(false);
            if (kind === "valuation") {
              setInvestmentId(""); setLoading(true); setContext(null); setLatest(null);
            }
          }}>Add another</button>
          <Link href="/">Overview</Link>
        </div>
      </section>
    );
  }

  return (
    <form className="entry-panel entry-form" onSubmit={submit}>
      <p className="entry-hint">
        {kind === "transfer" ? "Move value between two investments with one linked transfer." :
          kind === "valuation" ? "Record what this investment was worth on a specific date." :
            kind === "contribution" ? "Record value added from outside your tracked investments." :
              "Record value leaving your tracked investments."}
      </p>
      <div className="entry-field">
        <label htmlFor="entry-date">{kind === "valuation" ? "As-of date" : "Effective date"}</label>
        <input id="entry-date" type="date" value={date} onChange={(event) => {
          setDateOverride(event.target.value); setLoading(true); setInvestments([]); setContext(null); setLatest(null);
        }}
          required aria-invalid={Boolean(errors.date)} />
        {inputError(errors, "date")}
      </div>
      {kind === "transfer" ? (
        <div className="transfer-pair">
          <InvestmentSelect id="sourceInvestmentId" label="Move value from" value={investmentId}
            onChange={(value) => {
              setInvestmentId(value);
              if (value === destinationInvestmentId) setDestinationInvestmentId("");
            }}
            options={investments} errors={errors} />
          <InvestmentSelect id="destinationInvestmentId" label="Move value to" value={destinationInvestmentId}
            onChange={setDestinationInvestmentId}
            options={investments} errors={errors} exclude={investmentId} />
        </div>
      ) : (
        <InvestmentSelect id="investmentId" label="Investment" value={investmentId}
          onChange={(value) => {
            setInvestmentId(value);
            if (kind === "valuation") { setLoading(true); setContext(null); setLatest(null); }
          }}
          options={investments} errors={errors} />
      )}
      {loading && <p className="entry-muted" role="status">Checking investments and date…</p>}
      {!loading && !loadError && !saveError && investments.length === 0 && (
        <p className="entry-muted">No investments are available on this date.</p>
      )}
      {kind === "valuation" ? (
        <>
          {context?.existing && (
            <div className="correction-notice">
              <strong>Existing mark on {date}</strong>
              <p>Saving will correct this mark. Leave debt blank to keep its current amount, or enter zero to remove it.</p>
            </div>
          )}
          <div className="entry-money-pair">
            <div className="entry-field">
              <label htmlFor="grossValue">Gross investment value</label>
              <div className="money-input"><span aria-hidden="true">$</span><input id="grossValue" type="text"
                inputMode="decimal" value={grossValue} onChange={(event) => setGrossValue(event.target.value)}
                placeholder="0.00" required aria-invalid={Boolean(errors.grossValue)} /></div>
              {inputError(errors, "grossValue")}
            </div>
            <div className="entry-field">
              <label htmlFor="debt">Investment-linked debt</label>
              <div className="money-input"><span aria-hidden="true">$</span><input id="debt" type="text"
                inputMode="decimal" value={debt} onChange={(event) => setDebt(event.target.value)}
                placeholder="0.00" aria-invalid={Boolean(errors.debt)} /></div>
              <span className="field-help">{context?.existing
                ? `Optional. Leave blank to keep current debt of ${money(context.existing.debt)}; enter 0 to remove it.`
                : "Optional. Leave blank to use zero."}</span>
              {inputError(errors, "debt")}
            </div>
          </div>
          {(enteredNet !== null || context?.previous || latest) && (
            <section className="valuation-preview" aria-label="Valuation preview">
              {enteredNet !== null && <div><span>Entered net value</span><strong>{money(enteredNet)}</strong></div>}
              {latest && latest.asOfDate !== context?.previous?.asOfDate && (
                <>
                  <p>Latest mark · {latest.asOfDate}</p>
                  <div><span>Net value</span><span>{money(latest.netValue)}</span></div>
                </>
              )}
              {context?.previous && <>
                <p>Previous mark · {context.previous.asOfDate}</p>
                <div><span>Gross value</span><span>{money(context.previous.grossValue)}</span></div>
                <div><span>Linked debt</span><span>{money(context.previous.debt)}</span></div>
                <div><span>Net value</span><span>{money(context.previous.netValue)}</span></div>
              </>}
              {enteredDelta !== null && <div className="preview-delta"><span>Change from previous net</span>
                <strong>{enteredDelta.startsWith("-") ? "" : "+"}{money(enteredDelta)}</strong></div>}
            </section>
          )}
          {inputError(errors, "operation")}
        </>
      ) : (
        <div className="entry-field">
          <label htmlFor="amount">{kind === "transfer" ? "Amount to move" :
            kind === "contribution" ? "Amount contributed" : "Amount withdrawn"}</label>
          <div className="money-input"><span aria-hidden="true">$</span><input id="amount" type="text"
            inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00" required aria-invalid={Boolean(errors.amount)} /></div>
          {inputError(errors, "amount")}
          <span className="field-help">Enter a positive amount. The action determines its direction.</span>
        </div>
      )}
      <details className="entry-details" open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
        <summary>Notes and source reference <span>Optional</span></summary>
        <div className="entry-field">
          <label htmlFor="sourceReference">Source reference</label>
          <input id="sourceReference" type="text" value={sourceReference}
            onChange={(event) => setSourceReference(event.target.value)} maxLength={200} />
          {inputError(errors, "sourceReference")}
        </div>
        <div className="entry-field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)}
            rows={3} maxLength={2000} />
          {inputError(errors, "notes")}
        </div>
      </details>
      {(saveError || loadError) && <p role="alert" className="form-error">{saveError || loadError}</p>}
      <div className="entry-actions">
        {loadError && <button className="primary-button" type="button" onClick={() => {
          setLoadError(""); setLoading(true); setRefresh((current) => current + 1);
        }}>Try loading again</button>}
        <button className="primary-button" type="submit" disabled={busy || loading || Boolean(loadError) || investments.length === 0}>
          {busy ? "Saving…" : kind === "valuation" && context?.existing ? "Correct existing mark" :
            kind === "transfer" ? "Save transfer" : kind === "valuation" ? "Save valuation mark" :
              kind === "contribution" ? "Save contribution" : "Save withdrawal"}
        </button>
        <Link href="/add">Choose another action</Link>
      </div>
    </form>
  );
}
