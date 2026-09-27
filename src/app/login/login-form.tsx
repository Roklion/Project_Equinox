"use client";

import { FormEvent, useState } from "react";

export function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: data.get("password") }),
      });
      if (!response.ok) {
        setError("Unable to sign in. Check your password and try again later.");
        return;
      }
      window.location.replace(new URL("/", window.location.href));
    } catch {
      setError("Unable to sign in. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="app-password">App password</label>
      <input id="app-password" name="password" type="password" autoComplete="current-password" required />
      {error && <p role="alert" className="form-error">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
