import type { Difficulty } from "./settings";

export type ScoreBreakdown = {
  base: number;
  bonus: number;
  penalty: number;
  total: number;
  detail: string[];
};

export const BASE_POINTS: Record<Difficulty, number> = {
  easy: 3,
  medium: 5,
  hard: 7,
  pro: 10,
  insane: 20,
};

// 보너스 조건: 쉬움 3분, 중간 5분, 어려움 7분 "안에" (<=)
export const BONUS_LIMIT_SEC: Record<Difficulty, number> = {
  easy: 3 * 60,
  medium: 5 * 60,
  hard: 7 * 60,
  pro: 15 * 60,
  insane: 20 * 60,
};

// 보너스 점수(원문에서 금액은 미정이어서, 기본점수와 동일하게 설정)
// 마음에 안 들면 여기만 바꾸면 됨.
export const BONUS_POINTS: Record<Difficulty, number> = {
  easy: 3,
  medium: 5,
  hard: 7,
  pro: 15, 
  insane: 20,
};

export function computeScore(args: {
  difficulty: Difficulty;
  elapsedSec: number;
  highlightSameNumbers: boolean;  // 같은 숫자 보임 켜면 -1
  showCompletedNumbers: boolean;  // 완성 숫자 표시 켜면 -1
}): ScoreBreakdown {
  const base = BASE_POINTS[args.difficulty];
  const bonus = args.elapsedSec <= BONUS_LIMIT_SEC[args.difficulty] ? BONUS_POINTS[args.difficulty] : 0;

  let penalty = 0;
  const detail: string[] = [];
  if (args.highlightSameNumbers) { penalty += 1; detail.push("same numbers: -1"); }
  if (args.showCompletedNumbers) { penalty += 1; detail.push("completed digits: -1"); }

  const total = Math.max(0, base + bonus - penalty);

  return {
    base,
    bonus,
    penalty,
    total,
    detail: [
      `Base: +${base}`,
      ...(bonus ? [`Bonus: +${bonus}`] : ["Bonus: +0"]),
      ...(detail.length ? detail : ["Penalty: none"]),
      `Total: ${total}`,
    ],
  };
}
