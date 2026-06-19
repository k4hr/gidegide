"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type FactoryAccount = {
  id: string;
  platform: "YOUTUBE" | "TIKTOK";
  name: string;
};

type FactoryTemplate = {
  id: string;
  name: string;
  isDefault: boolean;
};

type VkGroup = {
  id: string;
  name: string;
  url: string;
  category: string | null;
  isActive: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  candidates?: VkCandidate[];
};

type VkCandidate = {
  id: string;
  groupId: string;
  sourceVideoId: string;
  sourceUrl: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  score: number;
  isUsed: boolean;
  createdAt: string;
  group?: VkGroup;
};

type GroupsResponse = {
  groups?: VkGroup[];
  candidates?: VkCandidate[];
  message?: string;
  error?: string;
};

function getDefaultTemplateId(templates: FactoryTemplate[]) {
  return (
    templates.find((template) => template.isDefault)?.id ??
    templates[0]?.id ??
    ""
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "—";

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export default function SuperUploadPage() {
  const [groups, setGroups] = useState<VkGroup[]>([]);
  const [candidates, setCandidates] = useState<VkCandidate[]>([]);
  const [accounts, setAccounts] = useState<FactoryAccount[]>([]);
  const [templates, setTemplates] = useState<FactoryTemplate[]>([]);
  const [groupUrl, setGroupUrl] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [clipsCount, setClipsCount] = useState(6);
  const [clipSeconds, setClipSeconds] = useState(20);
  const [isAdding, setIsAdding] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [creatingCandidateId, setCreatingCandidateId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );

  async function loadAccounts() {
    const response = await fetch("/api/factory/accounts", { cache: "no-store" });
    const data = (await response.json()) as { accounts?: FactoryAccount[] };
    const nextAccounts = data.accounts ?? [];

    setAccounts(nextAccounts);

    const youtube = nextAccounts.find((account) => account.platform === "YOUTUBE");
    if (youtube && !selectedAccountId) {
      setSelectedAccountId(youtube.id);
    }
  }

  async function loadTemplates() {
    const response = await fetch("/api/factory/templates", { cache: "no-store" });
    const data = (await response.json()) as { templates?: FactoryTemplate[] };
    const nextTemplates = data.templates ?? [];

    setTemplates(nextTemplates);

    const defaultTemplateId = getDefaultTemplateId(nextTemplates);
    if (defaultTemplateId && !selectedTemplateId) {
      setSelectedTemplateId(defaultTemplateId);
    }
  }

  async function loadGroups() {
    const response = await fetch("/api/factory/vk-super-upload/groups", {
      cache: "no-store",
    });
    const data = (await response.json()) as GroupsResponse;

    if (!response.ok) {
      throw new Error(data.error ?? "Не получилось загрузить VK-группы");
    }

    setGroups(data.groups ?? []);
    setCandidates(data.candidates ?? []);
  }

  useEffect(() => {
    loadAccounts().catch(console.error);
    loadTemplates().catch(console.error);
    loadGroups().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addGroup() {
    setIsAdding(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/factory/vk-super-upload/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: groupUrl,
          name: groupName || null,
          category: "котики",
        }),
      });
      const data = (await response.json()) as GroupsResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось добавить VK-группу");
      }

      setGroupUrl("");
      setGroupName("");
      await loadGroups();
      setMessage(data.message ?? "VK-группа добавлена");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не получилось добавить VK-группу");
    } finally {
      setIsAdding(false);
    }
  }

  async function toggleGroup(group: VkGroup) {
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/factory/vk-super-upload/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: group.id, isActive: !group.isActive }),
      });
      const data = (await response.json()) as GroupsResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось обновить VK-группу");
      }

      await loadGroups();
      setMessage(data.message ?? "VK-группа обновлена");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не получилось обновить VK-группу");
    }
  }

  async function checkGroups() {
    setIsChecking(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/factory/vk-super-upload/groups/check", {
        method: "POST",
      });
      const data = (await response.json()) as GroupsResponse & {
        checked?: number;
        errors?: Array<{ message: string }>;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось проверить VK-группы");
      }

      await loadGroups();
      setMessage(data.message ?? "VK-группы проверены, кандидаты обновлены");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не получилось проверить VK-группы");
    } finally {
      setIsChecking(false);
    }
  }

  async function createFromCandidate(candidate: VkCandidate) {
    setCreatingCandidateId(candidate.id);
    setError("");
    setMessage("");

    try {
      if (!selectedAccountId) {
        throw new Error("Выбери YouTube/TikTok аккаунт");
      }

      if (!selectedTemplateId) {
        throw new Error("Выбери шаблон");
      }

      const response = await fetch("/api/factory/vk-super-upload/create-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          accountId: selectedAccountId,
          templateId: selectedTemplateId,
          clipsCount,
          clipSeconds,
          publishNow: true,
        }),
      });
      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось создать задачу");
      }

      await loadGroups();
      setMessage(data.message ?? "Задача создана");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не получилось создать задачу");
    } finally {
      setCreatingCandidateId("");
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/super-upload">Супер залив</Link>
          <Link href="/factory/story-shorts">Story Shorts</Link>
          <Link href="/factory/music">Музыка</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card">
          <h1>VK Супер залив</h1>
          <p>
            Добавляешь VK-группы с короткими смешными роликами, завод предлагает
            2–3 видео под нарезку, скачивает выбранное VK-видео, проверяет звук,
            режет его и генерирует русские названия из названия исходника.
          </p>

          <div className="grid grid-2">
            <label>
              Ссылка на VK-группу
              <input
                value={groupUrl}
                onChange={(event) => setGroupUrl(event.target.value)}
                placeholder="https://vk.com/..."
              />
            </label>

            <label>
              Название, необязательно
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Котики / мемы / животные"
              />
            </label>
          </div>

          <div className="inline-actions" style={{ marginTop: 14 }}>
            <button type="button" disabled={isAdding} onClick={addGroup}>
              {isAdding ? "Добавляю..." : "Добавить VK-группу"}
            </button>

            <button
              type="button"
              className="secondary-button"
              disabled={isChecking}
              onClick={checkGroups}
            >
              {isChecking ? "Ищу видео..." : "Предложить 2–3 видео"}
            </button>
          </div>

          {message ? <p className="success">{message}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </section>

        <section style={{ height: 24 }} />

        <section className="card">
          <h2>Настройки залива</h2>

          <div className="grid grid-2">
            <label>
              Аккаунт публикации
              <select
                value={selectedAccountId}
                onChange={(event) => setSelectedAccountId(event.target.value)}
              >
                {accounts.length === 0 ? <option value="">Нет аккаунтов</option> : null}
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.platform} · {account.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Шаблон
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
              >
                {templates.length === 0 ? <option value="">Нет шаблонов</option> : null}
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}{template.isDefault ? " — default" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Сколько нарезок сделать
              <input
                type="number"
                min={1}
                max={12}
                value={clipsCount}
                onChange={(event) =>
                  setClipsCount(Math.max(1, Math.min(12, Number(event.target.value) || 1)))
                }
              />
            </label>

            <label>
              Длина одной нарезки
              <select
                value={clipSeconds}
                onChange={(event) => setClipSeconds(Number(event.target.value))}
              >
                <option value={15}>15 секунд</option>
                <option value={20}>20 секунд</option>
                <option value={30}>30 секунд</option>
                <option value={45}>45 секунд</option>
              </select>
            </label>
          </div>

          <p className="muted">
            Сейчас выбран аккаунт: {selectedAccount ? `${selectedAccount.platform} · ${selectedAccount.name}` : "—"}.
            Названия и описания будут на русском. Хэштеги пока минимальные, потом можно доработать отдельно.
          </p>
        </section>

        <section style={{ height: 24 }} />

        <section className="card">
          <h2>Предложенные видео</h2>
          <p className="muted">
            Нажми “Предложить 2–3 видео”. Завод возьмет свежие кандидаты из активных VK-групп.
          </p>

          <div className="source-grid">
            {candidates.map((candidate) => (
              <article className="source-card" key={candidate.id}>
                {candidate.thumbnailUrl ? (
                  <img src={candidate.thumbnailUrl} alt="" className="source-thumb" />
                ) : (
                  <div className="source-thumb placeholder">VK</div>
                )}

                <div className="source-body">
                  <div className="source-head">
                    <span className="badge">{candidate.score}/100</span>
                    <span className="muted">{formatDuration(candidate.durationSeconds)}</span>
                  </div>

                  <h3>{candidate.title}</h3>
                  <p className="muted">{candidate.group?.name ?? "VK-группа"}</p>
                  <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="success">
                    открыть VK-видео
                  </a>

                  <button
                    type="button"
                    disabled={Boolean(creatingCandidateId)}
                    onClick={() => createFromCandidate(candidate)}
                  >
                    {creatingCandidateId === candidate.id ? "Создаю..." : `Взять в работу · ${clipsCount} нарезок`}
                  </button>
                </div>
              </article>
            ))}
          </div>

          {candidates.length === 0 ? (
            <p className="muted">Пока нет кандидатов. Добавь VK-группу и нажми “Предложить 2–3 видео”.</p>
          ) : null}
        </section>

        <section style={{ height: 24 }} />

        <section className="card">
          <h2>VK-группы</h2>

          <table className="table">
            <thead>
              <tr>
                <th>Группа</th>
                <th>Статус</th>
                <th>Проверка</th>
                <th>Действие</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td>
                    <b>{group.name}</b>
                    <p className="muted" style={{ wordBreak: "break-all" }}>{group.url}</p>
                    {group.lastError ? <p className="error">{group.lastError}</p> : null}
                  </td>
                  <td>
                    <span className="badge">{group.isActive ? "ACTIVE" : "OFF"}</span>
                  </td>
                  <td className="muted">{formatDate(group.lastCheckedAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => toggleGroup(group)}
                    >
                      {group.isActive ? "Выключить" : "Включить"}
                    </button>
                  </td>
                </tr>
              ))}

              {groups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    VK-групп пока нет.
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
