"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type FactoryAccount = {
  id: string;
  platform: "YOUTUBE" | "TIKTOK";
  name: string;
  expiresAt: string | null;
  createdAt: string;
};

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("ru-RU");
}

export default function FactoryAccountsPage() {
  const [accounts, setAccounts] = useState<FactoryAccount[]>([]);
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

  async function loadAccounts() {
    const response = await fetch("/api/factory/accounts", {
      cache: "no-store",
    });

    const data = (await response.json()) as {
      accounts: FactoryAccount[];
    };

    setAccounts(data.accounts);
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  function startEdit(account: FactoryAccount) {
    setError("");
    setEditingId(account.id);
    setEditingName(account.name);
  }

  function cancelEdit() {
    setEditingId("");
    setEditingName("");
    setError("");
  }

  async function saveAccountName(accountId: string) {
    setSavingId(accountId);
    setError("");

    try {
      const response = await fetch(`/api/factory/accounts/${accountId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editingName,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save account name");
      }

      setEditingId("");
      setEditingName("");
      await loadAccounts();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save account name",
      );
    } finally {
      setSavingId("");
    }
  }

  async function deleteAccount(account: FactoryAccount) {
    const confirmed = window.confirm(
      `Delete account "${account.name}"?\n\nThis account will be removed from publishing targets. Existing publishing history will remain.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(account.id);
    setError("");

    try {
      const response = await fetch(`/api/factory/accounts/${account.id}`, {
        method: "DELETE",
      });

      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to delete account");
      }

      await loadAccounts();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete account",
      );
    } finally {
      setDeletingId("");
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/">Home</Link>
          <Link href="/factory">Factory</Link>
          <Link href="/factory/super-upload">СУПЕР ЗАЛИВ</Link>
          <Link href="/factory/story-shorts">Story Shorts</Link>
          <Link href="/factory/movie-moments">Кино моменты</Link>
          <Link href="/factory/music">Музыка</Link>
          <Link href="/factory/long-video">Видео 16:9</Link>
          <Link href="/factory/assets">Character Videos</Link>
          <Link href="/factory/templates">Templates</Link>
          <Link href="/factory/accounts">Accounts</Link>
        </nav>

        <section className="card">
          <h1>Accounts</h1>

          <p>
            Connect one or more YouTube and TikTok accounts. After connecting
            accounts, you can choose which account receives which reaction
            template, such as Lana, Mia, or Amelia.
          </p>

          <div className="inline-actions">
            <a className="button" href="/api/factory/youtube/connect">
              Connect YouTube
            </a>

            <a className="button" href="/api/factory/tiktok/connect">
              Connect TikTok
            </a>
          </div>

          <p className="muted">
            TikTok currently uses draft upload flow. Generated videos are sent
            to TikTok for user review, and the user may need to confirm
            publishing inside the TikTok app.
          </p>
        </section>

        <section style={{ height: 24 }} />

        <section className="card">
          <h2>Connected accounts</h2>

          {error ? <p className="error">{error}</p> : null}

          <table className="table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Name</th>
                <th>Access until</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {accounts.map((account) => {
                const isEditing = editingId === account.id;
                const isSaving = savingId === account.id;
                const isDeleting = deletingId === account.id;

                return (
                  <tr key={account.id}>
                    <td>
                      <span className="badge">{account.platform}</span>
                    </td>

                    <td>
                      {isEditing ? (
                        <input
                          value={editingName}
                          onChange={(event) =>
                            setEditingName(event.target.value)
                          }
                          placeholder="Account name"
                          autoFocus
                        />
                      ) : (
                        <b>{account.name}</b>
                      )}
                    </td>

                    <td>{formatDate(account.expiresAt)}</td>

                    <td>{formatDate(account.createdAt)}</td>

                    <td>
                      {isEditing ? (
                        <div className="inline-actions">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => saveAccountName(account.id)}
                          >
                            {isSaving ? "Saving..." : "Save"}
                          </button>

                          <button
                            type="button"
                            className="secondary-button"
                            disabled={isSaving}
                            onClick={cancelEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="inline-actions">
                          <button
                            type="button"
                            onClick={() => startEdit(account)}
                          >
                            Rename
                          </button>

                          <button
                            type="button"
                            className="danger-button"
                            disabled={isDeleting}
                            onClick={() => deleteAccount(account)}
                          >
                            {isDeleting ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No connected accounts yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section style={{ height: 24 }} />

        <section className="card legal-links-card">
          <h2>Legal documents</h2>

          <p>
            Please review the Terms of Service and Privacy Policy before using
            Lana Content Factory or connecting third-party platform accounts.
          </p>

          <div className="inline-actions">
            <Link className="button secondary-button" href="/terms">
              Read Terms of Service
            </Link>

            <Link className="button secondary-button" href="/privacy">
              Read Privacy Policy
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
