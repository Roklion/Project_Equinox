"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function SetupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [ownerNames, setOwnerNames] = useState([""]);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setFormError(""); setFieldErrors({});
    try {
      const response = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ownerNames }) });
      const data = await response.json();
      if (!response.ok) { setFieldErrors(data.fieldErrors ?? {}); setFormError(data.formError ?? "Review the entered names."); return; }
      router.replace("/investments/new"); router.refresh();
    } catch { setFormError("Unable to confirm setup. Your values are still here; retry safely."); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <form className="entry-panel entry-form setup-form" onSubmit={submit} noValidate>
    {formError && <p className="form-error" role="alert">{formError}</p>}
    <fieldset disabled={busy} className="setup-fields">
      <div className="entry-field"><label htmlFor="household-name">Household display name</label>
        <input id="household-name" maxLength={200} value={name} onChange={(event) => setName(event.target.value)}
          aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? "setup-name-error" : undefined} />
        {fieldErrors.name && <span id="setup-name-error" role="alert">{fieldErrors.name}</span>}</div>
      <fieldset className="setup-fields"><legend>Initial owners</legend>
        <p className="field-help">Add at least one person or ownership entity. Labels can be identical; each owner has a separate identity.</p>
        {ownerNames.map((owner, index) => <div className="entry-field" key={index}>
          <label htmlFor={"setup-owner-" + index}>Owner {index + 1} name</label>
          <input id={"setup-owner-" + index} maxLength={200} value={owner}
            aria-invalid={!!fieldErrors.ownerNames} aria-describedby={fieldErrors.ownerNames ? "setup-owners-error" : undefined}
            onChange={(event) => setOwnerNames((current) => current.map((value, i) => i === index ? event.target.value : value))} />
        </div>)}
        {fieldErrors.ownerNames && <span id="setup-owners-error" role="alert">{fieldErrors.ownerNames}</span>}
        <button className="text-button" type="button" onClick={() => setOwnerNames((current) => [...current, ""])}>Add another owner</button>
        {ownerNames.length > 1 && <button className="text-button" type="button" onClick={() => setOwnerNames((current) => current.slice(0, -1))}>Remove last owner</button>}
      </fieldset>
    </fieldset>
    <div className="entry-actions"><button className="primary-button" disabled={busy}>{busy ? "Setting up…" : "Create household"}</button></div>
  </form>;
}
