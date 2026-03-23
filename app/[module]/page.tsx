import { notFound } from "next/navigation";
import { appModules } from "../../lib/modules";

type ModulePageProps = {
  params: Promise<{ module: string }>;
};

export async function generateStaticParams() {
  return appModules.map((module) => ({ module: module.slug }));
}

export default async function ModulePage({ params }: ModulePageProps) {
  const { module: moduleSlug } = await params;
  const moduleItem = appModules.find((item) => item.slug === moduleSlug);

  if (!moduleItem) {
    notFound();
  }

  return (
    <section className="module-view">
      <div className="module-hero card">
        <p className="text-muted text-xs">Module</p>
        <h1>{moduleItem.label}</h1>
        <p>{moduleItem.description}</p>
      </div>

      <div className="module-grid">
        <article className="card">
          <p className="text-muted text-xs">Overview</p>
          <h3>Operational status</h3>
          <p>This content zone renders by route. Add module-specific widgets and API data here.</p>
        </article>

        <article className="card">
          <p className="text-muted text-xs">Insights</p>
          <h3>Recent activity</h3>
          <p>Use this panel for KPI summaries, charts, or alerts tied to {moduleItem.label}.</p>
        </article>

        <article className="card">
          <p className="text-muted text-xs">Actions</p>
          <h3>Quick controls</h3>
          <p>Pin key flows, forms, and automations for rapid operator access.</p>
        </article>
      </div>
    </section>
  );
}
