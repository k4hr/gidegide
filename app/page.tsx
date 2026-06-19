"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import CheckoutModal from "@/components/landing/CheckoutModal";
import FaqSection from "@/components/landing/FaqSection";
import GrowthSection from "@/components/landing/GrowthSection";
import HeroSection from "@/components/landing/HeroSection";
import InfoSection from "@/components/landing/InfoSection";
import LessonsSection from "@/components/landing/LessonsSection";
import PackagesSection from "@/components/landing/PackagesSection";
import SiteFooter from "@/components/landing/SiteFooter";
import StatsSection from "@/components/landing/StatsSection";
import { getLesson } from "@/components/landing/landing-data";
import type { Lesson, Platform } from "@/components/landing/types";

export default function HomePage() {
  const [activeSlug, setActiveSlug] = useState<Platform>("instagram");
  const [checkoutLesson, setCheckoutLesson] = useState<Lesson | null>(null);
  const [email, setEmail] = useState("");
  const [isBuying, setIsBuying] = useState(false);
  const [error, setError] = useState("");

  const activeLesson = useMemo(() => getLesson(activeSlug), [activeSlug]);

  function openCheckout(lesson: Lesson) {
    setCheckoutLesson(lesson);
    setEmail("");
    setError("");
    setIsBuying(false);
  }

  function closeCheckout() {
    setCheckoutLesson(null);
    setIsBuying(false);
  }

  async function handleBuy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!checkoutLesson) return;

    setIsBuying(true);
    setError("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug: checkoutLesson.slug,
          email,
        }),
      });

      const data = (await response.json()) as {
        accessUrl?: string;
        error?: string;
      };

      if (!response.ok || !data.accessUrl) {
        throw new Error(data.error ?? "Не получилось создать заказ");
      }

      window.location.href = data.accessUrl;
    } catch (buyError) {
      setError(
        buyError instanceof Error
          ? buyError.message
          : "Ошибка покупки. Попробуй ещё раз.",
      );
      setIsBuying(false);
    }
  }

  return (
    <main className="site-page">
      <div className="site-noise" />

      <HeroSection activeLesson={activeLesson} onBuy={openCheckout} />

      <LessonsSection
        activeLesson={activeLesson}
        activeSlug={activeSlug}
        onChangeLesson={setActiveSlug}
        onBuy={openCheckout}
      />

      <GrowthSection onBuy={openCheckout} />
      <InfoSection />
      <PackagesSection onBuy={openCheckout} />
      <StatsSection />
      <FaqSection />
      <SiteFooter />

      <CheckoutModal
        lesson={checkoutLesson}
        email={email}
        isBuying={isBuying}
        error={error}
        onEmailChange={setEmail}
        onClose={closeCheckout}
        onSubmit={handleBuy}
      />
    </main>
  );
}
