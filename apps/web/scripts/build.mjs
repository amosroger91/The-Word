import { build } from 'vite';
import config from './config.mjs';

await build({ ...config, configFile: false, logLevel: 'info' });