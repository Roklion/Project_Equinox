export default function HomePage() {
  return (
    <>
      <div className="page-actions">
        <form action="/api/auth/logout" method="post">
          <button className="text-button" type="submit">Sign out</button>
        </form>
      </div>
      <section className="page-heading" aria-labelledby="overview-title">
        <p className="eyebrow">Your investment overview</p>
        <h1 id="overview-title">Room to see the bigger picture.</h1>
        <p className="introduction">
          Bring your investments, cash flows, and performance into one clear view.
        </p>
      </section>
      <section className="empty-state" aria-labelledby="empty-title">
        <div className="empty-symbol" aria-hidden="true">↗</div>
        <p className="eyebrow">A fresh start</p>
        <h2 id="empty-title">Your investment story starts here.</h2>
        <p>
          No investments have been added. As Equinox takes shape, this will be
          your place to understand what you own and how it changes over time.
        </p>
        <p className="availability">Investment entry is coming in a future update.</p>
      </section>
    </>
  );
}