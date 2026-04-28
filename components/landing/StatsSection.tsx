import { stats } from "@/components/landing/landing-data";

export default function StatsSection() {
  return (
    <section className="container content-section">
      <div className="content-panel">
        <div className="stats-grid">
          {stats.map((item) => (
            <div key={item.label} className="stat-card">
              <div className="stat-value">{item.value}</div>
              <div className="stat-label">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
