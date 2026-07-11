"use client";

import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { readJson, writeJson } from "@/lib/storage/localStorage";

/**
 * State that rehydrates from localStorage after mount (SSR-safe).
 * First paint uses `defaultValue`; a client effect loads stored data, then
 * subsequent changes are written back. Skips the initial write until hydrated
 * so defaults never clobber a saved value.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  parse: (raw: unknown) => T | null,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readJson(key);
    if (stored != null) {
      const parsed = parse(stored);
      if (parsed != null) {
        setValue(parsed);
      }
    }
    setHydrated(true);
    // parse is expected to be a stable module-level function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    writeJson(key, value);
  }, [key, value, hydrated]);

  return [value, setValue];
}
