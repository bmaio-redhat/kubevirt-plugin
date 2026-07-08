/**
 * Simple logger utility that writes to stdout/stderr.
 * Avoids eslint console.log warnings while maintaining terminal output.
 *
 * When running in sharded mode (IS_SHARDED=true), info and success are suppressed
 * to keep shard output clean. Errors and warnings always print.
 */

const isQuiet = process.env.IS_SHARDED === 'true';

export const logger = {
  info: (message: string): void => {
    if (!isQuiet) process.stdout.write(`${message}\n`);
  },

  error: (message: string): void => {
    process.stderr.write(`${message}\n`);
  },

  warn: (message: string): void => {
    process.stderr.write(`⚠️  ${message}\n`);
  },

  success: (message: string): void => {
    if (!isQuiet) process.stdout.write(`✅ ${message}\n`);
  },
};
