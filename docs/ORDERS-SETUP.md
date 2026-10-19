# Royal Furniture orders: Google Sheet + WhatsApp setup

This turns the app's checkout into a real order-request inbox:

1. The customer places an order in the app.
2. The order is saved on the customer's device.
3. When this setup is connected, the app also sends the order to your private Google Sheet.
4. The customer can tap **Confirm on WhatsApp** to send you the same order in WhatsApp.
5. You confirm stock, payment, and delivery or collection with the customer.
6. You update **Status** and **Delivery date** in the Sheet.
7. The customer sees those updates in **Account → Order history** when they open that screen again.

No payment is taken inside the app. Payment is arranged with the customer on WhatsApp or by phone.

## What you need

- The **Royal Furniture — Orders** spreadsheet in your Google Drive.
- The script text file named **Royal Furniture — Orders script (copy this).txt**.
- About five minutes in the spreadsheet's Apps Script editor.

## One-time setup

### 1. Open the Orders spreadsheet

Open **Royal Furniture — Orders** in Google Drive. It should have an **Orders** tab with these columns:

Order ID · Placed at · Customer name · Mobile · Fulfilment · Address / Showroom · Items · Total (AED) · Status · Delivery date · Seller notes

Do not rename the **Orders** tab or the column headings.

### 2. Open Apps Script

In the spreadsheet's top menu, choose:

**Extensions → Apps Script**

Delete the sample code in the editor.

### 3. Paste the order-inbox script

Open **Royal Furniture — Orders script (copy this).txt** from Google Drive, select all of its text, copy it, and paste it into the empty Apps Script editor.

Near the top you will see:

```js
var ORDER_TOKEN = 'PASTE-YOUR-TOKEN-HERE';
```

Replace `PASTE-YOUR-TOKEN-HERE` with a private word-and-number combination of your choice, for example `rf-orders-2026-x7k2`. Keep the quotes.

This token is a spam filter for the order endpoint. You must later send the exact same token when connecting the app.

### 4. Save and run setup

1. Click the save/disk icon.
2. In the function dropdown near the top, choose **setup**.
3. Click **Run**.
4. Google will ask you to review permissions. Choose your account, then **Advanced → Go to project → Allow**. This permits the script to write only within its spreadsheet workflow.

Running setup prepares the headings and a status dropdown. It is safe to run again.

### 5. Deploy the Web app

1. Click **Deploy → New deployment**.
2. Click the gear/type selector and choose **Web app**.
3. Description: `Royal Furniture orders inbox`.
4. **Execute as:** Me.
5. **Who has access:** Anyone.
6. Click **Deploy**.
7. Copy the **Web app URL**. It should end in `/exec`.

"Anyone" applies to the script endpoint only; it does **not** make the Sheet public. Order submissions need the token. Status lookups need the token plus the correct order ID and checkout mobile number.

### 6. Connect it to the app

Send these two values in the app-building chat:

- the `/exec` Web app URL;
- the exact token you put in `ORDER_TOKEN`.

They go into `app/ordersConfig.ts`, after which the app is rebuilt, tested with a real test order, and redeployed.

Until that connection is switched on, customers still reach you with the **Confirm on WhatsApp** button, but orders do not automatically appear in the Sheet.

## Test the full process

After the app has been redeployed with your URL and token:

1. Place a test order in the app with your own mobile number.
2. Confirm that a new row appears in the Sheet.
3. In that row, set **Status** to `Confirmed` and type a **Delivery date**, such as `28 Oct 2026`.
4. Open **Account → Order history** in the app for that test order.
5. Confirm the status and expected date change to what you entered.
6. Mark the Sheet row `Cancelled` and write `TEST` in **Seller notes**, or delete the row if you prefer.

## Daily workflow

For every new row:

1. Check the items, address/showroom, quantity, and total.
2. Contact the customer on WhatsApp or by phone to confirm:
   - item and size availability;
   - delivery/collection timing;
   - address or chosen showroom;
   - payment method (cash on delivery, transfer, payment link, showroom payment, as agreed).
3. Update **Status** as work progresses. Recommended customer-facing values:
   - `New`
   - `Confirmed`
   - `Payment requested`
   - `Scheduled`
   - `Out for delivery`
   - `Ready for collection`
   - `Delivered`
   - `Completed`
   - `Cancelled`
4. Edit **Delivery date** whenever the agreed date changes. The customer sees this as the expected date.
5. Use **Seller notes** for private notes such as the delivery team, agreed time window, balance due, or warehouse location. Seller notes are **not** sent back to the app.

Do not change **Order ID** or **Mobile**, because the app uses both together to find the customer's update.

### Optional email alerts

In Google Sheets, open **Tools → Notification settings** and choose to be notified when changes are made. This can alert you when a new order row is added.

## Security and privacy

- Keep the spreadsheet private. Do not publish it or share it with "anyone with the link."
- Apps Script's "Anyone" deployment does not expose the whole Sheet. It only permits the two controlled actions in the script: add an order, or return status/date for an exact order ID + mobile match.
- The app token is included in the public web bundle, so treat it as an anti-spam key—not a password. The private Sheet remains the real security boundary.
- Customer name, mobile, address/showroom, and order details are stored in your Sheet and on the customer's device.
- No card/payment details are collected by this order flow.

## Updating the script later

Editing code in Apps Script does not immediately update the already-deployed Web app. After an edit:

1. Click **Deploy → Manage deployments**.
2. Edit the existing Web app deployment.
3. Choose **New version**.
4. Click **Deploy**.

Keeping the same deployment preserves the `/exec` URL. If the token changes, the app must also be rebuilt and redeployed with the new token.

## Troubleshooting

### A test order does not appear in the Sheet

Check, in order:

1. The app was redeployed after the Web app URL/token were added.
2. The copied URL ends in `/exec`, not `/dev`.
3. Web app access is **Anyone** and execution is **Me**.
4. The token in the app exactly matches `ORDER_TOKEN` in Apps Script.
5. You replaced `PASTE-YOUR-TOKEN-HERE`.
6. After any script edit, you deployed a **New version**.
7. The tab is still called **Orders**.

### The Sheet updates, but the customer does not see the new date/status

1. Check that **Order ID** and **Mobile** still exactly match the customer's order.
2. The phone comparison uses the last nine digits, so `0501234567`, `501234567`, and `+971501234567` match each other.
3. Ask the customer to open **Account → Order history** again; the app checks when that screen loads.
4. Syncing is available on the web app. On another platform, the customer can use **Message us about this order** for a WhatsApp update.

### The order appears twice

The script checks the Order ID before appending, so the same submission should not duplicate. If you see two rows, they probably have different Order IDs and were submitted as separate checkout actions. Cancel one in **Status** and explain it in **Seller notes**.
