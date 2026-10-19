import {
  buildOrderPayload,
  buildWhatsAppMessage,
  fetchOrderStatus,
  orderItemsText,
  submitOrderRequest,
  whatsappOrderUrl,
} from '../utils/orders';
import type { OrderRecord } from '../components/catalog/kit';

const deliveryOrder: OrderRecord = {
  id: 'RF-12345678',
  purchasedAt: '19 Oct 2026',
  deliveryDate: '26 Oct 2026',
  status: 'Order received',
  total: 1545,
  fulfilment: 'home',
  customer: {
    name: 'Aisha Khan',
    phone: '0501234567',
    address: 'Villa 3, Khalifa City, Abu Dhabi',
  },
  items: [
    { name: 'Nimbus Bed', category: 'bedroom', qty: 1, price: 1295, size: '180x200' },
    { name: 'Linen Pillow', category: 'household', qty: 2, price: 125 },
  ],
};

describe('order request helpers', () => {
  test('formats item quantities, sizes, unit prices, and line totals', () => {
    expect(orderItemsText(deliveryOrder)).toBe(
      'Nimbus Bed (180x200) — AED 1,295\n2× Linen Pillow — AED 125 each (AED 250)'
    );
  });

  test('builds a complete WhatsApp confirmation message', () => {
    const message = buildWhatsAppMessage(deliveryOrder);

    expect(message).toContain('order RF-12345678');
    expect(message).toContain('Total: AED 1,545');
    expect(message).toContain('Name: Aisha Khan');
    expect(message).toContain('Mobile: 0501234567');
    expect(message).toContain('Delivery address: Villa 3, Khalifa City, Abu Dhabi');
    expect(message).toContain('Please confirm availability, payment and the delivery date.');
  });

  test('encodes the WhatsApp message for the store number', () => {
    const url = new URL(whatsappOrderUrl(deliveryOrder));

    expect(url.origin + url.pathname).toBe('https://wa.me/971588800318');
    expect(url.searchParams.get('text')).toBe(buildWhatsAppMessage(deliveryOrder));
  });

  test('builds the Google Sheet order payload', () => {
    const payload = buildOrderPayload(deliveryOrder);

    expect(payload.order).toEqual({
      id: 'RF-12345678',
      placedAt: '19 Oct 2026',
      name: 'Aisha Khan',
      phone: '0501234567',
      fulfilment: 'Delivery',
      address: 'Villa 3, Khalifa City, Abu Dhabi',
      items: orderItemsText(deliveryOrder),
      total: 1545,
    });
  });

  test('uses the selected showroom for collection orders', () => {
    const collectionOrder: OrderRecord = {
      ...deliveryOrder,
      fulfilment: 'collect',
      customer: {
        name: 'Aisha Khan',
        phone: '0501234567',
        store: 'Abu Dhabi — Corniche Road',
      },
    };

    expect(buildWhatsAppMessage(collectionOrder)).toContain(
      'Collection from: Abu Dhabi — Corniche Road'
    );
    expect(buildOrderPayload(collectionOrder).order).toMatchObject({
      fulfilment: 'Collection',
      address: 'Abu Dhabi — Corniche Road',
    });
  });

  test('stays offline-safe until the order inbox is configured', async () => {
    await expect(submitOrderRequest(deliveryOrder)).resolves.toBe(false);
    await expect(fetchOrderStatus(deliveryOrder.id, '0501234567')).resolves.toBeNull();
  });
});
