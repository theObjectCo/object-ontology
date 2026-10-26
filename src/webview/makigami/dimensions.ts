

/** Lane headers on the left; then one column per step, in time order. */
export const LANE_W = 190;

export const COL_W = 240;

export const CARD_W = 188;

export const CARD_H = 96;

/** The row of step numbers above the lanes. */
export const HEAD_H = 28;

export const PAD = 14;

/** Two lines of the wait text. */
export const WAIT_H = 32;

export const PROBLEM_H = 58;

export const GAP = 10;

export const MIN_LANE_H = 112;


export const cardX = (column: number) => column * COL_W + (COL_W - CARD_W) / 2;
