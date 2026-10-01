"use client";

import { FormEvent, useEffect, useState } from "react";
import type { InvestmentOption, StoredMark, StoredMovement } from "@/application/ports";

type History = { movements: StoredMovement[]; marks: Array<StoredMark & { netValue: string }> };
type Item = { kind: "valuation"; date: string; mark: History["marks"][number] } |
  { kind: StoredMovement["kind"]; date: string; movement: StoredMovement };
type Draft = { kind: string; investmentId: string; actionId: string; originalAsOfDate: string; originalEffectiveDate: string;
  date: string; amount: string; grossValue: string; debt: string; sourceInvestmentId: string;
  destinationInvestmentId: string; targetInvestmentId: string; notes: string; sourceReference: string };

type DeletionEntry = Pick<Draft, "kind" | "originalAsOfDate" | "originalEffectiveDate" | "date">;

export function deletionConfirmation(draft: DeletionEntry) {
  return draft.kind === "transfer"
    ? "Delete this entire transfer, including both investment movements?"
    : draft.kind === "valuation" ? `Delete the valuation mark dated ${draft.originalAsOfDate}?`
      : `Delete this ${draft.kind} dated ${draft.originalEffectiveDate}?`;
}

type EmptyStatesProps = { loading: boolean; loadFailed: boolean; selectedId: string; itemCount: number; investmentCount: number };

export function HistoryEmptyStates({ loading, loadFailed, selectedId, itemCount, investmentCount }: EmptyStatesProps) {
  return <>
    {selectedId && !loading && !loadFailed && itemCount === 0 &&
      <p className="entry-muted">No actions or valuation marks are recorded for this investment.</p>}
    {!loading && !loadFailed && !selectedId && investmentCount === 0 &&
      <p className="entry-muted">No investments are available yet.</p>}
  </>;
}
function money(value: string) {
  const negative = value.startsWith("-");
  const [whole, fraction] = value.replace("-", "").split(".");
  return `${negative ? "−" : ""}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction ?? "00"}`;
}

export function HistoryPanel({ initialInvestmentId = "" }: { initialInvestmentId?: string }) {
  const [investments, setInvestments] = useState<InvestmentOption[]>([]);
  const [selectedId, setSelectedId] = useState(initialInvestmentId);
  const [history, setHistory] = useState<History | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const query = selectedId ? `?investmentId=${encodeURIComponent(selectedId)}` : "";
    fetch(`/api/history${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.formError);
        return body as { investments: InvestmentOption[]; history: History | null };
      })
      .then((body) => { if (!controller.signal.aborted) { setInvestments(body.investments); setHistory(body.history); setLoadFailed(false); setMessage(""); } })
      .catch(() => { if (!controller.signal.aborted) { setLoadFailed(true); setMessage("Unable to load history. Try again."); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedId, refresh]);

  const names = new Map(investments.map((item) => [item.id, item.name]));
  const items: Item[] = history ? [
    ...history.movements.map((movement) => ({ kind: movement.kind, date: movement.effectiveDate, movement } as Item)),
    ...history.marks.map((mark) => ({ kind: "valuation", date: mark.asOfDate, mark } as Item)),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind)) : [];

  function edit(item: Item) {
    if (item.kind === "valuation") {
      setDraft({ kind: "valuation", investmentId: selectedId, actionId: "", originalAsOfDate: item.mark.asOfDate, originalEffectiveDate: "",
        date: item.mark.asOfDate, amount: "", grossValue: item.mark.grossValue, debt: item.mark.debt,
        sourceInvestmentId: "", destinationInvestmentId: "", targetInvestmentId: selectedId,
        notes: item.mark.notes ?? "", sourceReference: item.mark.sourceReference ?? "" });
    } else {
      const movement = item.movement;
      setDraft({ kind: movement.kind, investmentId: selectedId, actionId: movement.actionId, originalAsOfDate: "", originalEffectiveDate: movement.effectiveDate,
        date: movement.effectiveDate, amount: movement.amount, grossValue: "", debt: "",
        sourceInvestmentId: movement.kind === "transfer" && movement.role === "destination"
          ? movement.counterpartyInvestmentId ?? "" : selectedId,
        destinationInvestmentId: movement.kind === "transfer" && movement.role === "source"
          ? movement.counterpartyInvestmentId ?? "" : selectedId,
        targetInvestmentId: selectedId, notes: movement.notes ?? "", sourceReference: movement.sourceReference ?? "" });
    }
    setMessage("");
  }

  function change(field: keyof Draft, value: string) {
    setDraft((current) => current && { ...current, [field]: value });
  }

  async function mutate(remove: boolean) {
    if (!draft || busy) return;
    if (remove && !window.confirm(deletionConfirmation(draft))) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/history", { method: remove ? "DELETE" : "PATCH",
        headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const body = await response.json();
      if (!response.ok) { setMessage(body.formError ?? "Unable to change this entry."); return; }
      setDraft(null); setHistory(null); setLoadFailed(false); setLoading(true); setRefresh((value) => value + 1);
    } catch { setMessage("Unable to change this entry. Please try again."); }
    finally { setBusy(false); }
  }

  return <div className="history-panel">
    <div className="entry-field history-picker"><label htmlFor="history-investment">Investment</label>
      <select id="history-investment" value={selectedId} onChange={(event) => {
        setSelectedId(event.target.value); setDraft(null); setHistory(null); setLoadFailed(false); setLoading(true); setMessage("");
      }}><option value="">Choose an investment</option>{investments.map((investment) =>
        <option key={investment.id} value={investment.id}>{investment.name}{investment.status === "closed" ? " (closed)" : ""}</option>)}</select></div>
    {loading && <p role="status">Loading history…</p>}
    <HistoryEmptyStates loading={loading} loadFailed={loadFailed} selectedId={selectedId}
      itemCount={items.length} investmentCount={investments.length} />
    <div className="history-list">{items.map((item) => {
      const mark = item.kind === "valuation";
      const key = mark ? `mark-${item.mark.id}` : `action-${item.movement.actionId}`;
      const label = mark ? "Valuation mark" : item.kind === "transfer"
        ? item.movement.role === "source" ? "Transfer out" : "Transfer in"
        : item.kind === "contribution" ? "Contribution" : "Withdrawal / distribution";
      const value = mark ? item.mark.netValue : item.movement.amount;
      const metadata = mark ? item.mark : item.movement;
      return <article className={`history-item ${mark ? "history-mark" : ""}`} key={key}>
        <div><p className="eyebrow">{mark ? "Valuation observation" : "Cash movement"}</p><h2>{label}</h2>
          <p className="entry-muted">{item.date}{!mark && item.kind === "transfer" &&
            ` · ${item.movement.role === "source" ? "To" : "From"} ${names.get(item.movement.counterpartyInvestmentId ?? "") ?? "another investment"}`}</p></div>
        <div className="history-value"><strong>{money(value)}</strong>{mark &&
          <span>Gross {money(item.mark.grossValue)} · Debt {money(item.mark.debt)}</span>}
          {metadata.sourceReference && <span>Reference: {metadata.sourceReference}</span>}
          {metadata.notes && <span>{metadata.notes}</span>}
          <button type="button" className="text-button" onClick={() => edit(item)}>Edit or delete</button></div>
      </article>;
    })}</div>
    {draft && <form className="entry-panel entry-form history-edit" onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault(); void mutate(false);
    }}><p className="eyebrow">Correct canonical entry</p><h2>{draft.kind === "valuation" ? "Valuation mark" : draft.kind === "transfer" ? "Whole transfer" : draft.kind}</h2>
      <div className="entry-field"><label htmlFor="correct-date">{draft.kind === "valuation" ? "As-of date" : "Effective date"}</label>
        <input id="correct-date" type="date" value={draft.date} required onChange={(event) => change("date", event.target.value)} /></div>
      {draft.kind === "transfer" ? <div className="transfer-pair">
        {(["sourceInvestmentId", "destinationInvestmentId"] as const).map((field) => <div className="entry-field" key={field}>
          <label htmlFor={field}>{field === "sourceInvestmentId" ? "Move value from" : "Move value to"}</label>
          <select id={field} value={draft[field]} onChange={(event) => change(field, event.target.value)}>
            {investments.map((investment) => <option key={investment.id} value={investment.id}>{investment.name}</option>)}</select></div>)}</div> :
        draft.kind !== "valuation" && <div className="entry-field"><label htmlFor="targetInvestmentId">Investment</label>
          <select id="targetInvestmentId" value={draft.targetInvestmentId} onChange={(event) => change("targetInvestmentId", event.target.value)}>
            {investments.map((investment) => <option key={investment.id} value={investment.id}>{investment.name}</option>)}</select></div>}
      {draft.kind === "valuation" ? <div className="entry-money-pair">
        {(["grossValue", "debt"] as const).map((field) => <div className="entry-field" key={field}>
          <label htmlFor={field}>{field === "grossValue" ? "Gross value" : "Linked debt"}</label>
          <input id={field} type="text" inputMode="decimal" value={draft[field]} required
            onChange={(event) => change(field, event.target.value)} /></div>)}</div> :
        <div className="entry-field"><label htmlFor="correct-amount">Positive amount</label>
          <input id="correct-amount" type="text" inputMode="decimal" value={draft.amount} required
            onChange={(event) => change("amount", event.target.value)} /></div>}
      <div className="entry-field"><label htmlFor="correct-reference">Source reference</label>
        <input id="correct-reference" value={draft.sourceReference} maxLength={200}
          onChange={(event) => change("sourceReference", event.target.value)} /></div>
      <div className="entry-field"><label htmlFor="correct-notes">Notes</label>
        <textarea id="correct-notes" value={draft.notes} maxLength={2000}
          onChange={(event) => change("notes", event.target.value)} /></div>
      <p className="entry-muted">Corrections update this record in place. Valuation marks remain observations, not cash flows.</p>
      <div className="entry-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save correction"}</button>
        <button className="text-button danger-button" type="button" disabled={busy} onClick={() => void mutate(true)}>Delete entry</button>
        <button className="text-button" type="button" onClick={() => { setDraft(null); setMessage(""); }}>Cancel</button></div>
    </form>}
    {message && <p role="alert" className="form-error">{message}</p>}
  </div>;
}
