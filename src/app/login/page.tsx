import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in | Equinox" };

export default function LoginPage() {
  return (
    <section className="login-panel" aria-labelledby="login-title">
      <p className="eyebrow">Welcome back</p>
      <h1 id="login-title">Sign in to Equinox.</h1>
      <p className="introduction">Enter your app password to continue.</p>
      <LoginForm />
    </section>
  );
}
