export interface Io {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
}

export const processIo: Io = {
  stdout: { write: (chunk) => process.stdout.write(chunk) },
  stderr: { write: (chunk) => process.stderr.write(chunk) },
};

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_VETO = 2;
