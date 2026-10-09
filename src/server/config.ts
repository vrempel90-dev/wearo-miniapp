import { assert } from './errors';
export const developmentEnabled = () => process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH === 'true';
export const testPaymentsEnabled = () => process.env.NODE_ENV !== 'production' && process.env.TEST_PAYMENTS === 'true';
export function appOrigin() { return new URL(process.env.APP_URL || 'http://localhost:3000').origin; }
export function validateProduction() {
  if (process.env.NODE_ENV !== 'production') return;
  assert(process.env.DEV_AUTH !== 'true' && process.env.TEST_PAYMENTS !== 'true', 503, 'Небезопасная production-конфигурация');
  assert(process.env.DATABASE_URL && process.env.TELEGRAM_BOT_TOKEN && process.env.APP_URL?.startsWith('https://'), 503, 'Production-конфигурация не завершена');
}
