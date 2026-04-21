import { useState } from "react";
import { loginApi, registerApi, type AuthUser } from "../api";

type Mode = "login" | "register";

type Props = {
  onAuthenticated: (user: AuthUser) => void;
};

const errorMessages: Record<string, string> = {
  invalid_body: "Please fill in all fields.",
  weak_password: "Password must be at least 8 characters.",
  password_mismatch: "Passwords do not match.",
  invalid_email: "Enter a valid email address.",
  email_taken: "That email is already registered.",
  invalid_credentials: "Email or password is incorrect.",
  register_failed: "Could not create account. Try again.",
  login_failed: "Could not sign in. Try again.",
};

const inputClass =
  "rounded-lg border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:border-[var(--app-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--app-accent)]";

export function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "register") {
      if (password !== passwordConfirm) {
        setError(errorMessages.password_mismatch);
        return;
      }
    }
    setSubmitting(true);
    try {
      if (mode === "register") {
        const user = await registerApi({
          email,
          password,
          displayName: displayName.trim() || undefined,
        });
        onAuthenticated(user);
      } else {
        const user = await loginApi(email, password);
        onAuthenticated(user);
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setError(errorMessages[code] ?? "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--app-bg)] px-4">
      <div className="w-full max-w-[400px] rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-8 shadow-xl">
        <h1 className="text-center text-xl font-semibold text-[var(--app-text)]">
          Finance Calendar
        </h1>
        <p className="mt-1 text-center text-sm text-[var(--app-text-muted)]">
          {mode === "login"
            ? "Sign in to continue your budget and calendar."
            : "Create an account — onboarding is personal to you."}
        </p>

        <div className="mt-6 flex rounded-lg bg-[var(--app-input)] p-1 ring-1 ring-[var(--app-border)]">
          <button
            type="button"
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === "login"
                ? "bg-[var(--app-accent-muted)] text-[var(--app-text)]"
                : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
            }`}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === "register"
                ? "bg-[var(--app-accent-muted)] text-[var(--app-text)]"
                : "text-[var(--app-text-muted)] hover:text-[var(--app-text-secondary)]"
            }`}
            onClick={() => {
              setMode("register");
              setError(null);
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          {mode === "register" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--app-text-secondary)]">
                Display name
              </span>
              <input
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Optional"
                className={inputClass}
              />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--app-text-secondary)]">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--app-text-secondary)]">Password</span>
            <input
              type="password"
              required
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={mode === "register" ? 8 : undefined}
              className={inputClass}
            />
          </label>
          {mode === "register" && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--app-text-secondary)]">
                  Confirm password
                </span>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  minLength={8}
                  className={inputClass}
                />
              </label>
              <p className="text-xs leading-relaxed text-[var(--app-text-muted)]">
                Your profile (email, display name, and encrypted password) is stored in this app’s
                local database on your machine. Each account has its own calendar and budget data.
              </p>
            </>
          )}

          {error && (
            <p className="rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-lg bg-[var(--app-accent)] py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
