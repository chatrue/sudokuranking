import type { Lang } from "./i18n";

export type Difficulty = "easy" | "medium" | "hard" | "pro" | "insane";

export type AppSettings = {
  playerId: string;
  country: string;
  lang: Lang;
  defaultDifficulty: Difficulty;
  highlightSameNumbers: boolean; // 같은 숫자 보임
  showCompletedNumbers: boolean; // 완성 숫자 표시 (숫자패드 색 변화)
};

export const DEFAULT_SETTINGS: AppSettings = {
  playerId: "",
  country: "",
  lang: "ko",
  defaultDifficulty: "easy",
  highlightSameNumbers: true,
  showCompletedNumbers: true,
};

const KEY = "sudoku_ranking_settings_v1";

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const obj = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...obj } as AppSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: AppSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}
