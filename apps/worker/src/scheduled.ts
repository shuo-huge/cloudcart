import { Database } from "@cloudcart/database";
import {
  expireStaleOrders,
  type DispatchSummary,
  type ExpireOrdersSummary,
} from "@cloudcart/core";
import type { Env } from "./env";
import { processEmailQueueForEnv } from "./email";

export interface ScheduledRunSummary {
  orders: ExpireOrdersSummary;
  email: DispatchSummary;
}

/**
 * Runs from the Worker cron trigger. Order expiry and email retry are
 * independent: a provider outage must not stop inventory from being released.
 */
export async function runScheduledTasks(env: Env): Promise<ScheduledRunSummary> {
  const database = new Database(env.DB);
  const [orders, email] = await Promise.allSettled([
    expireStaleOrders(database, { limit: 50 }),
    processEmailQueueForEnv(database, env, { limit: 50 }),
  ]);

  const orderSummary = orders.status === "fulfilled"
    ? orders.value
    : { expired: 0, failed: 0 };
  const emailSummary = email.status === "fulfilled"
    ? email.value
    : { sent: 0, failed: 0, skipped: true };

  if (orders.status === "rejected") {
    console.error(JSON.stringify({
      level: "error",
      scope: "scheduled.orders",
      message: orders.reason instanceof Error ? orders.reason.message : String(orders.reason),
    }));
  }
  if (email.status === "rejected") {
    console.error(JSON.stringify({
      level: "error",
      scope: "scheduled.email",
      message: email.reason instanceof Error ? email.reason.message : String(email.reason),
    }));
  }
  return { orders: orderSummary, email: emailSummary };
}
