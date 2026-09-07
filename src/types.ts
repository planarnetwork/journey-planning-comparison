export type Theme = 'dark' | 'light';

export const MAP_SIZES = ['md', 'lg', 'sm', 'off'] as const;
export type MapSize = (typeof MAP_SIZES)[number];

/** Which journey, in which planner's column, is currently selected. */
export interface Selection {
  planner: string;
  index: number;
}
