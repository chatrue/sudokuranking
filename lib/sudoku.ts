import { generateSudoku } from "./sudoku_gen";
export type Cell = {
  value: number;      // 0 = empty
  given: boolean;     // 처음부터 주어진 값
  memos: boolean[];   // 1..9 메모
};

export type Puzzle = {
  id: string;
  difficulty: "easy" | "medium" | "hard" | "pro" | "insane";
  // 81 chars, '0' for empty
  grid: string;
  solution: string;
};



function isPuzzleConsistent(p: Puzzle): boolean {
  if (!p?.grid || p.grid.length !== 81) return false;
  if (!isGridValid(p.grid)) return false;
  if (!isSolutionValid(p.solution)) return false;
  for (let i = 0; i < 81; i++) {
    const g = p.grid[i];
    if (g !== "0" && g !== p.solution[i]) return false;
  }
  return true;
}


function makeCells(grid: string): Cell[] {
  return Array.from({ length: 81 }, (_, i) => {
    const v = Number(grid[i] ?? "0");
    return {
      value: v,
      given: v !== 0,
      memos: Array.from({ length: 9 }, () => false),
    };
  });
}

export function puzzleToCells(p: Puzzle): Cell[] {
  return makeCells(p.grid);
}

export function cellsToString(cells: Cell[]): string {
  return cells.map(c => (c.value || 0).toString()).join("");
}

export function isComplete(cells: Cell[]): boolean {
  return cells.every(c => c.value !== 0);
}

export function conflicts(cells: Cell[], idx: number): boolean {
  const v = cells[idx]?.value ?? 0;
  if (v === 0) return false;
  const r = Math.floor(idx / 9);
  const c = idx % 9;

  // row
  for (let cc = 0; cc < 9; cc++) {
    const j = r * 9 + cc;
    if (j !== idx && cells[j].value === v) return true;
  }
  // col
  for (let rr = 0; rr < 9; rr++) {
    const j = rr * 9 + c;
    if (j !== idx && cells[j].value === v) return true;
  }
  // box
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      const j = (br + dr) * 9 + (bc + dc);
      if (j !== idx && cells[j].value === v) return true;
    }
  }
  return false;
}

export function anyConflict(cells: Cell[]): boolean {
  for (let i = 0; i < 81; i++) {
    if (conflicts(cells, i)) return true;
  }
  return false;
}

export function getSameNumberIndexes(cells: Cell[], target: number): number[] {
  if (target === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < 81; i++) if (cells[i].value === target) out.push(i);
  return out;
}

export function countNumber(cells: Cell[], n: number): number {
  let k = 0;
  for (const c of cells) if (c.value === n) k++;
  return k;
}


export function isGridValid(grid: string): boolean {
  const g = grid.split("").map((ch) => (ch === "0" ? 0 : Number(ch)));
  const seenRow = Array.from({ length: 9 }, () => new Set<number>());
  const seenCol = Array.from({ length: 9 }, () => new Set<number>());
  const seenBox = Array.from({ length: 9 }, () => new Set<number>());

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = g[r * 9 + c];
      if (!v) continue;
      const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      if (seenRow[r].has(v) || seenCol[c].has(v) || seenBox[b].has(v)) return false;
      seenRow[r].add(v);
      seenCol[c].add(v);
      seenBox[b].add(v);
    }
  }
  return true;
}

export function isSolutionValid(solution: string): boolean {
  if (solution.length !== 81) return false;
  const g = solution.split("").map((ch) => Number(ch));
  for (let r = 0; r < 9; r++) {
    const s = new Set<number>();
    for (let c = 0; c < 9; c++) s.add(g[r * 9 + c]);
    if (s.size !== 9 || [...s].some((x) => x < 1 || x > 9)) return false;
  }
  for (let c = 0; c < 9; c++) {
    const s = new Set<number>();
    for (let r = 0; r < 9; r++) s.add(g[r * 9 + c]);
    if (s.size !== 9) return false;
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const s = new Set<number>();
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) s.add(g[r * 9 + c]);
      }
      if (s.size !== 9) return false;
    }
  }
  return true;
}

export function gridMatchesSolution(grid: string, solution: string): boolean {
  for (let i = 0; i < 81; i++) {
    const g = grid[i];
    if (g !== "0" && g !== solution[i]) return false;
  }
  return true;
}

export function pickPuzzle(
  difficulty: Puzzle["difficulty"],
  excludeIds: string[] = []
): Puzzle {
  // Prefer random-generated puzzles (not transformations)
  for (let tries = 0; tries < 25; tries++) {
    const gen = generateSudoku(difficulty);
    const id = `gen-${difficulty}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (!isSolutionValid(gen.solution)) continue;
    if (!isGridValid(gen.grid)) continue;
    if (!gridMatchesSolution(gen.grid, gen.solution)) continue;
    // id is unique enough; excludeIds not needed but keep for API symmetry
    if (excludeIds.includes(id)) continue;
    return { id, difficulty, grid: gen.grid, solution: gen.solution };
  }

  // Fallback to bundled puzzles
  const poolAll = PUZZLES.filter((p) => p.difficulty === difficulty);
  const pool = poolAll.filter((p) => !excludeIds.includes(p.id));
  const basePool = pool.length ? pool : poolAll;
  const chosen = basePool[Math.floor(Math.random() * basePool.length)] ?? PUZZLES[0];

  for (let tries = 0; tries < Math.min(30, basePool.length); tries++) {
    const p = basePool[(tries + Math.floor(Math.random() * basePool.length)) % basePool.length] ?? chosen;
    if (isSolutionValid(p.solution) && isGridValid(p.grid) && gridMatchesSolution(p.grid, p.solution)) return p;
  }

  return chosen;
}




/**
 * 샘플 퍼즐(난이도별 2개씩)
 * - 실서비스에서는 퍼즐을 더 늘리거나, 서버/파일로 공급하거나, 생성기로 확장하면 됨.
 */
export const PUZZLES: Puzzle[] = [
  {
    id: "easy-1",
    difficulty: "easy",
    grid:     "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
    solution: "534678912672195348198342567859761423426853791713924856961537284287419635345286179",
  },
  {
    id: "easy-2",
    difficulty: "easy",
    grid:     "006800000800004900010900080000020000050060040000030000090005070007100002000002600",
    solution: "946831527832574916715926384483729165251468743679135298192645873367198452528312679",
  },
  {
    id: "medium-1",
    difficulty: "medium",
    grid:     "000260701680070090190004500820100040004602900050003028009300074040050036703018000",
    solution: "435269781682571493197834562826195347374682915951743628519326874248957136763418259",
  },
  {
    id: "medium-2",
    difficulty: "medium",
    grid:     "200080300060070084030500209000105408000000000402706000301007040720040060004010003",
    solution: "245986371169273584837541269673195428918324657452786931391657842728439165564812793",
  },
  {
    id: "hard-1",
    difficulty: "hard",
    grid:     "000000907000420180000705026100904000050000040000507009920108000034059000507000000",
    solution: "483651927765423189219785326176934852952816743348527619926178534834259761517362498",
  },
  {
    id: "hard-2",
    difficulty: "hard",
    grid:     "050807020600010090702540006070020301504000908103080070900076205060090004020103050",
    solution: "359867124648312597712549836876925341534671928123484679981476235165298714427153865",
  },
];
