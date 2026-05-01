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
        throw new Error(data.error ?? "Не получилось сохранить название");
      }

      setEditingId("");
      setEditingName("");
      await loadAccounts();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не получилось сохранить название",
      );
    } finally {
      setSavingId("");
    }
  }

  async function deleteAccount(account: FactoryAccount) {
    const confirmed = window.confirm(
      `Удалить аккаунт "${account.name}"?\n\nОн исчезнет из выбора публикации. Уже созданные публикации останутся в истории.`,
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
        throw new Error(data.error ?? "Не получилось удалить аккаунт");
      }

      await loadAccounts();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не получилось удалить аккаунт",
      );
    } finally {
      setDeletingId("");
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/assets">Видео персонажей</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card">
          <h1>Аккаунты</h1>
          <p>
            Подключи несколько YouTube и TikTok аккаунтов. Потом на странице
            завода можно выбрать, на какой аккаунт какой шаблон отправлять:
            Lana, Mia, Amelia или любой другой.
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
            TikTok сейчас работает в режиме draft upload: ролик отправляется в
            TikTok inbox/draft flow, после чего его нужно подтвердить в
            приложении TikTok.
          </p>
        </section>

        <section style={{ height: 24 }} />

        <section className="card">
          <h2>Подключенные аккаунты</h2>

          {error ? <p className="error">{error}</p> : null}

          <table className="table">
            <thead>
              <tr>
                <th>Платформа</th>
                <th>Название</th>
                <th>Доступ до</th>
                <th>Создан</th>
                <th>Действия</th>
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
                          placeholder="Название аккаунта"
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
                            {isSaving ? "Сохраняю..." : "Сохранить"}
                          </button>

                          <button
                            type="button"
                            className="secondary-button"
                            disabled={isSaving}
                            onClick={cancelEdit}
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <div className="inline-actions">
                          <button
                            type="button"
                            onClick={() => startEdit(account)}
                          >
                            Переименовать
                          </button>

                          <button
                            type="button"
                            className="danger-button"
                            disabled={isDeleting}
                            onClick={() => deleteAccount(account)}
                          >
                            {isDeleting ? "Удаляю..." : "Удалить"}
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
                    Пока аккаунтов нет.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
