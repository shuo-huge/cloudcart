import type { Context } from "hono";
import type { Database } from "@cloudcart/database";
import {
  dispatchEmailOutbox,
  enqueueOrderEventEmails,
  isEmailNotificationsEnabled,
  loadPluginRuntimeConfig,
  type DispatchSummary,
  type OrderEmailEvent,
} from "@cloudcart/core";
import {
  EMAIL_PLUGIN_ID,
  createEmailTransport,
  emailFromAddress,
  normalizeEmailConfig,
  validateEmailConfig,
} from "@cloudcart/plugin-email-notifications";
import { HttpError } from "@cloudcart/shared";
import type { AppContext, Env } from "./env";
import { db } from "./lib";

/**
 * Queues emails for an order event. Provider delivery happens after the
 * response via waitUntil, so checkout and admin actions never wait on email.
 */
export async function notifyOrderEvent(
  c: Context<AppContext>,
  event: OrderEmailEvent,
  orderId: string,
  extra: { manualInstructionsHtml?: string; refundAmountCents?: number } = {},
): Promise<number> {
  const queued = await enqueueOrderEventEmails(db(c), event, orderId, {
    masterKey: c.env.APP_MASTER_KEY,
    origin: new URL(c.req.url).origin,
    ...extra,
  });
  if (queued === 0 || c.env.APP_ENV === "test") return queued;

  const delivery = processEmailQueue(c).catch(() => undefined);
  try {
    c.executionCtx.waitUntil(delivery);
  } catch {
    void delivery;
  }
  return queued;
}

export async function processEmailQueue(
  c: Context<AppContext>,
  options: { limit?: number } = {},
): Promise<DispatchSummary> {
  return processEmailQueueForEnv(db(c), c.env, options);
}

/** Cron-friendly variant that does not need a Hono request context. */
export async function processEmailQueueForEnv(
  database: Database,
  env: Env,
  options: { limit?: number } = {},
): Promise<DispatchSummary> {
  if (!(await isEmailNotificationsEnabled(database))) {
    return { sent: 0, failed: 0, skipped: true };
  }
  const config = normalizeEmailConfig(
    await loadPluginRuntimeConfig(database, EMAIL_PLUGIN_ID, env.APP_MASTER_KEY),
  );
  const validation = validateEmailConfig(config, { hasEmailBinding: Boolean(env.EMAIL) });
  if (!validation.ok) {
    throw new HttpError(
      503,
      "email_not_configured",
      validation.errors?.[0] ?? "Email notifications are not configured.",
    );
  }
  const transport = createEmailTransport(config, { emailBinding: env.EMAIL });
  return dispatchEmailOutbox(database, transport, {
    limit: options.limit,
    from: emailFromAddress(config),
    replyTo: config.replyTo || undefined,
  });
}
