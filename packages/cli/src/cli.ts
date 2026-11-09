#!/usr/bin/env node
import { run } from './run.js';

const code = run(process.argv.slice(2));
if (code !== 0) process.exit(code);
