#!/usr/bin/env node
import { runExecutionCli } from './run.js';

const code = await runExecutionCli(process.argv.slice(2));
if (code !== 0) process.exit(code);
