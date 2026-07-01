import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="header-actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <section className="panel">
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}
