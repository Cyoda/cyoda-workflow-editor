import { useEffect, useState } from "react";
import { CriteriaEditorPage } from "./pages/CriteriaEditorPage.js";
import { EmbedViewerPage } from "./pages/EmbedViewerPage.js";
import { EditorShowcasePage } from "./pages/EditorShowcasePage.js";
import { HomePage } from "./pages/HomePage.js";
import { LayoutShowcasePage } from "./pages/LayoutShowcasePage.js";
import { LocalFileEditorPage } from "./pages/LocalFileEditorPage.js";
import { MonacoPlaygroundPage } from "./pages/MonacoPlaygroundPage.js";
import { OpsViewerPage } from "./pages/OpsViewerPage.js";
import { SaveFlowHarnessPage } from "./pages/SaveFlowHarnessPage.js";
import { UtilitiesPage } from "./pages/UtilitiesPage.js";
import { ViewerPlaygroundPage } from "./pages/ViewerPlaygroundPage.js";

type RoutePath =
  | "/"
  | "/viewer"
  | "/layout"
  | "/editor"
  | "/criteria"
  | "/monaco"
  | "/save-flow"
  | "/utilities"
  | "/embed"
  | "/ops-viewer"
  | "/local-file-editor";

interface RouteDefinition {
  path: RoutePath;
  label: string;
  description: string;
}

const routes: RouteDefinition[] = [
  {
    path: "/",
    label: "Overview",
    description: "What each capability page tests.",
  },
  {
    path: "/viewer",
    label: "Developer harness: Viewer playground",
    description: "Parse, validate, project, render, and inspect JSON fixtures.",
  },
  {
    path: "/layout",
    label: "Developer harness: Layout showcase",
    description: "Compare fallback rendering with ELK layout presets and pinning.",
  },
  {
    path: "/editor",
    label: "Developer harness: Editor showcase",
    description: "Full editor: states, transitions, criteria, processors, layout, comments, undo/redo, and clean exported JSON.",
  },
  {
    path: "/criteria",
    label: "Developer harness: Criteria editor",
    description: "Demo and regression page for the criterion editor with model-schema autocomplete wired to the StructuredTrade entity sample.",
  },
  {
    path: "/monaco",
    label: "Developer harness: Monaco playground",
    description: "Schema, markers, patch lifting, and selection sync.",
  },
  {
    path: "/save-flow",
    label: "Developer harness: Save-flow",
    description: "Simulate save confirmations, warnings, and conflict handling.",
  },
  {
    path: "/local-file-editor",
    label: "Dev Console local file editor",
    description: "Open a real workflow JSON file from disk, edit it in the full editor, and write back clean workflow JSON with overwrite protection.",
  },
  {
    path: "/ops-viewer",
    label: "Ops Console viewer",
    description: "Read-only environment-style workflow viewer with host-owned export, compare, and break-glass placeholders.",
  },
  {
    path: "/utilities",
    label: "Developer utilities",
    description: "Verify lower-level public helpers and patches.",
  },
  {
    path: "/embed",
    label: "Website viewer / embed",
    description: "Original slim viewer embed example.",
  },
];

function normalizePath(pathname: string): RoutePath | null {
  if (pathname === "/") return "/";
  if (pathname === "/examples") return "/viewer";
  if (pathname === "/viewer") return "/viewer";
  if (pathname === "/layout") return "/layout";
  if (pathname === "/editor") return "/editor";
  if (pathname === "/criteria") return "/criteria";
  if (pathname === "/monaco") return "/monaco";
  if (pathname === "/save-flow") return "/save-flow";
  if (pathname === "/local-file-editor") return "/local-file-editor";
  if (pathname === "/ops-viewer") return "/ops-viewer";
  if (pathname === "/utilities") return "/utilities";
  if (pathname === "/embed") return "/embed";
  return null;
}

function useRoutePath() {
  const [routePath, setRoutePath] = useState(() => normalizePath(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => setRoutePath(normalizePath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (path: RoutePath) => {
    if (window.location.pathname === path) return;
    window.history.pushState({}, "", path);
    setRoutePath(path);
  };

  return { routePath, navigate };
}

function NavLink({
  href,
  currentPath,
  label,
  onNavigate,
}: {
  href: RoutePath;
  currentPath: RoutePath | null;
  label: string;
  onNavigate: (path: RoutePath) => void;
}) {
  const isActive = currentPath === href;
  return (
    <a
      href={href}
      className={`nav-link${isActive ? " nav-link--active" : ""}`}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(href);
      }}
    >
      {label}
    </a>
  );
}

function CurrentPage({ path }: { path: RoutePath }) {
  switch (path) {
    case "/":
      return <HomePage routes={routes} />;
    case "/viewer":
      return <ViewerPlaygroundPage />;
    case "/layout":
      return <LayoutShowcasePage />;
    case "/editor":
      return <EditorShowcasePage />;
    case "/criteria":
      return <CriteriaEditorPage />;
    case "/monaco":
      return <MonacoPlaygroundPage />;
    case "/save-flow":
      return <SaveFlowHarnessPage />;
    case "/local-file-editor":
      return <LocalFileEditorPage />;
    case "/ops-viewer":
      return <OpsViewerPage />;
    case "/utilities":
      return <UtilitiesPage />;
    case "/embed":
      return <EmbedViewerPage />;
  }
}

export function App() {
  const { routePath, navigate } = useRoutePath();
  const currentPath = routePath ?? "/";
  const immersiveRoute = currentPath === "/local-file-editor";

  return (
    <div className={`app-shell${immersiveRoute ? " app-shell--immersive" : ""}`}>
      {!immersiveRoute && (
        <header className="app-shell__header">
          <div className="app-shell__header-inner">
            <div className="brand-lockup">
              <strong>Cyoda Workflow Capability Showcase</strong>
              <span>Internal demo and regression harness for `apps/docs-embed-demo`</span>
            </div>
            <nav className="nav-links" aria-label="Demo pages">
              {routes.map((route) => (
                <NavLink
                  key={route.path}
                  href={route.path}
                  currentPath={routePath}
                  label={route.label}
                  onNavigate={navigate}
                />
              ))}
            </nav>
          </div>
        </header>
      )}

      <main className={`app-shell__main${immersiveRoute ? " app-shell__main--immersive" : ""}`}>
        <CurrentPage path={currentPath} />
        {!routePath && (
          <section className="page-section">
            <div className="page-intro">
              <p className="eyebrow">Route not found</p>
              <h1>Demo page not found</h1>
              <p>Use one of the capability routes above.</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
