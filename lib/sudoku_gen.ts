// Random Sudoku generator (no transformations of existing puzzles)
// - Generates a full solution with backtracking, then removes cells to target clue count
// - Validates given grid consistency
// Note: uniqueness is not guaranteed (kept lightweight for PWA/local use)

export type Difficulty = "easy" | "medium" | "hard" | "pro" | "insane";

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isValidPlacement(grid: number[], r: number, c: number, n: number) {
  for (let i = 0; i < 9; i++) {
    if (grid[r * 9 + i] === n) return false;
    if (grid[i * 9 + c] === n) return false;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++) {
    for (let cc = bc; cc < bc + 3; cc++) {
      if (grid[rr * 9 + cc] === n) return false;
    }
  }
  return true;
}

function fillGrid(grid: number[]): boolean {
  const idx = grid.indexOf(0);
  if (idx === -1) return true;
  const r = Math.floor(idx / 9);
  const c = idx % 9;
  const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const n of nums) {
    if (!isValidPlacement(grid, r, c, n)) continue;
    grid[idx] = n;
    if (fillGrid(grid)) return true;
    grid[idx] = 0;
  }
  return false;
}

export function generateSudoku(difficulty: Difficulty): { grid: string; solution: string } {
  const solutionGrid = new Array(81).fill(0);

  // Seed with randomized first row for variety
  const firstRow = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (let c = 0; c < 9; c++) solutionGrid[c] = firstRow[c];

  fillGrid(solutionGrid);

  const solution = solutionGrid.join("");

  // target clues: easy higher clues, medium moderate, hard lower, pro/insane lower still
  const target =
    difficulty === "easy"
      ? 46
      : difficulty === "medium"
        ? 38
        : difficulty === "hard"
          ? 30
          : difficulty === "pro"
            ? 26
            : 22; // insane

  const puzzle = solutionGrid.slice();
  const positions = shuffle(Array.from({ length: 81 }, (_, i) => i));
  let clues = 81;

  for (const pos of positions) {
    if (clues <= target) break;
    const backup = puzzle[pos];
    puzzle[pos] = 0;

    // Keep easy from becoming too sparse per row/col early (soft constraint)
    const r = Math.floor(pos / 9);
    const c = pos % 9;
    let rowClues = 0;
    let colClues = 0;
    for (let i = 0; i < 9; i++) {
      if (puzzle[r * 9 + i] !== 0) rowClues++;
      if (puzzle[i * 9 + c] !== 0) colClues++;
    }
    if (difficulty === "easy" && (rowClues < 4 || colClues < 4)) {
      puzzle[pos] = backup;
      continue;
    }

    clues--;
  }

  const grid = puzzle.map((n) => String(n)).join("").replace(/0/g, "0");
  return { grid, solution };
}
