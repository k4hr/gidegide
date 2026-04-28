import { ShieldCheck } from "lucide-react";

export default function InfoSection() {
  return (
    <section id="inside" className="container content-section">
      <div className="content-panel">
        <div className="section-label">
          <ShieldCheck size={16} />
          Что получает покупатель
        </div>

        <h2 className="section-title">Закрытая статья без воды</h2>

        <p className="section-text">
          После покупки открывается уникальная ссылка на материал. Пользователь
          не регистрируется, не создаёт личный кабинет и не помнит пароль.
          Только email и доступ к закрытой статье.
        </p>
      </div>
    </section>
  );
}
