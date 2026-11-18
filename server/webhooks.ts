/**
 * @project Lfmaven/ticket_system
 * @author Lfmaven (https://github.com/Lfmaven/ticket_system)
 */
import {
  assertSafeOutboundWebhookUrl,
  signWebhookPayload,
} from './security.ts';
import { loadDb, newId, saveDb } from './store.ts';
import type {
  WebhookDeliveryLog,
  WebhookEventType,
  WebhookRecord,
} from './types.ts';

async function deliverToTarget(
  webhook: WebhookRecord,
  event: WebhookEventType,
  data: Record<string, unknown>,
): Promise<WebhookDeliveryLog> {
  const deliveryId = newId('dlv');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const envelope = {
    id: deliveryId,
    event,
    createdAt: new Date().toISOString(),
    data,
  };
  const bodyJson = JSON.stringify(envelope);
  const signature = signWebhookPayload(webhook.secret, timestamp, bodyJson);
  const start = performance.now();

  let statusCode: number | null = null;
  let success = false;
  let responsePreview = '';

  if (webhook.url === 'internal://sink-echo') {
    statusCode = 200;
    success = true;
    responsePreview = JSON.stringify({
      received: true,
      mode: 'internal-sandbox-sink',
      event,
      deliveryId,
      signatureVerified: Boolean(signature),
      receivedAt: new Date().toISOString(),
    });
  } else {
    try {
      const safeUrl = await assertSafeOutboundWebhookUrl(webhook.url);
      const res = await fetch(safeUrl.toString(), {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Lfmaven-TicketSystem-Webhooks/1.2',
          'X-TicketCore-Event': event,
          'X-TicketCore-Delivery': deliveryId,
          'X-TicketCore-Signature': signature,
        },
        body: bodyJson,
        signal: AbortSignal.timeout(4000),
      });
      statusCode = res.status;
      success = res.ok;
      const text = await res.text().catch(() => '');
      responsePreview = text.slice(0, 200) || res.statusText;
    } catch (err) {
      responsePreview =
        err instanceof Error
          ? err.message.slice(0, 200)
          : 'Erro de rede ou bloqueio SSRF ao entregar webhook';
    }
  }

  const durationMs = Number((performance.now() - start).toFixed(1));
  const log: WebhookDeliveryLog = {
    id: deliveryId,
    webhookId: webhook.id,
    webhookNome: webhook.nome,
    event,
    url: webhook.url,
    statusCode,
    success,
    durationMs,
    responsePreview,
    createdAt: new Date().toISOString(),
  };

  const db = loadDb();
  db.webhookDeliveries.unshift(log);
  if (db.webhookDeliveries.length > 50) {
    db.webhookDeliveries = db.webhookDeliveries.slice(0, 50);
  }
  saveDb(db);

  return log;
}

export function dispatchWebhookEvent(
  event: WebhookEventType,
  data: Record<string, unknown>,
): void {
  const db = loadDb();
  const targets = db.webhooks.filter(
    (wh) => wh.ativo && wh.events.includes(event),
  );
  if (targets.length === 0) {
    return;
  }
  for (const wh of targets) {
    void deliverToTarget(wh, event, data);
  }
}

export async function dispatchWebhookTest(
  webhook: WebhookRecord,
): Promise<WebhookDeliveryLog> {
  return deliverToTarget(webhook, 'webhook.test', {
    message:
      'Evento de teste disparado manualmente pelo Lfmaven/ticket_system.',
    webhookId: webhook.id,
    webhookNome: webhook.nome,
  });
}
