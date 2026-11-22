"use client";
import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, { error: null as string | null });
  return (
    <form action={action} className="auth-card" aria-describedby={state.error ? "login-error" : undefined}>
      <h1>DM sign in</h1>
      <p className="source-note" style={{ margin: 0 }}>
        Signing in shows the DM Ledger: private notes, plans, and connections that visitors never receive.
      </p>
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span>Email</span>
        <input type="email" name="email" autoComplete="username" required />
      </label>
      <label className="field">
        <span>Password</span>
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.error && (
        <p className="form-error" id="login-error" role="alert">
          {state.error}
        </p>
      )}
      <button className="btn btn-ledger" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
