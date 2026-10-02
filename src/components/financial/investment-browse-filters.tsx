import { Fragment } from "react";
import Form from "next/form";
import Link from "next/link";
import type { ConstituentSnapshot } from "@/domain/analytics/snapshot";
import { browseChoices, type BrowseQuery } from "./investment-browse";

const dimensions = [
  ["assetClass", "Asset class"], ["accountType", "Account type"], ["taxStatus", "Tax status"],
  ["liquidity", "Liquidity"], ["institution", "Institution"], ["owner", "Owner"], ["group", "Custom group"],
] as const;

export function InvestmentBrowseFilters({ items, query, date }: {
  items: readonly ConstituentSnapshot[]; query: BrowseQuery; date: string;
}) {
  const resetParams = new URLSearchParams({ date });
  if (query.lifecycle) resetParams.set("lifecycle", query.lifecycle);
  const selectionKey = JSON.stringify([date, query.lifecycle, ...dimensions.map(([key]) => query[key] ?? "")]);
  // Remount uncontrolled controls when URL selection changes, including browser history.
  return <Fragment key={selectionKey}><Form className="investment-filters entry-form" action="/investments">
    <div className="entry-field"><label htmlFor="report-date">Reporting date</label>
      <input id="report-date" type="date" name="date" defaultValue={date} required /></div>
    <div className="entry-field"><label htmlFor="lifecycle">Investments to show</label>
      <select id="lifecycle" name="lifecycle" defaultValue={query.lifecycle ?? "active"}>
        <option value="active">Active investments</option><option value="closed">Closed investments</option><option value="all">Active and closed</option>
      </select></div>
    <details className="investment-filter-details" open={dimensions.some(([key]) => !!query[key])}>
      <summary>Filter by classification and ownership</summary><div className="investment-filter-options">
      {dimensions.map(([key, label]) => {
        const choices = browseChoices(items, key);
        const selected = query[key] ?? "";
        return <div className="entry-field" key={key}><label htmlFor={key}>{label}</label>
          <select id={key} name={key} defaultValue={selected}>
            <option value="">All</option>
            {selected && !choices.some((choice) => choice.id === selected) && <option value={selected}>Unavailable selection</option>}
            {choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
          </select></div>;
      })}</div></details>
    <div className="entry-actions"><button className="primary-button" type="submit">Apply filters</button>
      <Link href={"/investments?" + resetParams}>Reset filters</Link></div>
  </Form></Fragment>;
}
