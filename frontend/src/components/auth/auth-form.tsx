"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";

type Mode = "login" | "register";

type AuthFormProps = {
  mode: Mode;
};

function normalizeApiError(payload: unknown) {
  if (payload && typeof payload === "object") {
    const detailValue = (payload as Record<string, unknown>).detail;
    if (typeof detailValue === "string" && detailValue.trim()) {
      return detailValue;
    }

    const firstEntry = Object.entries(payload as Record<string, unknown>)[0];
    if (firstEntry) {
      const [field, value] = firstEntry;
      if (Array.isArray(value) && typeof value[0] === "string") {
        return `${field}: ${value[0]}`;
      }
      if (typeof value === "string") {
        return `${field}: ${value}`;
      }
    }
  }

  return "Request failed.";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isRegister = mode === "register";
  const nextPath = useMemo(() => {
    const nextValue = searchParams.get("next") || "/";
    return nextValue.startsWith("/") ? nextValue : "/";
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const normalizedUsername = username.trim();
    const normalizedPassword = password.trim();

    if (!normalizedUsername || !normalizedPassword) {
      setErrorMessage("Username and password are required.");
      return;
    }

    const payload: Record<string, unknown> = {
      username: normalizedUsername,
      password: normalizedPassword
    };

    if (isRegister) {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !passwordConfirm.trim()) {
        setErrorMessage("Email and password confirmation are required.");
        return;
      }

      payload.email = normalizedEmail;
      payload.password_confirm = passwordConfirm.trim();
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const body = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        setErrorMessage(normalizeApiError(body));
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setErrorMessage("Authentication request failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md p-6">
      <h1 className="text-lg font-semibold">{isRegister ? "Create account" : "Sign in"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isRegister
          ? "Create a LogLens AI account to upload and analyze logs."
          : "Sign in to manage sources, analyses, and exports."}
      </p>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm text-muted-foreground">
          Username
          <input
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </label>

        {isRegister && (
          <label className="block text-sm text-muted-foreground">
            Email
            <input
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
        )}

        <label className="block text-sm text-muted-foreground">
          Password
          <input
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
          />
        </label>

        {isRegister && (
          <label className="block text-sm text-muted-foreground">
            Confirm password
            <input
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg border border-primary bg-primary/20 px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
        >
          {isSubmitting ? "Submitting..." : isRegister ? "Create account" : "Sign in"}
        </button>
      </form>

      {errorMessage && (
        <p className="mt-4 rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Error: {errorMessage}
        </p>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        {isRegister ? "Already have an account?" : "Need an account?"}{" "}
        <Link href={isRegister ? "/login" : "/register"} className="text-primary underline underline-offset-4">
          {isRegister ? "Sign in" : "Register"}
        </Link>
      </p>
    </Card>
  );
}
