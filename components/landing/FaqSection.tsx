import { BadgeCheck } from "lucide-react";

export default function FaqSection() {
  return (
    <section id="faq" className="container content-section last-section">
      <div className="content-panel">
        <div className="section-label">
          <BadgeCheck size={16} />
          FAQ
        </div>

        <h2 className="section-title">Частые вопросы</h2>

        <div className="info-grid">
          <div className="info-card">
            <h3>Нужна регистрация?</h3>
            <p>Нет. Покупатель выбирает урок, вводит email и получает ссылку.</p>
          </div>

          <div className="info-card">
            <h3>Это про накрутку?</h3>
            <p>Нет. Это обучающие материалы про алгоритмы, контент и аналитику.</p>
          </div>

          <div className="info-card">
            <h3>Что открывается после оплаты?</h3>
            <p>Закрытая статья по уникальной ссылке вида /access/secret-token.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
