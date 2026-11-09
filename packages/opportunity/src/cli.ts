#!/usr/bin/env node
import { main } from './run.js';

const code = await main(process.argv);
if (code !== 0) process.exit(code);
