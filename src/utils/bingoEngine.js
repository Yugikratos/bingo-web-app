/**
 * 1-25 Classic Bingo Engine & 12-Line Win Detector
 */

export const WIN_LINES = [
  // 5 Rows
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],

  // 5 Columns
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],

  // 2 Diagonals
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20]
];

/**
 * Generates an array of numbers 1..25 shuffled via Fisher-Yates algorithm
 */
export function generateBoard() {
  const numbers = Array.from({ length: 25 }, (_, i) => i + 1);

  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }

  return numbers;
}

/**
 * Evaluates board state against called numbers.
 * A line is complete if all 5 indices in that line contain numbers present in calledNumbers.
 *
 * @param {number[]} board - Array of 25 numbers
 * @param {number[]|Set<number>} calledNumbers - Numbers called in the game so far
 * @returns {{ completedLinesCount: number, winningTileIndices: Set<number>, completedLineIds: number[] }}
 */
export function evaluateBoard(board, calledNumbers) {
  if (!board || board.length !== 25) {
    return { completedLinesCount: 0, winningTileIndices: new Set(), completedLineIds: [] };
  }

  const calledSet = calledNumbers instanceof Set ? calledNumbers : new Set(calledNumbers || []);
  const winningTileIndices = new Set();
  const completedLineIds = [];

  WIN_LINES.forEach((line, lineIndex) => {
    const isLineComplete = line.every((tileIndex) => {
      const num = board[tileIndex];
      return calledSet.has(num);
    });

    if (isLineComplete) {
      completedLineIds.push(lineIndex);
      line.forEach((tileIndex) => winningTileIndices.add(tileIndex));
    }
  });

  return {
    completedLinesCount: completedLineIds.length,
    winningTileIndices,
    completedLineIds
  };
}

/**
 * AI Bot Move Selector
 * Picks an uncalled number that maximizes line completion and progress on its hidden 5x5 board.
 *
 * @param {number[]} botBoard - Bot's 25-number board
 * @param {number[]} calledNumbers - Array of already called numbers
 * @returns {number} - The chosen number to call
 */
export function getBestBotMove(botBoard, calledNumbers) {
  const calledSet = new Set(calledNumbers || []);

  // Filter uncalled numbers present on the bot's board
  const candidateNumbers = botBoard.filter((num) => !calledSet.has(num));

  if (candidateNumbers.length === 0) {
    // Fallback: pick any uncalled number 1..25
    const remaining = [];
    for (let n = 1; n <= 25; n++) {
      if (!calledSet.has(n)) remaining.push(n);
    }
    return remaining.length > 0 ? remaining[Math.floor(Math.random() * remaining.length)] : 1;
  }

  // Pre-calculate line completion states
  const evaluatedCandidates = candidateNumbers.map((num) => {
    // Simulate calling this number
    const simulatedSet = new Set(calledSet);
    simulatedSet.add(num);

    let score = 0;
    let newlyCompletedLines = 0;

    WIN_LINES.forEach((line) => {
      let calledInLine = 0;
      let containsCandidate = false;

      line.forEach((idx) => {
        const val = botBoard[idx];
        if (val === num) containsCandidate = true;
        if (simulatedSet.has(val)) calledInLine++;
      });

      if (containsCandidate) {
        if (calledInLine === 5) {
          score += 1500; // Completes a line!
          newlyCompletedLines++;
        } else if (calledInLine === 4) {
          score += 200; // 4 in a row
        } else if (calledInLine === 3) {
          score += 40;  // 3 in a row
        } else if (calledInLine === 2) {
          score += 10;  // 2 in a row
        } else {
          score += 2;
        }
      }
    });

    return { num, score, newlyCompletedLines };
  });

  // Sort by highest score descending
  evaluatedCandidates.sort((a, b) => b.score - a.score);

  const highestScore = evaluatedCandidates[0].score;
  const bestCandidates = evaluatedCandidates.filter((c) => c.score === highestScore);

  // Pick randomly among ties to keep the AI dynamic and interesting
  const chosen = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
  return chosen.num;
}
