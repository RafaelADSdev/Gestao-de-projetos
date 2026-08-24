export default function DashboardLoading() {
  return (
    <div className="loading-layout" aria-label="Carregando conteúdo" aria-live="polite">
      <span className="loading-line title" />
      <span className="loading-line subtitle" />
      <div className="loading-cards">{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>
      <div className="loading-panel" />
    </div>
  );
}
