
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import App from "./App";
import { supabase, hasSupabaseConfig } from "./lib";

export default function AuthGate() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const preparedUser = useRef<string | null>(null);

  async function prepareWorkspace(currentSession: Session) {
    if (!supabase || preparedUser.current === currentSession.user.id) return;

    preparedUser.current = currentSession.user.id;
    setWorkspaceBusy(true);
    setError("");

    try {
      // An invited account must join its inviter's workspace before the
      // ordinary first-login workspace creation fallback can run.
      const { data: acceptedWorkspaceId, error: invitationError } =
        await supabase.rpc("accept_my_workspace_invitation");
      if (invitationError) {
        const missingInvitationRpc =
          ["PGRST202", "42883"].includes(String(invitationError.code || ""));
        const isInvitedAccount = Boolean(
          currentSession.user.user_metadata?.workspace_invitation_id
        );

        // Existing users may sign in before the invitation migration.
        // Invited users must never fall through to new-workspace creation.
        if (!missingInvitationRpc || isInvitedAccount) {
          throw invitationError;
        }
      }

      if (acceptedWorkspaceId) {
        setWorkspaceId(acceptedWorkspaceId);
        setWorkspaceReady(true);
        return;
      }

      const { data: members, error: memberError } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .limit(1);

      if (memberError) throw memberError;

      let resolvedWorkspaceId: string | null =
        members?.[0]?.workspace_id ?? null;

      if (!resolvedWorkspaceId) {
        const name =
          currentSession.user.user_metadata?.full_name ||
          currentSession.user.email?.split("@")[0] ||
          "My";

        const { data: createdWorkspaceId, error: createError } =
          await supabase.rpc("create_workspace", {
            p_name: `${name}'s Workspace`
          });

        if (createError) throw createError;
        if (!createdWorkspaceId) {
          throw new Error("Workspace was created but no ID was returned.");
        }

        resolvedWorkspaceId = createdWorkspaceId;
      }

      setWorkspaceId(resolvedWorkspaceId);
      setWorkspaceReady(true);
    } catch (err) {
      preparedUser.current = null;
      setError(
        err instanceof Error
          ? err.message
          : "Could not prepare your workspace."
      );
    } finally {
      setWorkspaceBusy(false);
    }
  }

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    let alive = true;

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!alive) return;

      setSession(nextSession);
      setAuthReady(true);

      if (!nextSession) {
        preparedUser.current = null;
        setWorkspaceReady(false);
        return;
      }

      window.setTimeout(() => {
        if (alive) void prepareWorkspace(nextSession);
      }, 0);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;

      if (error) {
        setError(error.message);
        setAuthReady(true);
        return;
      }

      if (data.session) {
        setSession(data.session);
        void prepareWorkspace(data.session);
      } else {
        setAuthReady(true);
      }
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!supabase) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() }
          }
        });

        if (error) throw error;

        if (!data.session) {
          setNotice(
            "Account created! Check your email to confirm your account, then log in."
          );
        } else {
          setNotice("Account created. Preparing your workspace...");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) throw error;
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setBusy(false);
    }
  }

  const pageStyle = {
    minHeight: "100vh",
    background: "#080D19",
    color: "#F5F7FC",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "Inter, Arial, sans-serif"
  } as const;

  const cardStyle = {
    width: "100%",
    maxWidth: "430px",
    padding: "36px",
    background: "#111A2D",
    border: "1px solid #263550",
    borderRadius: "18px",
    boxSizing: "border-box" as const
  };

  const inputStyle = {
    width: "100%",
    padding: "13px",
    marginTop: "8px",
    borderRadius: "8px",
    border: "1px solid #34445F",
    background: "#080D19",
    color: "white",
    boxSizing: "border-box" as const,
    fontSize: "15px"
  };

  if (!hasSupabaseConfig || !supabase) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1>MAEKRAVON OS</h1>
          <p>Supabase configuration is missing. Check your .env.local file.</p>
        </div>
      </main>
    );
  }

  if (!authReady || (session && workspaceBusy)) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h2>MAEKRAVON OS</h2>
          <p>Preparing your secure workspace...</p>
        </div>
      </main>
    );
  }

  if (session && error) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h2>Workspace setup issue</h2>
          <p style={{ color: "#FCA5A5" }}>{error}</p>
          <button
            onClick={() => void prepareWorkspace(session)}
            style={inputStyle}
          >
            Try again
          </button>
          <button
            onClick={() => void supabase?.auth.signOut()}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            Sign out
          </button>
        </div>
      </main>
    );
  }

  if (session && workspaceReady && workspaceId) {
    return (
      <>
        <App workspaceId={workspaceId} />
        <button
          onClick={() => void supabase?.auth.signOut()}
          style={{
            position: "fixed",
            bottom: "18px",
            right: "18px",
            zIndex: 9999,
            padding: "10px 16px",
            background: "#17233B",
            color: "white",
            border: "1px solid #34445F",
            borderRadius: "8px",
            cursor: "pointer"
          }}
        >
          Sign out
        </button>
      </>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ color: "#56D6E8", fontSize: "13px", letterSpacing: "3px" }}>
          CONTROL EVERYTHING
        </div>

        <h1 style={{ fontSize: "32px", marginBottom: "8px" }}>
          MAEKRAVON<span style={{ color: "#56D6E8" }}> OS</span>
        </h1>

        <p style={{ color: "#A5B2C9", marginBottom: "28px" }}>
          {mode === "login"
            ? "Welcome back. Sign in to your workspace."
            : "Create your account and launch your workspace."}
        </p>

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label>
              Full name
              <input
                style={inputStyle}
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                placeholder="Your name"
              />
            </label>
          )}

          <label style={{ display: "block", marginTop: "18px" }}>
            Email address
            <input
              style={inputStyle}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@business.com"
            />
          </label>

          <label style={{ display: "block", marginTop: "18px" }}>
            Password
            <input
              style={inputStyle}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="At least 6 characters"
            />
          </label>

          {error && (
            <p style={{ color: "#FCA5A5", fontSize: "14px" }}>{error}</p>
          )}

          {notice && (
            <p style={{ color: "#56D6E8", fontSize: "14px" }}>{notice}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              ...inputStyle,
              marginTop: "24px",
              background: "#287FCE",
              border: "none",
              fontWeight: "bold",
              cursor: "pointer"
            }}
          >
            {busy
              ? "Please wait..."
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: "24px", color: "#A5B2C9" }}>
          {mode === "login"
            ? "New to MAEKRAVON? "
            : "Already have an account? "}
          <button
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError("");
              setNotice("");
            }}
            style={{
              background: "none",
              border: "none",
              color: "#56D6E8",
              cursor: "pointer",
              fontWeight: "bold"
            }}
          >
            {mode === "login" ? "Create account" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
