import Link from "next/link";
import { scopeFields, type ScopeChoices, type ScopeSelection } from "./reporting-scope";

export function ScopeControls({ selection, choices, resetHref }: {
  selection: ScopeSelection; choices: ScopeChoices; resetHref: string;
}) {
  return <details className="investment-filter-details reporting-scope-controls">
    <summary>Choose reporting scope</summary>
    <p className="metric-context">Leave filters clear for all tracked investments. Select any matching value within a filter; different filters intersect.
      Joint investments count once. Current ownership, classifications and group memberships apply to all history.</p>
    <div className="investment-filter-options">{scopeFields.map(({ key, label, choices: choiceKey }) => {
      const selected = selection[key] ?? [];
      const options = [...choices[choiceKey], ...selected.filter((id) =>
        !choices[choiceKey].some((choice) => choice.id === id)).map((id) => ({ id, label: "Unavailable selection" }))];
      return <details className="scope-dimension" key={key}>
        <summary>{label}{selected.length > 0 ? " · " + selected.length + " selected" : " · All"}</summary>
        <fieldset><legend>{label} scope</legend>
          {options.length ? options.map((choice) => <label className="scope-choice" key={choice.id}>
            <input type="checkbox" name={key} value={choice.id} defaultChecked={selected.includes(choice.id)} />{choice.label}
          </label>) : <p className="metric-context">No {label.toLowerCase()} values configured.</p>}
        </fieldset>
      </details>;
    })}</div>
    <div className="entry-actions"><Link href={resetHref}>Reset to All tracked investments</Link>
      <Link href="/settings?section=classifications">Manage scope values</Link></div>
  </details>;
}
