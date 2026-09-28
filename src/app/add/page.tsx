import Link from "next/link";

const actions = [
  { href: "/add/contribution", label: "Contribution", description: "Add money to an investment." },
  { href: "/add/withdrawal", label: "Withdrawal / Distribution", description: "Record money leaving an investment." },
  { href: "/add/transfer", label: "Transfer", description: "Move value between investments." },
  { href: "/add/valuation", label: "Valuation Mark", description: "Update an investment's value as of a date." },
] as const;

export default function AddPage() {
  return (
    <>
      <div className="entry-topline"><Link href="/">← Overview</Link></div>
      <section className="page-heading">
        <p className="eyebrow">Add an entry</p>
        <h1>What would you like to record?</h1>
        <p className="introduction">Choose one action. Every entry uses an actual calendar date.</p>
      </section>
      <nav className="action-grid" aria-label="Choose an action">
        {actions.map((action) => (
          <Link className="action-choice" href={action.href} key={action.href}>
            <strong>{action.label}</strong><span>{action.description}</span><span aria-hidden="true">→</span>
          </Link>
        ))}
      </nav>
      <p className="entry-topline"><Link href="/valuations/batch">Update several valuation marks →</Link></p>
    </>
  );
}
