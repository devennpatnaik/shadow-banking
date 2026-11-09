import { dispatch } from './commands.js';
import { EXIT_ERROR, processIo, type Io } from './io.js';
import { PAPER_ENVELOPE, printJson } from './json.js';
import { parseArgs } from './parse.js';

export function run(argv: readonly string[], io: Io = processIo): number {
  const parsed = parseArgs([...argv]);
  try {
    return dispatch(io, parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (parsed.json) {
      io.stdout.write(
        printJson({
          ...PAPER_ENVELOPE,
          ok: false,
          command: parsed.command,
          error: message,
        }),
      );
    } else {
      io.stderr.write(`${message}\n`);
    }
    return EXIT_ERROR;
  }
}
