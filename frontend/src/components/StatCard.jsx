export default function StatCard({ label, value, note, icon: Icon, tone = 'blue' }) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={17} /></div></div>
      <strong>{value ?? '—'}</strong>
      <small>{note}</small>
    </article>
  );
}
