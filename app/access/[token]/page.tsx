import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, Crown, LockKeyhole, Sparkles } from "lucide-react";

import { prisma } from "@/lib/prisma";

type AccessPageProps = {
  params: Promise<{
    token: string;
  }>;
};

function renderContent(content: string) {
  const lines = content.split("\n");

  return lines.map((line, index) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      return <div key={index} className="h-4" />;
    }

    if (trimmedLine.startsWith("# ")) {
      return (
        <h1
          key={index}
          className="mb-6 mt-2 text-4xl font-black tracking-[-0.05em] text-white md:text-6xl"
        >
          {trimmedLine.replace("# ", "")}
        </h1>
      );
    }

    if (trimmedLine.startsWith("## ")) {
      return (
        <h2
          key={index}
          className="mb-4 mt-10 text-2xl font-black tracking-[-0.03em] text-yellow-200 md:text-3xl"
        >
          {trimmedLine.replace("## ", "")}
        </h2>
      );
    }

    if (trimmedLine.startsWith("- ")) {
      return (
        <div
          key={index}
          className="mb-3 flex items-start gap-3 rounded-2xl border border-yellow-200/10 bg-black/25 p-4"
        >
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-300 text-black">
            <BadgeCheck className="h-4 w-4" />
          </span>
          <span className="font-bold leading-relaxed text-zinc-100">
            {trimmedLine.replace("- ", "")}
          </span>
        </div>
      );
    }

    const orderedMatch = trimmedLine.match(/^(\d+)\.\s(.+)$/);

    if (orderedMatch) {
      return (
        <div
          key={index}
          className="mb-3 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-4"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-yellow-200/40 bg-yellow-300/10 text-sm font-black text-yellow-200">
            {orderedMatch[1]}
          </span>
          <span className="font-bold leading-relaxed text-zinc-100">
            {orderedMatch[2]}
          </span>
        </div>
      );
    }

    return (
      <p key={index} className="mb-5 text-lg leading-relaxed text-zinc-300">
        {trimmedLine}
      </p>
    );
  });
}

export default async function AccessPage({ params }: AccessPageProps) {
  const { token } = await params;

  const order = await prisma.order.findUnique({
    where: {
      accessToken: token,
    },
    include: {
      lesson: true,
    },
  });

  if (!order || order.status !== "PAID") {
    notFound();
  }

  return (
    <main className="min-h-screen overflow-hidden bg-black text-[#fff7df]">
      <section className="relative min-h-screen bg-[radial-gradient(circle_at_50%_0%,rgba(255,208,91,0.24),transparent_34%),linear-gradient(180deg,#120c04_0%,#050505_46%,#000_100%)] px-5 py-8 md:px-8 lg:px-10">
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_20%_20%,rgba(255,255,255,.16)_0_1px,transparent_1px)] [background-size:54px_54px]" />
        <div className="absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-yellow-300/12 blur-[90px]" />

        <div className="relative mx-auto max-w-[1100px]">
          <header className="mb-8 flex items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-3 rounded-2xl border border-yellow-200/20 bg-black/40 px-4 py-3 text-sm font-black uppercase tracking-wide text-yellow-100 backdrop-blur-xl transition hover:border-yellow-200/50"
            >
              <ArrowLeft className="h-4 w-4" />
              На главную
            </Link>

            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-yellow-200/40 bg-black/45">
                <Crown className="h-6 w-6 text-yellow-300" />
              </div>
              <div className="hidden text-right md:block">
                <div className="font-black text-yellow-100">DESTROY</div>
                <div className="-mt-1 text-xs font-bold uppercase tracking-[0.25em] text-yellow-400/80">
                  ALGORITM
                </div>
              </div>
            </div>
          </header>

          <div className="mb-6 rounded-[2rem] border border-yellow-200/25 bg-[linear-gradient(135deg,rgba(255,224,140,0.14),rgba(255,186,57,0.03)),rgba(8,7,5,0.78)] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.48)] backdrop-blur-xl md:p-8">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-green-300/25 bg-green-400/10 px-4 py-2 text-sm font-black text-green-200">
              <LockKeyhole className="h-4 w-4" />
              Доступ открыт
            </div>

            <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <h1 className="text-4xl font-black uppercase tracking-[-0.06em] text-white md:text-6xl">
                  {order.lesson.title}
                </h1>

                <p className="mt-4 max-w-[760px] text-lg leading-relaxed text-zinc-300">
                  {order.lesson.subtitle}
                </p>
              </div>

              <div className="rounded-3xl border border-yellow-200/20 bg-black/35 p-5">
                <div className="text-sm font-bold uppercase tracking-wide text-zinc-400">
                  Покупка
                </div>
                <div className="mt-1 text-3xl font-black text-yellow-200">
                  {order.lesson.priceRub} ₽
                </div>
              </div>
            </div>
          </div>

          <article className="rounded-[2rem] border border-yellow-200/20 bg-[rgba(8,7,5,0.82)] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl md:p-10">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-yellow-200/20 bg-yellow-300/5 px-4 py-2 text-sm font-bold text-yellow-200">
              <Sparkles className="h-4 w-4" />
              Закрытый материал
            </div>

            <div>{renderContent(order.lesson.content)}</div>
          </article>

          <footer className="py-8 text-center text-sm font-bold text-zinc-500">
            Сохрани эту ссылку — по ней открывается купленный урок.
          </footer>
        </div>
      </section>
    </main>
  );
}
