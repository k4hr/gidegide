"use client";

import type { FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Mail, X } from "lucide-react";

import type { Lesson } from "@/components/landing/types";

type CheckoutModalProps = {
  lesson: Lesson | null;
  email: string;
  isBuying: boolean;
  error: string;
  onEmailChange: (email: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function CheckoutModal({
  lesson,
  email,
  isBuying,
  error,
  onEmailChange,
  onClose,
  onSubmit,
}: CheckoutModalProps) {
  return (
    <AnimatePresence>
      {lesson ? (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
        >
          <motion.div
            className="modal-card"
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 18 }}
            transition={{ duration: 0.2 }}
          >
            <button type="button" className="modal-close" onClick={onClose}>
              <X size={18} />
            </button>

            <div className={`modal-icon modal-icon--${lesson.theme}`}>
              <lesson.icon size={34} />
            </div>

            <h3 className="modal-title">{lesson.title}</h3>

            <p className="modal-text">
              Введи email. Сейчас в MVP доступ откроется сразу. После
              подключения платёжки здесь будет оплата и автоматическая выдача
              ссылки.
            </p>

            <div className="modal-price">
              <div>
                <div className="modal-price-label">Стоимость урока</div>
                <div className="modal-price-value">{lesson.price} ₽</div>
              </div>

              <div className="modal-old-price">
                вместо <span>{lesson.oldPrice} ₽</span>
              </div>
            </div>

            <form onSubmit={onSubmit}>
              <label className="modal-label">Email для доступа</label>

              <div className="modal-input-wrap">
                <Mail className="modal-input-icon" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="example@mail.com"
                  className="modal-input"
                />
              </div>

              {error ? <div className="modal-error">{error}</div> : null}

              <button
                disabled={isBuying}
                type="submit"
                className="gold-btn modal-submit"
              >
                {isBuying ? "Открываем доступ..." : "Получить доступ"}
                <ArrowRight size={18} />
              </button>
            </form>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
