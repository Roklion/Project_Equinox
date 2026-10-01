import type { Metadata } from "next";
import Link from "next/link";
import { SurfaceState } from "@/components/financial/primitives";

export const metadata: Metadata = { title: "Update Center | Equinox" };

export default function UpdateCenterPage() {
  return <><section className="page-heading"><p className="eyebrow">Keep your records current</p><h1>Update Center</h1>
    <p className="introduction">Update valuations and review previously recorded entries.</p></section>
    <div className="action-grid">
      <Link className="action-choice" href="/valuations/batch"><strong>Batch valuation update</strong>
        <span>Record or correct dated marks for several investments.</span><span aria-hidden="true">↗</span></Link>
      <Link className="action-choice" href="/investments/history"><strong>History and corrections</strong>
        <span>Review and correct existing actions and valuation marks.</span><span aria-hidden="true">↗</span></Link>
    </div>
    <SurfaceState kind="empty" title="More context is on the way">
      Valuation freshness and update guidance will arrive in a later Update Center update.</SurfaceState>
  </>;
}
