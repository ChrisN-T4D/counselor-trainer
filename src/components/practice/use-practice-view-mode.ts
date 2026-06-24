"use client";

import { useCallback, useEffect, useState } from "react";
import type { PracticeViewMode } from "@/lib/visual/types";

const STORAGE_KEY = "counselor-trainer-practice-view";

export function loadPracticeViewMode(): PracticeViewMode {
  if (typeof window === "undefined") {
    return "text";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "avatar" || stored === "room" ? stored : "text";
}

export function savePracticeViewMode(mode: PracticeViewMode) {
  window.localStorage.setItem(STORAGE_KEY, mode);
}

export function usePracticeViewMode(visualEnabled: boolean) {
  const [viewMode, setViewModeState] = useState<PracticeViewMode>("text");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setViewModeState(loadPracticeViewMode());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!visualEnabled && (viewMode === "avatar" || viewMode === "room")) {
      setViewModeState("text");
    }
  }, [visualEnabled, viewMode]);

  const setViewMode = useCallback(
    (mode: PracticeViewMode) => {
      if ((mode === "avatar" || mode === "room") && !visualEnabled) {
        return;
      }
      setViewModeState(mode);
      savePracticeViewMode(mode);
    },
    [visualEnabled],
  );

  return {
    viewMode: hydrated ? viewMode : "text",
    setViewMode,
    hydrated,
  };
}
