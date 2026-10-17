export const PageHeader = ({ eyebrow, title, accent, children }) => (
  <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between fade-up">
    <div>
      <div className="eyebrow mb-2">{eyebrow}</div>
      <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
        {title} {accent && <span className="font-serif-accent font-medium text-[#C0474A]">{accent}</span>}
      </h1>
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>
);
