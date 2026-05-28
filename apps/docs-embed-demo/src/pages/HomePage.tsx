import type { RouteDefinition } from "../types/routes.js";
import { PageIntro } from "../components/DemoUi.js";

export function HomePage({ routes }: { routes: RouteDefinition[] }) {
  const pageRoutes = routes.filter((route) => route.path !== "/");

  return (
    <section className="page-section" data-testid="home-page">
      <PageIntro
        eyebrow="Capability showcase"
        title="Workflow package demo and test harness"
        description="This app now exercises every public package surface in the workflow editor monorepo: parse and validation, graph projection, viewer rendering, ELK layout, full editing, Monaco lift-and-bridge behavior, save-flow state machines, and lower-level developer helpers."
      />

      <div className="hero-card">
        <div className="hero-card__content">
          <strong>What this app is for</strong>
          <p>
            Each route is designed to do two jobs at once: demonstrate a package capability and
            keep it easy to regression-test from the browser.
          </p>
        </div>
        <div className="hero-card__grid">
          <article className="status-card">
            <strong>Manual testing</strong>
            <p>Rich fixtures, visible debug panels, and focused pages for each public surface.</p>
          </article>
          <article className="status-card">
            <strong>Visual regression</strong>
            <p>Viewer, layout, editor, and Monaco routes are all screenshot-friendly.</p>
          </article>
          <article className="status-card">
            <strong>Integration confidence</strong>
            <p>Cross-surface document state is intentionally exercised instead of mocked away.</p>
          </article>
        </div>
      </div>

      <div className="route-grid">
        {pageRoutes.map((route) => (
          <a key={route.path} href={route.path} className="route-card">
            <strong>{route.label}</strong>
            <p>{route.description}</p>
            <span>Open route</span>
          </a>
        ))}
      </div>
    </section>
  );
}
