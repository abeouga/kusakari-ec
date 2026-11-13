import { spawn, spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import './database.js';

// Card payment tests need Stripe test keys in .env and the Stripe CLI (logged in). Without them only these tests skip.
// Key values are never printed: only the prefixes are checked.
const secretKey = process.env.STRIPE_SECRET_KEY || '';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const publishableKey = process.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

/** The Stripe CLI: STRIPE_CLI, `stripe` on PATH, or the WinGet install folder. */
function findCli() {
  const candidates = [process.env.STRIPE_CLI, 'stripe'].filter(Boolean);
  const winget = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
  if (winget && existsSync(winget)) {
    for (const folder of readdirSync(winget).filter((name) => name.startsWith('Stripe.StripeCli'))) {
      candidates.push(join(winget, folder, 'stripe.exe'));
    }
  }
  return candidates.find((cli) => spawnSync(cli, ['version'], { encoding: 'utf8' }).status === 0) || '';
}

export const stripeCli = findCli();
// The events the API handles (the CLI requires the list). charge.dispute.created is only recorded.
export const stripeEvents = 'payment_intent.succeeded,payment_intent.payment_failed,refund.created,refund.updated,refund.failed,charge.refunded,charge.dispute.created';
export const stripeReady =
  /^(sk|rk)_test_/.test(secretKey) &&
  webhookSecret.startsWith('whsec_') &&
  publishableKey.startsWith('pk_test_') &&
  !!stripeCli;

/**
 * Forwards this account's test-mode events to the E2E API. The CLI's signing secret must be the one in .env,
 * otherwise the API would reject every event.
 * @param {string} forwardTo
 */
export async function startStripeListener(forwardTo) {
  const printed = spawnSync(stripeCli, ['listen', '--print-secret'], { encoding: 'utf8' });
  if (printed.status !== 0 || printed.stdout.trim() !== webhookSecret) {
    throw new Error('The Stripe CLI signing secret does not match STRIPE_WEBHOOK_SECRET in .env.');
  }
  const child = spawn(stripeCli, ['listen', '--events', stripeEvents, '--forward-to', forwardTo], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('stripe listen did not become ready.')), 60000);
    // The CLI output contains the signing secret, so it is read here and never printed.
    const ready = (/** @type {Buffer} */ chunk) => {
      if (chunk.toString().includes('Ready!')) {
        clearTimeout(timer);
        resolve(undefined);
      }
    };
    child.stdout.on('data', ready);
    child.stderr.on('data', ready);
    child.on('exit', () => reject(new Error('stripe listen stopped.')));
  });
  return () => child.kill();
}

/** Calls the real Stripe test-mode API with the test secret key from .env. */
export async function stripeApi(path, form) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: form ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form ? new URLSearchParams(form) : undefined,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Stripe ${path}: ${body.error?.type} ${body.error?.code}`);
  return body;
}

/** The PaymentIntent ID inside a client secret (pi_..._secret_...). */
export const intentOf = (/** @type {string} */ clientSecret) => clientSecret.split('_secret_')[0];

/** A Stripe-Signature header for a body, made the way Stripe signs webhook events. */
export function signature(payload, secret = webhookSecret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

/** The test-mode event of a type for a PaymentIntent, read back from Stripe. */
export async function eventFor(type, intentId) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const events = await stripeApi(`/events?type=${encodeURIComponent(type)}&limit=30`);
    const found = events.data.find((event) => event.data.object.id === intentId);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`No ${type} event for the payment intent.`);
}
