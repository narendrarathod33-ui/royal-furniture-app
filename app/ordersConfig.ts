/**
 * Order plumbing configuration.
 *
 * ORDERS_WEBHOOK_URL / ORDERS_TOKEN connect checkout to the orders inbox
 * (a Google Apps Script bound to the seller's Orders sheet — see
 * docs/ORDERS-SETUP.md and data/tools/orders-inbox.gs). While the URL is
 * empty the app still takes real order requests: they are saved on the
 * device and the customer is asked to confirm on WhatsApp. Once the seller
 * deploys the script, paste its Web app URL + the shared anti-spam token
 * here and redeploy — submission and in-app tracking switch on with no
 * other code change.
 *
 * The token is a spam filter, not a secret: it ships inside the public
 * bundle by design. The sheet itself stays private to the seller.
 */
export const ORDERS_WEBHOOK_URL = '';
export const ORDERS_TOKEN = '';

/** Store WhatsApp in international format (no +, no spaces). */
export const WHATSAPP_NUMBER_INTL = '971588800318';
