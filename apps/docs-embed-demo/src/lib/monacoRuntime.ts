// monaco-editor >= 0.56 exposes its ESM build through an `exports` map
// (`monaco-editor/<path>` -> `esm/vs/<path>.js`): the pre-0.56
// `monaco-editor/esm/vs/...` worker paths no longer resolve. The ESM build
// imports its own CSS, so no stylesheet import is needed with a bundler.
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/languages/features/json/json.worker?worker";
import * as monaco from "monaco-editor";
import type { WorkflowJsonMonacoRuntime } from "@cyoda/workflow-react";

let configured = false;

export function getMonacoRuntime(): WorkflowJsonMonacoRuntime {
  const target = window as Window & {
    MonacoEnvironment?: {
      getWorker(_: string, label: string): Worker;
    };
  };

  if (!configured) {
    target.MonacoEnvironment = {
      getWorker(_workerId: string, label: string) {
        if (label === "json") return new jsonWorker();
        return new editorWorker();
      },
    };
    configured = true;
  }
  return monaco;
}
