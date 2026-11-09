#!/usr/bin/env node
import { runRiskCli } from './run.js';

const code = runRiskCli(process.argv.slice(2));
if (code !== 0) process.exit(code);
