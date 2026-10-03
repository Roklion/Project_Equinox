"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { SettingsCommand, SettingsData, SettingsDimension } from "@/application/settings";
import "./settings.css";

const classifications: Array<[SettingsDimension, string]> = [
  ["assetClasses", "Asset classes"], ["accountTypes", "Account types"], ["taxStatuses", "Tax statuses"],
  ["liquidities", "Liquidity"], ["institutions", "Institutions"], ["customGroups", "Custom groups"],
];
type Command = Omit<SettingsCommand, "householdId"> & { confirmed?: boolean };
type Feedback = { fieldErrors?: Record<string, string>; formError?: string };
type Save = (command: Command) => Promise<Feedback | null>;

function LabelEditor({ dimension, record, busy, save }: {
  dimension: SettingsDimension | "household"; record?: { id: string; label: string }; busy: boolean; save: Save;
}) {
  const inputId = useId();
  const [label, setLabel] = useState(record?.label ?? "");
  const [feedback, setFeedback] = useState<Feedback>({});
  const [confirming, setConfirming] = useState(false);
  async function write(remove = false) {
    const result = await save({ dimension, operation: remove ? "remove" : record ? "rename" : "create",
      id: record?.id, label, confirmed: remove });
    setFeedback(result ?? {});
    if (!result) { setConfirming(false); if (!record) setLabel(""); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void write(); }
  return <form className="settings-editor entry-form" onSubmit={submit} noValidate>
    <fieldset disabled={busy} className="investment-fields">
      <div className="entry-field"><label htmlFor={inputId}>{record ? dimension === "household" ? "Household name" : `Name for ${record.label}` : "New value"}</label>
        <input id={inputId} maxLength={200} value={label} onChange={(event) => setLabel(event.target.value)}
          aria-invalid={!!feedback.fieldErrors?.label} aria-describedby={feedback.fieldErrors?.label ? `${inputId}-error` : undefined} />
        {feedback.fieldErrors?.label && <span id={`${inputId}-error`} className="field-error" role="alert">{feedback.fieldErrors.label}</span>}
      </div>
      {feedback.formError && <p role="alert" className="form-error">{feedback.formError}</p>}
      <div className="entry-actions"><button className={record ? "text-button" : "primary-button"} type="submit">{record ? "Save name" : "Add value"}</button>
        {record && dimension !== "household" && !confirming && <button className="text-button" type="button" onClick={() => { setConfirming(true); setFeedback({}); }}>Remove</button>}
      </div>
      {confirming && <div className="correction-notice"><p>Remove {record?.label}? Only unused values can be removed. Investments, associations, and financial history will be preserved.</p>
        <div className="entry-actions"><button className="text-button" type="button" onClick={() => void write(true)}>Confirm removal</button>
          <button className="text-button" type="button" onClick={() => setConfirming(false)}>Cancel removal</button></div></div>}
    </fieldset>
  </form>;
}

export function SettingsPanel({ section }: { section: "household" | "classifications" }) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const submitting = useRef(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings", { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.formError || "Unable to load settings.");
      if (!cancelled) { setData(result); setError(""); }
    }).catch(() => { if (!cancelled) setError("Unable to load settings. Please try again."); });
    return () => { cancelled = true; };
  }, [retry]);
  const save: Save = async (command) => {
    if (submitting.current) return { formError: "Wait for the current save to finish." };
    submitting.current = true; setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const result = await response.json();
      if (!response.ok) return result;
      setStatus(command.operation === "remove" ? "Value removed. Financial history is unchanged." : "Saved. Investment associations and financial history are preserved.");
      setRetry((value) => value + 1);
      return null;
    } catch { return { formError: "Unable to save. Your entered value is still here; please try again." }; }
    finally { submitting.current = false; setBusy(false); }
  };
  if (!data) return error ? <div role="alert"><p>{error}</p><button className="primary-button" onClick={() => setRetry((value) => value + 1)}>Try again</button></div> : <p role="status">Loading settings…</p>;
  const dimensions: Array<[SettingsDimension, string]> = section === "household" ? [["owners", "Owners"]] : classifications;
  return <div className="settings-panel investment-management">
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error} <button className="text-button" onClick={() => setRetry((value) => value + 1)}>Refresh settings</button></p>}
    {section === "household" && <section className="entry-panel" aria-label="Household"><h2>Household</h2><p>Currency: USD</p>
      <LabelEditor key={data.household.name} dimension="household" record={{ id: data.household.id, label: data.household.name }} busy={busy} save={save} /></section>}
    {dimensions.map(([dimension, title]) => <section className="entry-panel" key={dimension} aria-label={title}><h2>{title}</h2>
      {dimension === "owners" && <p className="field-help">Owner names may repeat; each owner has a separate stable identity. Choose distinct names to make investment selection clear.</p>}
      {dimension === "customGroups" && <p className="field-help">Groups may overlap. Remove investment memberships through Manage investment before removing a group.</p>}
      {data.choices[dimension].length === 0 && <p>No values configured yet.</p>}
      <div className="settings-values">{data.choices[dimension].map((record) => <LabelEditor key={`${record.id}:${record.label}`} dimension={dimension} record={record} busy={busy} save={save} />)}</div>
      <LabelEditor dimension={dimension} busy={busy} save={save} />
    </section>)}
    <p>Used values cannot be removed. Reassign them through <Link href="/investments">Investments</Link>, then return here.</p>
  </div>;
}
