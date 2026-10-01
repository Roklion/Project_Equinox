import Link from "next/link";
import { SurfaceState } from "@/components/financial/primitives";

export default function HomePage() {
  return (
    <>
      <section className="page-heading" aria-labelledby="overview-title">
        <p className="eyebrow">Your investment overview</p>
        <h1 id="overview-title">Keep your investment story current.</h1>
        <p className="introduction">
          Record cash flows, transfers, and valuation marks as they happen.
        </p>
        <div className="entry-actions"><Link href="/valuations/batch">Batch valuation update</Link>
          <Link href="/investments/history">Investment history</Link></div>
      </section>
      <SurfaceState kind="empty" title="Your overview is taking shape.">
          Record entries, update several valuations, and review the history of each investment.
          Value trends will appear here in a later update.
      </SurfaceState>
    </>
  );
}
