// lib/fsrs.js
// Simplified FSRS-like model for jp-personalized-app
// Compatible with memory_levels(level, stability, difficulty, last_reviewed_at, due)

export const Grade = {
    Forget: 0,
    Hard: 1,
    Doubt: 2,
    Good: 3,
    Easy: 4,
    Perfect: 5,
};

const DEFAULT_DIFFICULTY = 5.0;
const DEFAULT_STABILITY = 1.0;

/** Convert stability → interval days */
function nextIntervalDays(stability) {
    return Math.max(1, Math.round(stability));
}

/** Main function: update card review state */
export function planNext(card, grade) {
    const now = new Date();
    const last = card.last_reviewed_at ? new Date(card.last_reviewed_at) : now;
    const elapsed = Math.max(0, (now - last) / 86400000); // days since last review

    const difficulty = card.difficulty ?? DEFAULT_DIFFICULTY;
    const stability = card.stability ?? DEFAULT_STABILITY;

    const next = { ...card };
    next.last_reviewed_at = now.toISOString();

    // Case: new card
    if (!card.level || card.level <= 0) {
        if (grade <= 2) {
            next.level = 0;
            next.stability = 1;
            next.difficulty = Math.min(10, difficulty + 1);
            next.due = new Date(now.getTime() + 86400000).toISOString();
        } else {
            next.level = grade;
            next.stability = 2 + grade; // 3→5, 5→7 days
            next.difficulty = Math.max(1, difficulty - 0.5);
            next.due = new Date(now.getTime() + nextIntervalDays(next.stability) * 86400000).toISOString();
        }
        return next;
    }

    // Case: already learned
    const R = Math.exp(-elapsed / (stability * 1.5)); // retrieval rate
    let newStability = stability;
    let newDifficulty = difficulty;

    if (grade <= 2) {
        newStability = Math.max(1, stability * 0.5);
        newDifficulty = Math.min(10, difficulty + 0.4);
        next.level = Math.max(0, grade);
    } else {
        const bonus = (grade - 2) / 3; // 0–1 for Good→Perfect
        newStability = stability * (1.2 + 0.8 * bonus * R);
        newDifficulty = Math.max(1, difficulty - 0.3 * bonus);
        next.level = grade;
    }

    next.stability = Number(newStability.toFixed(2));
    next.difficulty = Number(newDifficulty.toFixed(2));
    next.due = new Date(now.getTime() + nextIntervalDays(next.stability) * 86400000).toISOString();

    return next;
}

export function simulateGrades(card) {
    const res = {};
    for (let g = 0; g <= 5; g++) res[g] = planNext(card, g);
    return res;
}
