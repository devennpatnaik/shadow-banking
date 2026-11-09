#!/usr/bin/env node
import { runPaperCli } from './run.js';

const code = await runPaperCli(process.argv.slice(2));
if (code !== 0) process.exit(code);
