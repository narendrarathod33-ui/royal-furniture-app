import { Platform } from 'react-native';
import { ORDERS_TOKEN, ORDERS_WEBHOOK_URL, WHATSAPP_NUMBER_INTL } from '../app/ordersConfig';
import type { OrderRecord } from '../components/catalog/kit';

export const ordersConfigured = () => ORDERS_WEBHOOK_URL.length > 0;

export type RemoteOrder = { status?: string; deliveryDate?: string };

const aed = (n: number) => `AED ${n.toLocaleString('en-US')}`;

/** One line per item ("2× Name (Size) — AED 125 each (AED 250)"); shared by WhatsApp + sheet. */
export function orderItemsText(order: OrderRecord): string {
  return order.items.map((item) => {
    const qty = item.qty && item.qty > 1 ? `${item.qty}× ` : '';
    const size = item.size ? ` (${item.size})` : '';
    const price = typeof item.price === 'number'
      ? item.qty && item.qty > 1
        ? ` — ${aed(item.price)} each (${aed(item.price * item.qty)})`
        : ` — ${aed(item.price)}`
      : '';
    return `${qty}${item.name}${size}${price}`;
  }).join('\n');
}

export function buildWhatsAppMessage(order: OrderRecord): string {
  const fulfilment = order.fulfilment === 'collect'
    ? `Collection from: ${order.customer?.store ?? ''}`.trimEnd()
    : `Delivery address: ${order.customer?.address ?? ''}`.trimEnd();
  return [
    `Hello Royal Furniture, I just placed order ${order.id}.`,
    '',
    orderItemsText(order),
    `Total: ${aed(order.total)}`,
    '',
    `Name: ${order.customer?.name ?? ''}`,
    `Mobile: ${order.customer?.phone ?? ''}`,
    fulfilment,
    '',
    'Please confirm availability, payment and the delivery date. Thank you!',
  ].join('\n');
}

export function whatsappOrderUrl(order: OrderRecord): string {
  return `https://wa.me/${WHATSAPP_NUMBER_INTL}?text=${encodeURIComponent(buildWhatsAppMessage(order))}`;
}

/** Payload POSTed to the orders inbox (Google Apps Script — see data/tools/orders-inbox.gs). */
export function buildOrderPayload(order: OrderRecord) {
  return {
    token: ORDERS_TOKEN,
    order: {
      id: order.id,
      placedAt: order.purchasedAt,
      name: order.customer?.name ?? '',
      phone: order.customer?.phone ?? '',
      fulfilment: order.fulfilment === 'collect' ? 'Collection' : 'Delivery',
      address: order.fulfilment === 'collect' ? (order.customer?.store ?? '') : (order.customer?.address ?? ''),
      items: orderItemsText(order),
      total: order.total,
    },
  };
}

/**
 * Fire-and-forget submission to the orders inbox. Apps Script web apps send
 * no CORS headers, so the request goes out `no-cors` with an opaque response:
 * resolving true only means the request was dispatched. The locally saved
 * order plus the WhatsApp confirm remain the customer's record until the
 * sheet round-trip (fetchOrderStatus) proves the row landed.
 */
export async function submitOrderRequest(order: OrderRecord): Promise<boolean> {
  if (!ordersConfigured() || Platform.OS !== 'web') return false;
  try {
    await fetch(ORDERS_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(buildOrderPayload(order)),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the seller-updated status/delivery date for one order via JSONP
 * (the CORS-free read path for Apps Script; web only). Lookup requires the
 * order id AND the mobile number used at checkout.
 */
export function fetchOrderStatus(id: string, phone: string): Promise<RemoteOrder | null> {
  if (!ordersConfigured() || Platform.OS !== 'web' || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const callbackName = `__rfOrderCb${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement('script');
    let done = false;
    const finish = (value: RemoteOrder | null) => {
      if (done) return;
      done = true;
      delete (window as unknown as Record<string, unknown>)[callbackName];
      script.remove();
      resolve(value);
    };
    (window as unknown as Record<string, unknown>)[callbackName] = (data: RemoteOrder) => finish(data ?? null);
    script.onerror = () => finish(null);
    setTimeout(() => finish(null), 9000);
    const query = new URLSearchParams({ action: 'status', id, phone, token: ORDERS_TOKEN, callback: callbackName });
    script.src = `${ORDERS_WEBHOOK_URL}?${query.toString()}`;
    document.head.appendChild(script);
  });
}
