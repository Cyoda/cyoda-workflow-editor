import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  EntityFieldHintProvider,
  EntityIdentity,
  FieldHint,
} from "@cyoda/workflow-core";

type Status = "idle" | "loading" | "ready" | "error";

interface CacheEntry {
  status: Status;
  hints: FieldHint[];
  error?: string;
}

interface Store {
  cache: Map<string, CacheEntry>;
  subscribers: Set<() => void>;
}

interface ContextValue {
  provider?: EntityFieldHintProvider;
  entity?: EntityIdentity | null;
  store: Store;
}

function createStore(): Store {
  return { cache: new Map(), subscribers: new Set() };
}

const FieldHintsContext = createContext<ContextValue>({ store: createStore() });

export interface FieldHintsProviderProps {
  provider?: EntityFieldHintProvider;
  entity?: EntityIdentity | null;
  children: ReactNode;
}

export function FieldHintsProvider({
  provider,
  entity,
  children,
}: FieldHintsProviderProps) {
  const storeRef = useRef<Store | null>(null);
  if (!storeRef.current) storeRef.current = createStore();
  const store = storeRef.current;

  useEffect(() => {
    store.cache.clear();
    notify(store);
  }, [provider, store]);

  const value = useMemo<ContextValue>(
    () => ({ provider, entity, store }),
    [provider, entity, store],
  );
  return (
    <FieldHintsContext.Provider value={value}>
      {children}
    </FieldHintsContext.Provider>
  );
}

function entityKey(e: EntityIdentity | null | undefined): string | null {
  if (!e) return null;
  return `${e.entityName}@${e.modelVersion}`;
}

function notify(store: Store): void {
  for (const cb of store.subscribers) cb();
}

export interface UseFieldHintsResult {
  hasProvider: boolean;
  hasEntity: boolean;
  enabled: boolean;
  status: Status;
  hints: FieldHint[];
  error?: string;
  load: () => void;
  reload: () => void;
}

export function useFieldHints(): UseFieldHintsResult {
  const { provider, entity, store } = useContext(FieldHintsContext);
  const key = entityKey(entity);
  const [, setTick] = useState(0);

  useEffect(() => {
    const cb = () => setTick((n) => n + 1);
    store.subscribers.add(cb);
    return () => {
      store.subscribers.delete(cb);
    };
  }, [store]);

  const startLoad = useCallback(
    (force: boolean) => {
      if (!provider || !key || !entity) return;
      const existing = store.cache.get(key);
      if (!force && existing && existing.status !== "idle") return;
      store.cache.set(key, { status: "loading", hints: [] });
      notify(store);
      Promise.resolve()
        .then(() => provider.listFieldPaths(entity))
        .then(
          (hints) => {
            store.cache.set(key, { status: "ready", hints });
            notify(store);
          },
          (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            store.cache.set(key, { status: "error", hints: [], error: message });
            notify(store);
          },
        );
    },
    [provider, key, entity, store],
  );

  const load = useCallback(() => startLoad(false), [startLoad]);
  const reload = useCallback(() => startLoad(true), [startLoad]);

  const entry = key ? store.cache.get(key) : undefined;

  return {
    hasProvider: !!provider,
    hasEntity: !!entity,
    enabled: !!provider && !!entity,
    status: entry?.status ?? "idle",
    hints: entry?.hints ?? [],
    ...(entry?.error !== undefined ? { error: entry.error } : {}),
    load,
    reload,
  };
}
