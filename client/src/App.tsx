
import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

// Uses Vercel's VITE_API_URL in production and localhost for local development.
const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:4000/api"
).replace(/\/+$/, "");

type User = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "OWNER" | "VIEWER";
};

type DocumentItem = {
  id: string;
  title: string;
  originalName: string;
  mimeType?: string;
  category?: string | null;
  sizeBytes: number | string;
  createdAt: string;
  ownerId?: string;
};

type ActivityItem = {
  id: string;
  userId?: string | null;
  action: string;
  success: boolean;
  timestamp: string;
  details?: unknown;
};

type PermissionItem = {
  id?: string;
  userId: string;
  level: "READ" | "EDIT";
  grantedAt?: string;
  user?: {
    name?: string;
    email?: string;
  };
};

async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Request failed (${response.status})`);
  }

  return data as T;
}

function formatSize(value: number | string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function extractDocuments(data: any): DocumentItem[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.documents)) return data.documents;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function extractPermissions(data: any): PermissionItem[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.permissions)) return data.permissions;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("General");

  const [sharingDocument, setSharingDocument] = useState<DocumentItem | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareLevel, setShareLevel] = useState<"READ" | "EDIT">("READ");
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);

  const [activityDocument, setActivityDocument] = useState<DocumentItem | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const showError = (value: unknown) => {
    setError(value instanceof Error ? value.message : "Something went wrong.");
    setMessage("");
  };

  const loadDocuments = useCallback(async () => {
    const data = await apiRequest("/documents");
    setDocuments(extractDocuments(data));
  }, []);

  const loadCurrentUser = useCallback(async () => {
    try {
      const data = await apiRequest<any>("/auth/me");
      const currentUser = data?.user ?? data;
      if (currentUser?.id && currentUser?.email) {
        setUser(currentUser as User);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, []);

  // Refresh the document list periodically so revoked shares disappear
  // from the viewer's dashboard without requiring a manual page refresh.
  useEffect(() => {
    if (!user) return;

    let active = true;
    const refreshDocuments = async () => {
      try {
        const data = await apiRequest("/documents");
        if (active) setDocuments(extractDocuments(data));
      } catch {
        // Keep the current list during temporary network errors.
      }
    };

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void refreshDocuments();
      }
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [user]);


  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const data = await apiRequest<any>("/auth/me");
        const currentUser = data?.user ?? data;
        if (mounted && currentUser?.id && currentUser?.email) {
          setUser(currentUser as User);
          const docs = await apiRequest("/documents");
          if (mounted) setDocuments(extractDocuments(docs));
        }
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void initialize();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const path = authMode === "login" ? "/auth/login" : "/auth/register";
      const body =
        authMode === "login"
          ? { email, password }
          : { name, email, password };

      await apiRequest(path, {
        method: "POST",
        body: JSON.stringify(body),
      });

      await loadCurrentUser();
      await loadDocuments();
      setMessage(authMode === "login" ? "Welcome back!" : "Account created successfully.");
      setPassword("");
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setError("");
    try {
      await apiRequest("/auth/logout", { method: "POST" });
      setUser(null);
      setDocuments([]);
      setMessage("You have signed out securely.");
      setSharingDocument(null);
    } catch (err) {
      showError(err);
    }
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Please choose a file first.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title.trim() || file.name);
      formData.append("category", category);

      await apiRequest("/documents", {
        method: "POST",
        body: formData,
      });

      setFile(null);
      setTitle("");
      const input = document.getElementById("document-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await loadDocuments();
      setMessage("Document uploaded successfully.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      if (/authentication required|unauthorized|session expired/i.test(message)) {
        setError("Your sign-in session was not accepted by the server. Please sign out, sign in again, and retry. If this continues, the backend upload route must be checked.");
        setMessage("");
      } else {
        showError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview(doc: DocumentItem) {
    setError("");
    setMessage("");

    // Open the tab immediately so browsers do not block it as a popup.
    const previewTab = window.open("about:blank", "_blank");

    try {
      const response = await fetch(
        `${API_URL}/documents/${encodeURIComponent(doc.id)}/preview`,
        { credentials: "include" },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.error || data?.message || `Preview failed (${response.status}).`,
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (previewTab) {
        previewTab.location.href = url;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }

      // Keep the object URL alive while the preview tab loads.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage(`Preview opened for "${doc.title}".`);
    } catch (err) {
      previewTab?.close();
      showError(err);
    }
  }

  async function handleDownload(doc: DocumentItem) {
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `${API_URL}/documents/${encodeURIComponent(doc.id)}/download`,
        { credentials: "include" },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || data?.message || "Download failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = doc.originalName || doc.title || "document";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(`Downloaded "${doc.title}".`);
    } catch (err) {
      showError(err);
    }
  }

  async function openSharing(doc: DocumentItem) {
    setSharingDocument(doc);
    setShareEmail("");
    setShareLevel("READ");
    setPermissions([]);
    setError("");
    setMessage("");
    setLoadingPermissions(true);

    try {
      const data = await apiRequest(
        `/documents/${encodeURIComponent(doc.id)}/permissions`,
      );
      setPermissions(extractPermissions(data));
    } catch (err) {
      showError(err);
    } finally {
      setLoadingPermissions(false);
    }
  }

  async function openActivity(doc: DocumentItem) {
    setActivityDocument(doc);
    setActivity([]);
    setError("");
    setMessage("");
    setLoadingActivity(true);

    try {
      const data = await apiRequest<any>(
        `/audit/documents/${encodeURIComponent(doc.id)}`,
      );
      const events = Array.isArray(data?.activity)
        ? data.activity
        : Array.isArray(data?.events)
          ? data.events
          : [];
      setActivity(events as ActivityItem[]);
    } catch (err) {
      showError(err);
    } finally {
      setLoadingActivity(false);
    }
  }

  function formatAction(action: string) {
    return action
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  async function handleGrantPermission(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sharingDocument) return;

    setSharingBusy(true);
    setError("");
    setMessage("");

    try {
      await apiRequest(
        `/documents/${encodeURIComponent(sharingDocument.id)}/permissions`,
        {
          method: "POST",
          body: JSON.stringify({
            email: shareEmail.trim(),
            level: shareLevel,
          }),
        },
      );

      setMessage(`Permission granted to ${shareEmail.trim()}.`);
      setShareEmail("");
      const data = await apiRequest(
        `/documents/${encodeURIComponent(sharingDocument.id)}/permissions`,
      );
      setPermissions(extractPermissions(data));
    } catch (err) {
      showError(err);
    } finally {
      setSharingBusy(false);
    }
  }

  async function handleRevokePermission(permission: PermissionItem) {
    if (!sharingDocument) return;

    // The backend DELETE route expects the permission record ID, not the user's ID.
    if (!permission.id) {
      showError(
        new Error(
          "Permission ID is missing. Refresh the sharing list and try again.",
        ),
      );
      return;
    }

    const confirmed = window.confirm(
      `Revoke ${permission.level} access for ${
        permission.user?.email || permission.userId
      }?`,
    );
    if (!confirmed) return;

    setSharingBusy(true);
    setError("");
    setMessage("");

    try {
      await apiRequest(
        `/documents/${encodeURIComponent(sharingDocument.id)}/permissions/${encodeURIComponent(permission.id)}`,
        { method: "DELETE" },
      );

      setPermissions((current) =>
        current.filter((item) => item.id !== permission.id),
      );
      setMessage("Document access revoked successfully.");
    } catch (err) {
      showError(err);
    } finally {
      setSharingBusy(false);
    }
  }

  const filteredDocuments = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return documents;

    return documents.filter((doc) =>
      [doc.title, doc.originalName, doc.category || ""].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [documents, search]);

  const totalBytes = documents.reduce(
    (total, doc) => total + Number(doc.sizeBytes || 0),
    0,
  );

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="loading-mark">T</div>
        <p>Securing your workspace...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-screen">
        <div className="auth-glow auth-glow-one" />
        <div className="auth-glow auth-glow-two" />
        <section className="auth-card">
          <div className="brand">
            <span className="brand-mark">T</span>
            <span>Trust<span className="accent">Vault</span></span>
          </div>

          <div className="auth-heading">
            <span className="eyebrow">YOUR DOCUMENTS. YOUR CONTROL.</span>
            <h1>{authMode === "login" ? "Welcome back." : "Create your vault."}</h1>
            <p>
              {authMode === "login"
                ? "Sign in to access your secure workspace."
                : "Create an account to securely manage your documents."}
            </p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {message && <div className="alert alert-success">{message}</div>}

          <form className="auth-form" onSubmit={handleAuth}>
            {authMode === "register" && (
              <label>
                Full name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  required
                  autoComplete="name"
                />
              </label>
            )}

            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 12 characters"
                required
                minLength={authMode === "register" ? 12 : 1}
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
              />
            </label>

            <button className="button button-primary button-full" disabled={busy}>
              {busy
                ? "Please wait..."
                : authMode === "login"
                  ? "Sign in securely →"
                  : "Create account →"}
            </button>
          </form>

          <p className="auth-switch">
            {authMode === "login" ? "New to TrustVault?" : "Already have an account?"}
            <button
              className="text-button"
              onClick={() => {
                setAuthMode(authMode === "login" ? "register" : "login");
                setError("");
                setMessage("");
              }}
              type="button"
            >
              {authMode === "login" ? "Create account" : "Sign in"}
            </button>
          </p>

          <div className="auth-security">
            <span className="status-dot" />
            Protected by secure sessions and server-side permissions
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="background-glow background-glow-one" />
      <div className="background-glow background-glow-two" />

      <header className="topbar">
        <a className="brand" href="#home" aria-label="TrustVault home">
          <span className="brand-mark">T</span>
          <span>Trust<span className="accent">Vault</span></span>
        </a>

        <div className="topbar-actions">
          <span className="session-status">
            <span className="status-dot" /> Secure session active
          </span>
          <button className="button button-outline button-small" onClick={handleLogout}>
            Sign out ↗
          </button>
        </div>
      </header>

      <section className="welcome-row">
        <div>
          <span className="eyebrow">YOUR PRIVATE WORKSPACE</span>
          <h1>Welcome back, <span className="accent">{user.name}</span>.</h1>
          <p>Your workspace is ready. Your documents, your control.</p>
        </div>
        <div className="account-chip">
          <span className="status-dot" />
          {user.role} ACCOUNT
        </div>
      </section>

      {error && (
        <div className="alert alert-error" role="alert">
          <span>!</span> {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">×</button>
        </div>
      )}
      {message && (
        <div className="alert alert-success" role="status">
          <span>✓</span> {message}
          <button onClick={() => setMessage("")} aria-label="Dismiss message">×</button>
        </div>
      )}

      <div className="security-banner">
        <span className="banner-icon">✓</span>
        <span>Protected workspace</span>
        <span className="banner-divider">·</span>
        <span>Access checks and audit events enabled</span>
      </div>

      <section className="stats-grid">
        <article className="stat-card">
          <span className="stat-icon">▤</span>
          <span className="stat-label">Your documents</span>
          <strong>{documents.length}</strong>
          <span className="stat-caption">Available in your workspace</span>
        </article>
        <article className="stat-card">
          <span className="stat-icon">◇</span>
          <span className="stat-label">Account role</span>
          <strong className="role-value">{user.role}</strong>
          <span className="stat-caption">Role-based access control</span>
        </article>
        <article className="stat-card">
          <span className="stat-icon">⇧</span>
          <span className="stat-label">Stored file size</span>
          <strong>{formatSize(totalBytes)}</strong>
          <span className="stat-caption">Total listed document size</span>
        </article>
      </section>

      <section className="workspace-grid">
        <article className="panel upload-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ADD TO YOUR VAULT</span>
              <h2>Upload a document</h2>
            </div>
            <span className="panel-icon">↑</span>
          </div>

          <form onSubmit={handleUpload} className="upload-form">
            <label className={`file-drop ${file ? "file-selected" : ""}`} htmlFor="document-file">
              <span className="upload-icon">↑</span>
              <strong>{file ? file.name : "Choose a file"}</strong>
              <span>{file ? formatSize(file.size) : "PDF, PNG, JPG, TXT, DOCX · Max 10 MB"}</span>
              <input
                id="document-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt,.docx"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                required
              />
            </label>

            <label>
              Document title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Project proposal"
                maxLength={150}
              />
            </label>

            <label>
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option>General</option>
                <option>Academic</option>
                <option>Personal</option>
                <option>Work</option>
                <option>Finance</option>
                <option>Legal</option>
                <option>Project</option>
              </select>
            </label>

            <button className="button button-primary button-full" disabled={busy}>
              {busy ? "Uploading..." : "Upload securely ↗"}
            </button>
            <p className="form-footnote">
              Your files are stored privately. Access is checked by the server.
            </p>
          </form>
        </article>

        <article className="panel documents-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">YOUR FILE LIBRARY</span>
              <h2>My documents <span className="count-badge">{documents.length}</span></h2>
              <p>Browse and manage your accessible files.</p>
            </div>
            <button
              className="icon-button"
              onClick={() => {
                setError("");
                void loadDocuments().catch(showError);
              }}
              title="Refresh documents"
              aria-label="Refresh documents"
            >
              ↻
            </button>
          </div>

          <div className="search-box">
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search documents or categories..."
              aria-label="Search documents"
            />
            {search && (
              <button onClick={() => setSearch("")} aria-label="Clear search">×</button>
            )}
          </div>

          {filteredDocuments.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">▤</span>
              <strong>{search ? "No matching documents" : "Your vault is ready"}</strong>
              <p>
                {search
                  ? "Try a different title or category."
                  : "Upload a document to see it listed here."}
              </p>
            </div>
          ) : (
            <div className="document-list">
              {filteredDocuments.map((doc) => (
                <article className="document-item" key={doc.id}>
                  <div className="document-type-icon">▧</div>
                  <div className="document-details">
                    <strong title={doc.title}>{doc.title}</strong>
                    <span>
                      {doc.category || "General"} <span className="meta-dot">·</span>{" "}
                      {formatSize(doc.sizeBytes)}
                    </span>
                    <small>
                      {doc.createdAt
                        ? new Date(doc.createdAt).toLocaleDateString()
                        : "Date unavailable"}
                    </small>
                  </div>
                  <div className="document-actions">
                    <button
                      className="button button-outline button-small"
                      onClick={() => void handlePreview(doc)}
                    >
                      ◉ Preview
                    </button>
                    <button
                      className="button button-outline button-small"
                      onClick={() => void handleDownload(doc)}
                    >
                      ↓ Download
                    </button>
                    {doc.ownerId === user.id && (
                      <>
                        <button
                          className="button button-outline button-small"
                          onClick={() => void openActivity(doc)}
                        >
                          ◷ Activity
                        </button>
                        <button
                          className="button button-share button-small"
                          onClick={() => void openSharing(doc)}
                        >
                          <span>♧</span> Share
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="list-footer">
            <span><span className="status-dot" /> Server-protected access</span>
            <span>{filteredDocuments.length} shown</span>
          </div>
        </article>
      </section>

      <footer className="app-footer">
        <span className="brand-mark footer-mark">T</span>
        TrustVault · Secure document sharing with an audit trail.
      </footer>

      {activityDocument && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActivityDocument(null);
          }}
        >
          <section
            className="share-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">AUDIT TRAIL</span>
                <h2 id="activity-title">Document activity</h2>
                <p className="modal-document-name">{activityDocument.title}</p>
              </div>
              <button
                className="icon-button modal-close"
                onClick={() => setActivityDocument(null)}
                aria-label="Close activity dialog"
              >
                ×
              </button>
            </div>

            <div className="permissions-section">
              <div className="permissions-title">
                <div>
                  <h3>Views and downloads</h3>
                  <p>Recorded server-side activity for this document.</p>
                </div>
                <span className="count-badge">{activity.length}</span>
              </div>

              {loadingActivity ? (
                <div className="permissions-empty">Loading activity...</div>
              ) : activity.length === 0 ? (
                <div className="permissions-empty">
                  <span>◷</span>
                  <strong>No activity recorded yet</strong>
                  <p>Views and downloads will appear here when logged by the server.</p>
                </div>
              ) : (
                <div className="permission-list">
                  {activity.map((item) => (
                    <div className="permission-item" key={item.id}>
                      <div className="avatar-circle">{item.success ? "✓" : "!"}</div>
                      <div className="permission-user">
                        <strong>{formatAction(item.action)}</strong>
                        <span>User ID: {item.userId || "Unavailable"}</span>
                        <small>
                          {item.timestamp
                            ? new Date(item.timestamp).toLocaleString()
                            : "Time unavailable"}
                        </small>
                      </div>
                      <span className={`permission-badge ${item.success ? "edit" : "read"}`}>
                        {item.success ? "SUCCESS" : "FAILED"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              className="button button-outline button-full modal-done"
              onClick={() => setActivityDocument(null)}
            >
              Close
            </button>
          </section>
        </div>
      )}

      {sharingDocument && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSharingDocument(null);
          }}
        >
          <section
            className="share-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">DOCUMENT ACCESS</span>
                <h2 id="share-title">Share document</h2>
                <p className="modal-document-name">{sharingDocument.title}</p>
              </div>
              <button
                className="icon-button modal-close"
                onClick={() => setSharingDocument(null)}
                aria-label="Close sharing dialog"
              >
                ×
              </button>
            </div>

            <form className="share-form" onSubmit={handleGrantPermission}>
              <label>
                Registered user's email
                <input
                  type="email"
                  value={shareEmail}
                  onChange={(event) => setShareEmail(event.target.value)}
                  placeholder="person@example.com"
                  required
                />
              </label>

              <label>
                Permission level
                <select
                  value={shareLevel}
                  onChange={(event) => setShareLevel(event.target.value as "READ" | "EDIT")}
                >
                  <option value="READ">READ — view and download</option>
                  <option value="EDIT">EDIT — editing permission</option>
                </select>
              </label>

              <div className="permission-hint">
                <span>ⓘ</span>
                <span>
                  Only share with people you trust. Permissions are enforced by the server.
                  EDIT enables only editing operations implemented by this application.
                </span>
              </div>

              <button className="button button-primary button-full" disabled={sharingBusy}>
                {sharingBusy ? "Please wait..." : "Grant access →"}
              </button>
            </form>

            <div className="permissions-section">
              <div className="permissions-title">
                <div>
                  <h3>People with access</h3>
                  <p>Manage current document permissions.</p>
                </div>
                <span className="count-badge">{permissions.length}</span>
              </div>

              {loadingPermissions ? (
                <div className="permissions-empty">Loading permissions...</div>
              ) : permissions.length === 0 ? (
                <div className="permissions-empty">
                  <span>♧</span>
                  <strong>No shared users yet</strong>
                  <p>Grant access above to share this document.</p>
                </div>
              ) : (
                <div className="permission-list">
                  {permissions.map((permission) => (
                    <div className="permission-item" key={permission.id || permission.userId}>
                      <div className="avatar-circle">
                        {(permission.user?.name || permission.user?.email || "?")
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <div className="permission-user">
                        <strong>{permission.user?.name || "Registered user"}</strong>
                        <span>{permission.user?.email || permission.userId}</span>
                      </div>
                      <span className={`permission-badge ${permission.level.toLowerCase()}`}>
                        {permission.level}
                      </span>
                      <button
                        className="revoke-button"
                        disabled={sharingBusy}
                        onClick={() => void handleRevokePermission(permission)}
                        title="Revoke access"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              className="button button-outline button-full modal-done"
              onClick={() => setSharingDocument(null)}
            >
              Done
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
