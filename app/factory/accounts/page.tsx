import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function FactoryAccountsPage() {
  const accounts = await prisma.factoryAccount.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/assets">Хуки и Лана</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card">
          <h1>Аккаунты</h1>
          <p>
            Сначала подключаем YouTube. После этого worker сможет сам заливать
            готовые Shorts на канал.
          </p>

          <a className="button" href="/api/factory/youtube/connect">
            Connect YouTube
          </a>
        </section>

        <section style={{ height: 24 }} />

        <section className="card">
          <h2>Подключенные аккаунты</h2>

          <table className="table">
            <thead>
              <tr>
                <th>Платформа</th>
                <th>Название</th>
                <th>Создан</th>
              </tr>
            </thead>

            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td><span className="badge">{account.platform}</span></td>
                  <td>{account.name}</td>
                  <td>{account.createdAt.toLocaleString("ru-RU")}</td>
                </tr>
              ))}

              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
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
