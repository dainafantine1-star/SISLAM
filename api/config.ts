import { config } from 'dotenv';
export function loadEnvironment() {
  // Tests supply an isolated environment; normal commands use this project's own .env.
  if (process.env.SISLAM_TEST !== '1') config({ path: '.env', override: true, quiet: true });
}
loadEnvironment();
