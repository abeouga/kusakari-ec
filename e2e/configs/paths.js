import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright resolves relative config paths from this folder, so configs here use repo-root paths.
export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
// KUSAKARI_CANVAS_DIRECTORY runs the suites against a Canvas checkout other than ../kusakari-canvas (e.g. a worktree).
export const canvasRoot = resolve(repoRoot, process.env.KUSAKARI_CANVAS_DIRECTORY || '../kusakari-canvas');
export const fromRoot = (...segments) => resolve(repoRoot, ...segments);
