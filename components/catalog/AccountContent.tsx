import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { BadgePercent, Check, ChevronDown, ChevronRight, CircleAlert, FileQuestion, Hourglass, MapPin, Navigation, Phone, Receipt, RotateCcw, ShieldCheck, ShoppingBag, Store, Truck, UserRound, Wallet } from 'lucide-react-native';
import { royalFurnitureData } from '../../app/data/royalFurnitureData';
import { useAdaptiveLayout } from '../../hooks/useAdaptiveLayout';
import { Header } from './ProductCard';
import { COLORS, styles } from './kit';
import { t, switchLang, useLangStore } from '../../app/i18n';
import type { OrderRecord } from './kit';

export function AccountContent({ onDeleteData, orders, onBag, cartCount, onCart, onAccount }: { onDeleteData: () => Promise<void>; orders: OrderRecord[]; onBag: () => void; cartCount: number; onCart: () => void; onAccount: () => void }) { const adaptive = useAdaptiveLayout(); const [deleteConfirm, setDeleteConfirm] = useState(false); const [deleteBusy, setDeleteBusy] = useState(false); const [deleteError, setDeleteError] = useState(''); const [profile, setProfile] = useState({ name: '', email: '', phone: '' }); const [claimed, setClaimed] = useState<string[]>([]); const warrantyFor = (category: string) => category === 'household' ? 'Not covered under the household warranty policy' : category === 'cooltech-mattress' ? 'Cooltech mattress warranty: up to 25 years, terms apply' : category === 'sofas' ? 'Sofa warranty: 5 years on frame and springs' : category === 'bedroom' ? 'Headboard and divan warranty: 5 years on frame' : '1-year warranty or see product terms'; const [registered, setRegistered] = useState(false); return <ScrollView contentContainerStyle={[styles.scrollContent, { width: '100%', maxWidth: adaptive.twoPane ? 1200 : 600, alignSelf: 'center' }]}><Header count={cartCount} onCart={onCart} onAccount={onAccount} /><View style={styles.accountIntro}><Text style={styles.pageTitle}>{t('header.account')}</Text><Text style={styles.pageSub}>{t('account.sub')}</Text></View><View testID="adaptive-account" style={{ flexDirection: adaptive.twoPane ? 'row' : 'column', alignItems: 'flex-start' }}><View style={{ width: '100%', flex: adaptive.twoPane ? 1 : undefined, minWidth: 0, maxWidth: 560 }}><View style={styles.accountHero}><View style={styles.accountIcon}><UserRound color={COLORS.red} size={25} /></View><Text style={styles.accountTitle}>{registered ? `Welcome, ${profile.name}` : t('account.title')}</Text><Text style={styles.accountBody}>{registered ? 'Your details are saved for a faster checkout.' : 'Save your details, track orders, and keep your Royal Furniture journey together.'}</Text>{registered ? <Pressable style={styles.accountButton} onPress={onBag}><ShoppingBag color={COLORS.ink} size={17} /><Text style={styles.accountButtonText}>Open my bag</Text></Pressable> : <><View style={{ paddingHorizontal: 20, paddingTop: 4 }}><Text style={styles.accountFieldLabel}>{t('account.language')}</Text><View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}><Pressable accessibilityRole="button" accessibilityLabel="English" onPress={() => { if (switchLang('en')) { window.location.reload(); } }} style={[styles.claimButton, useLangStore.getState().lang === 'en' && { backgroundColor: COLORS.red }]}><Text style={[styles.claimButtonText, useLangStore.getState().lang === 'en' && { color: '#fff' }]}>English</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="العربية" onPress={() => { if (switchLang('ar')) { window.location.reload(); } }} style={[styles.claimButton, useLangStore.getState().lang === 'ar' && { backgroundColor: COLORS.red }]}><Text style={[styles.claimButtonText, useLangStore.getState().lang === 'ar' && { color: '#fff' }]}>العربية</Text></Pressable></View></View><Text style={styles.accountFieldLabel}>Full name</Text><TextInput style={styles.accountInput} placeholder="Full name" value={profile.name} onChangeText={(name) => setProfile({ ...profile, name })} /><Text style={styles.accountFieldLabel}>{t('account.email')}</Text><TextInput style={styles.accountInput} placeholder={t('account.email')} keyboardType="email-address" autoCapitalize="none" value={profile.email} onChangeText={(email) => setProfile({ ...profile, email })} /><Text style={styles.accountFieldLabel}>{t('account.mobile')}</Text><TextInput style={styles.accountInput} placeholder={t('account.mobile')} keyboardType="phone-pad" value={profile.phone} onChangeText={(phone) => setProfile({ ...profile, phone })} /><Pressable style={styles.addButton} onPress={() => profile.name.trim() && profile.email.includes('@') && profile.phone.length >= 7 && setRegistered(true)}><Text style={styles.addButtonText}>Create account</Text></Pressable><Text style={styles.accountNote}>Prototype profile only. No password or payment details are stored.</Text></>}</View><View style={styles.accountHero}><Text style={styles.accountTitle}>Your local data</Text><Text style={styles.accountNote}>This prototype has no server account. Delete your profile, order history, saved items, bag and searches from this app session.</Text><Pressable accessibilityRole="button" style={styles.accountButton} onPress={() => setDeleteConfirm(true)}><Text style={styles.accountButtonText}>Delete account &amp; local data</Text></Pressable>{deleteConfirm && <View><Text style={styles.accountNote}>Delete local app data and the server sandbox status? This does not delete payment records held by Stripe. This cannot be undone.</Text>{!!deleteError && <Text accessibilityRole="alert" style={styles.accountNote}>{deleteError}</Text>}<Pressable accessibilityRole="button" style={styles.addButton} disabled={deleteBusy} onPress={async () => { setDeleteBusy(true); setDeleteError(''); try { await onDeleteData(); } catch { setDeleteError('Could not clear the sandbox session. Try again.'); setDeleteBusy(false); } }}><Text style={styles.addButtonText}>{deleteBusy ? 'Deleting…' : 'Confirm deletion'}</Text></Pressable><Pressable accessibilityRole="button" style={styles.accountButton} onPress={() => setDeleteConfirm(false)}><Text style={styles.accountButtonText}>Cancel</Text></Pressable></View>}</View></View><View style={{ width: '100%', flex: adaptive.twoPane ? 1 : undefined, minWidth: 0 }}><View style={styles.orderSection}><View style={styles.orderSectionHeader}><Text style={styles.policyTitle}>Order history</Text><Text style={styles.savedSectionCount}>{orders.length}</Text></View>{orders.length === 0 ? <Text style={styles.orderEmpty}>Your completed purchases will appear here with delivery and warranty information.</Text> : orders.map((order) => <View style={styles.orderCard} key={order.id}><View style={styles.orderCardTop}><Text style={styles.orderId}>{order.id}</Text><Text style={styles.orderStatus}>{order.status}</Text></View><Text style={styles.orderMeta}>Purchased {order.purchasedAt} · Expected {order.deliveryDate}</Text><Text style={styles.orderItems}>{order.items.map((item) => item.name).join(' · ')}</Text>{order.items.map((item) => <View style={styles.warrantyRow} key={item.name}><View style={{ flex: 1 }}><Text style={styles.policyRowTitle}>{item.name}</Text><Text style={styles.policyRowBody}>{warrantyFor(item.category)}</Text></View>{item.category !== 'household' && <Pressable style={styles.claimButton} onPress={() => setClaimed((items) => items.includes(order.id + item.name) ? items : [...items, order.id + item.name])}><Text style={styles.claimButtonText}>{claimed.includes(order.id + item.name) ? 'Requested' : 'Claim warranty'}</Text></Pressable>}</View>)}</View>)}</View><ShoppingSupport /></View></View></ScrollView>; }
/**
 * Shopping support content.
 *
 * Every answer below is taken from a page published on royalfurniture.ae (Help
 * Center, Terms & Conditions, Return Policy, Warranty, Cooltech warranty,
 * Click & Collect, Store Locator, Contact Us and the product pages), checked on
 * 17 October 2026. Nothing is invented: where the site publishes two different
 * versions of a fact the row carries a `conflict` flag with both versions, and
 * where the site publishes nothing the row carries a `pending` flag with a
 * REPLACE_ME placeholder for the site owner and a note on what is missing.
 */
export type SupportFlag = { kind: 'conflict' | 'pending'; label: string; detail: string; replace?: string };
export type SupportRow = { q: string; a: string; points?: readonly string[]; note?: string; flag?: SupportFlag };
export type SupportSection = { id: string; title: string; lead: string; icon: typeof Truck; rows: readonly SupportRow[]; stores?: boolean };
export const SUPPORT_CHECKED = 'Checked against royalfurniture.ae on 17 October 2026';

export const supportSections: readonly SupportSection[] = [
  {
    id: 'delivery',
    title: 'Delivery & charges',
    lead: 'Free delivery and installation on furniture orders of AED 500 or more. Below that, home delivery costs AED 50.',
    icon: Truck,
    rows: [
      {
        q: 'How much does delivery cost?',
        a: 'Free on furniture orders of AED 500 or more (VAT inclusive), and assembly is free on all furniture. Orders below AED 500 pay AED 50 for home delivery.',
        points: [
          'Western regions of Abu Dhabi: an additional AED 600 applies.',
          'Staircase delivery is free up to the 5th floor and AED 200 for floors 6 to 15.',
          'Above the 15th floor the delivery reaches the ground floor only. You arrange the rest, and any damage during that move is not covered and voids the warranty.',
        ],
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The delivery policy in the terms and the product pages both say free delivery and installation above AED 500 (VAT inclusive). A second delivery section further down the same terms page says free delivery and installation above AED 1,000 (VAT inclusive). Confirm which threshold applies before publishing a single number.',
          replace: 'REPLACE_ME (free delivery threshold: AED 500 or AED 1,000)',
        },
      },
      {
        q: 'When will my order arrive?',
        a: 'Every product page shows its own estimated delivery date, for example "Delivery on Oct 28, 2026", and you can update it for your area.',
        points: [
          'The date is confirmed with you after the order is placed.',
          'Full payment is required 3 business days before the agreed delivery date. If it is late, the delivery moves to the next available slot.',
        ],
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'There is no standard lead time on the website. The terms ask customers to WhatsApp +971 58 880 0318 or email webstore@royalgroup.ae for the lead time on made-to-order and imported in-stock items, so those timeframes are not documented anywhere public.',
          replace: 'REPLACE_ME (typical lead time for made-to-order items, and for imported in-stock items)',
        },
      },
      {
        q: 'What do I need to do on delivery day?',
        a: 'Be there, and check the item before the delivery team leaves.',
        points: [
          'You or your representative must be present during delivery.',
          'Prepare the delivery area in advance to avoid delays.',
          'Inspect fragile items such as marble and glass at the time of delivery and report any visible defect within 24 hours.',
          'Report any damage in transit immediately, with photos or a report as evidence.',
          'Check that the piece fits through your lifts, corridors and staircases soon after ordering, and tell Royal Furniture straight away so the delivery is not delayed or charged extra.',
        ],
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The customer responsibility section of the terms gives 48 hours from placing the order to confirm the piece fits through all access points. The delivery section of the same page gives 24 hours. Confirm which window applies.',
          replace: 'REPLACE_ME (access check window: 24 or 48 hours after ordering)',
        },
      },
      {
        q: 'What happens if a delivery is missed?',
        a: 'After two missed deliveries, every rescheduling costs AED 100 + VAT per attempt.',
        points: ['A redelivery charge also applies to items that need redelivering because you asked for it.'],
      },
      {
        q: 'Can you hold my order if I am not ready?',
        a: 'Yes. Fully paid items are stored free for 30 days.',
        points: [
          'After 30 days a monthly storage fee applies.',
          'Storage for partially paid items beyond the agreed delivery date cannot be guaranteed.',
        ],
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The storage policy in the terms says a 5% monthly storage fee applies beyond 30 days. The delivery section of the same page says a 10% monthly storage fee applies beyond 30 days. Confirm the rate.',
          replace: 'REPLACE_ME (monthly storage fee after 30 days: 5% or 10%)',
        },
      },
      {
        q: 'Where do you deliver?',
        a: 'Across the UAE. No products or services are provided to OFAC sanction countries.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The website does not say whether delivery outside the UAE is offered, or what it would cost. Emirate-level coverage and any excluded areas are not listed either.',
          replace: 'REPLACE_ME (delivery coverage: emirates served, excluded areas, and whether international delivery is offered)',
        },
      },
    ],
  },
  {
    id: 'collect',
    title: 'Click & Collect',
    lead: 'Order online and collect from any Royal Furniture showroom. It is always free, whatever the order value.',
    icon: Store,
    rows: [
      {
        q: 'How does it work?',
        a: 'Four steps, and no delivery charge at any order value.',
        points: [
          'Choose Click & Collect at checkout.',
          'Choose the showroom you want.',
          'Wait for the ready-for-collection notification, sent by SMS and email.',
          'Visit the showroom with your order confirmation.',
        ],
      },
      {
        q: 'Which showroom gets my order?',
        a: 'The showroom you choose at checkout.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The Click & Collect page lists the questions "Which store will my order go to?", "Can I choose any store?" and "Can I change my chosen store after I placed an order?" but does not publish the answers.',
          replace: 'REPLACE_ME (whether the showroom can be changed after ordering, and how)',
        },
      },
      {
        q: 'When can I collect?',
        a: 'During showroom opening hours, 7 days a week. Showrooms open at 10:00.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'Only the opening time (10:00) is published for each showroom. Closing times, Friday and public-holiday hours are not listed, so the 7-day claim cannot be verified from the site.',
          replace: 'REPLACE_ME (showroom closing time and any day-specific hours, per showroom)',
        },
      },
      {
        q: 'Can I track a collect order?',
        a: 'Yes. Preparation, dispatch and delivery milestones are tracked in real time, and you get an SMS and an email when the order is ready.',
      },
      {
        q: 'What do I bring, and can someone else collect?',
        a: 'Bring your order confirmation. The rest is not published.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The Click & Collect page lists "What do I need to bring to collect my order?", "Can someone else collect on my behalf?", "Where do I pick up my order in store?", "How long will you hold my order?" and "How can I pay for my Click & Collect order?" without publishing the answers.',
          replace: 'REPLACE_ME (what to bring, whether a third party can collect with ID, the in-store pickup point, how long orders are held, and payment options for collect orders)',
        },
      },
    ],
  },
  {
    id: 'returns',
    title: 'Returns, exchanges & cancellations',
    lead: 'Most furniture cannot be returned once it is delivered. Imported furniture and accessories have 7 days, and Cooltech mattresses a 90-day exchange.',
    icon: RotateCcw,
    rows: [
      {
        q: 'Can I return furniture?',
        a: 'No. Furniture cannot be returned or exchanged after delivery.',
        points: [
          'Exception: imported furniture can be returned or exchanged within 7 days of delivery.',
          'Damaged or defective items are exchanged or refunded only when repair is not possible, at the discretion of Royal Furniture.',
          'No exchange or refund is accepted for customer fault, a change of mind, or disliking the product after delivery.',
          'Returns can be refused if the item is found misused or damaged after delivery.',
        ],
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The terms say furniture cannot be returned or exchanged after delivery, and in the next bullet that imported furniture can be returned or exchanged within 7 days. The Cooltech warranty page adds that returns and exchanges are not accepted during a sale or promotion, which would override the 7-day windows for discounted items. Confirm the order of these rules.',
          replace: 'REPLACE_ME (which rule wins: no returns on furniture, 7 days on imported furniture, or no returns during promotions)',
        },
      },
      {
        q: 'Can I return accessories?',
        a: 'Yes, within 7 days, if they are unused and undamaged and come back with the original receipt and packaging.',
        points: ['Return delivery charges apply.'],
      },
      {
        q: 'Can I exchange a mattress?',
        a: 'Yes, once, within 90 days, for a different model in the same size you ordered.',
        points: [
          'Standard sizes only: 120x200, 160x200, 180x200 and 200x200.',
          'A delivery charge of AED 100 + VAT applies.',
          'The mattress must be clean and in good condition. A stained or damaged mattress is not eligible.',
          'Changing the mattress size after order confirmation costs 30% of the original order value, deducted from the refund or adjusted against the new order.',
          'Exchanging for a different size is not accommodated.',
        ],
      },
      {
        q: 'What can never be returned?',
        a: 'These items are final.',
        points: [
          'Made-to-order products: they cannot be cancelled, returned or exchanged.',
          'Third-party deliveries.',
          '"As-Is" products, showroom pieces, open mattresses and unwrapped linen.',
          'Products bought during a sale or promotion, per the Cooltech policy page.',
        ],
      },
      {
        q: 'Can I cancel my order?',
        a: 'Yes, up to 3 days before delivery, and you receive a credit note. Made-to-order items cannot be cancelled.',
        points: [
          'Cancelling within 24 hours of the scheduled delivery time costs 10% of the order, inclusive of VAT.',
          'Store credits are valid for 12 months.',
          'A non-refundable deposit is required for made-to-order items.',
        ],
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The amount or percentage of the non-refundable deposit on made-to-order items is not stated anywhere on the website, and neither is how long a credit note takes to be issued.',
          replace: 'REPLACE_ME (made-to-order deposit amount or percentage, and credit note issue time)',
        },
      },
      {
        q: 'How long does a refund take?',
        a: 'Card refunds take about 2 to 3 weeks to reach your account, subject to bank processing times.',
        points: [
          'A 3% service charge applies to refunds made to credit and debit cards.',
          'Delivery charges are non-refundable. If delivery was attempted or completed, the delivery cost is deducted from any eligible refund.',
          'Cancellations are settled as a credit note, valid for 12 months.',
        ],
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'Refund timing and fees are published for card payments only. Timing for any other method, and how a pricing-error refund is processed, is not documented beyond "through the original payment method".',
          replace: 'REPLACE_ME (refund timing for non-card payments)',
        },
      },
      {
        q: 'What else should I know about returns?',
        a: 'Packaging and evidence matter.',
        points: [
          'Return packaging requirements must be followed, including the original packaging and labelling.',
          'Any mattress sent back for return, exchange or a warranty claim must be clean, hygienic and free of stains, odours and damage.',
          'Product colours, textures and finishes may vary slightly because of screen settings or production batches, which is not a defect.',
          'A temporary scent from manufacturing and packaging is normal and fades on its own.',
        ],
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The Return Policy page lists these question titles with no published answers: Purchases, Customer service, Delivery, Mattress exchange policy, Cancellation of off-the-shelf furniture, Cancellation by seller, Special offers promotions and guarantees, and Change of address or change of heart. Only the titles render on the page.',
          replace: 'REPLACE_ME (the answer text behind each Return Policy accordion, especially off-the-shelf cancellation and cancellation by seller)',
        },
      },
    ],
  },
  {
    id: 'warranty',
    title: 'Warranty',
    lead: '5 years on the frame and springs of UAE-made sofas and headboards, 1 year on imported items, and up to 25 years on Cooltech spring mattresses.',
    icon: ShieldCheck,
    rows: [
      {
        q: 'What is covered, and for how long?',
        a: 'Coverage depends on the type of product.',
        points: [
          'Sofas made in the UAE: 5 years on frame and spring, 6 months on foam and fabric, 6 months on mechanisms and electricals.',
          'Headboards and divan bases: 5 years on frame, 6 months on foam and fabric, 6 months on mechanisms and electricals.',
          'Imported and metal furniture: 1 year on general repairs, 6 months on mechanical and electrical components.',
          'Cooltech spring mattresses: 25 years from the date of purchase, for the original purchaser. Cooltech foam and medical mattresses: 5 years.',
          'Household items: no warranty. Report a defective item within 7 days.',
        ],
        note: 'The 5-year cover applies to sofas and headboard or divan bases bought on or after 1 January 2023. The warranty is for domestic use only, and it applies to the original purchaser.',
      },
      {
        q: 'Is the fabric covered?',
        a: 'The two published pages disagree.',
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The warranty page says fabric, including leather, PU and PVC, is not covered by the warranty. The terms say fabric, leather, PU and PVC quality is covered where the issue is due to a manufacturing defect, while wear and tear, staining, misuse, liquid damage and damage from use are not. Confirm which wording is current.',
          replace: 'REPLACE_ME (fabric cover: excluded entirely, or covered for manufacturing defects only)',
        },
      },
      {
        q: 'What voids the warranty?',
        a: 'Any of these will void it.',
        points: [
          'Improper use, excessive soiling or staining.',
          'Water, alcohol or other liquid damage, and improper cleaning methods.',
          'Incorrect assembly or installation by third-party suppliers, or alteration, misuse or repair by unauthorised people.',
          'Placing the item outdoors or in a humid environment.',
          'Moving the product from the original delivery location.',
          'Mattresses: an incorrect or old foundation, insufficient support, a bent or misshapen chassis, or failing to flip and rotate it regularly.',
          'Normal sagging, softening or compression of sofas from regular use is not treated as a manufacturing defect.',
        ],
      },
      {
        q: 'What happens when I make a claim?',
        a: 'The product is examined, then repaired or replaced.',
        points: [
          'Items are repaired or replaced in line with UAE Customer Protection Act No. 24 of 2006.',
          'If the same model is no longer manufactured, an appropriate replacement is provided at the discretion of Royal Furniture.',
          'A repaired or replaced mattress does not renew or extend the warranty.',
          'For mattresses, compression or sagging claims are accepted only above the published depth threshold.',
          'A size variation of +/- 2 cm on mattresses and toppers is within acceptable manufacturing tolerance.',
          'Warranty claims do not cover damages from improper storage or incorrect installation, such as a size mismatch between the mattress and the bed base.',
        ],
        flag: {
          kind: 'conflict',
          label: 'Same rule, two units',
          detail: 'The Cooltech warranty page covers body impressions greater than 2 inches. The terms accept compression or sagging claims only where the indentation exceeds 5 cm. Two inches is about 5.08 cm, so these look like the same rule written in different units, but they are not identical. Confirm the threshold and publish it once.',
          replace: 'REPLACE_ME (single sagging threshold, in cm or inches)',
        },
      },
      {
        q: 'Cooltech mattress: what counts as a defect?',
        a: 'Covered: body impressions deeper than 2 inches, coils or wires that are loose, broken or protruding through the fabric, and bunching or shifting of the raw materials.',
        points: [
          'Not covered: impressions up to 2 inches, cover fabrics, handles and corner guards, and discolouration from washing or normal wear.',
          'Not covered: odours or smells from hair, body oil or pets, and damage from delivery, handling, set-up or assembly by you or an outside contractor.',
          'Not covered: comfort preference, bed height, abuse, misuse or neglect, and normal softening of the pressure-relieving foams.',
          'The warranty covers the components beneath the outer covering, not the covering and stitching.',
          'The mattress must be clean and tidy at the time of a claim.',
        ],
      },
      {
        q: 'How do I look after a mattress so the warranty stays valid?',
        a: 'Rotate it every 2 weeks for the first 3 months, then every 2 months. This matters most in the first 5 years, and pillow-top mattresses may need rotating more often.',
        points: [
          'Air a new mattress in a well-ventilated room, use a supportive bed frame, and consider replacing an old foundation.',
          'Keep it dry and clean with a mattress pad, and vacuum it regularly.',
          'Transport it upright on its side, and never bend it: bending can damage the innerspring unit.',
          'Do not carry it by the handles, jump on it, use dry-cleaning products, or place it near an open flame, fire or space heater.',
        ],
      },
      {
        q: 'How do I start a warranty claim?',
        a: 'Contact customer care with your order number: 800 76925, or customercare@royalgroup.ae.',
        points: [
          'For household items, raise the request within 7 days of finding the defect.',
          'In this app, Order history has a Claim warranty button on each delivered item. It records the request on your device only and does not send it anywhere.',
        ],
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'No claim procedure is published: which channel to use, what proof is needed (receipt, photos, purchase date), whether an inspection visit happens, and how long a claim takes. The Cooltech maker is named as Royal Palace Foam Factory LLC, but there is no separate claim contact.',
          replace: 'REPLACE_ME (warranty claim steps, required proof, and target response time)',
        },
      },
    ],
  },
  {
    id: 'payment',
    title: 'Payment & prices',
    lead: 'Visa and MasterCard in AED online, plus Tamara split in 4 and a flexi payment of 20% upfront on product pages.',
    icon: Wallet,
    rows: [
      {
        q: 'Which payment methods can I use?',
        a: 'Online, the terms accept Visa and MasterCard credit and debit cards, charged in AED.',
        points: [
          'Product pages also show Tamara: "Split in 4 of 750" on a AED 3,000 sofa.',
          'Flexi payment is offered on many items: pay 20% upfront to confirm the booking, and the remaining amount before delivery.',
          'Coupon codes do not apply to special deal items.',
        ],
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The terms list Visa and MasterCard only, while every product page advertises Tamara and flexi payment. This app also lists cash on delivery and Tabby in its own data, and neither appears anywhere on the website. Confirm the full list of methods a shopper can actually use.',
          replace: 'REPLACE_ME (confirmed payment methods, including whether cash on delivery and Tabby are offered)',
        },
      },
      {
        q: 'Are my card details safe?',
        a: 'Card details are not stored, sold, shared, rented or leased to any third party.',
        points: [
          'Personally identifiable customer information is treated the same way.',
          'Customer information is protected and kept confidential.',
          'A login and password are for your personal use only. Tell Royal Furniture immediately if they are compromised.',
        ],
      },
      {
        q: 'Do prices include VAT?',
        a: 'The website does not say.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'Delivery thresholds are quoted "VAT inclusive" and some charges are quoted "+ VAT", but no page states whether the product prices shown include VAT. This app assumes prices include VAT at 5%, which is not sourced from the website.',
          replace: 'REPLACE_ME (whether displayed prices include VAT, and at what rate)',
        },
      },
      {
        q: 'What if a price was wrong?',
        a: 'Royal Furniture can correct pricing errors and cancel or amend the order, even after it is confirmed or paid.',
        points: [
          'Errors can come from website maintenance, technical issues, system errors or data synchronisation.',
          'If you already paid for an affected order, the amount is refunded through the original payment method.',
          'All products are subject to availability, and quantity limits can be imposed. An order can be rejected in whole or in part, and products can be discontinued without notice.',
        ],
      },
      {
        q: 'Is a deposit required?',
        a: 'Yes, on made-to-order items, and it is non-refundable.',
        note: 'Made-to-order products are made on request, and the displayed colours are subject to availability. Ask on WhatsApp +971 58 880 0318 for colour options and the delivery lead time.',
      },
    ],
  },
  {
    id: 'product',
    title: 'Product information',
    lead: 'Each product page shows the price, sizes, colours, fabrics, stock and an estimated delivery date. Photos are illustrative and colours can vary.',
    icon: Receipt,
    rows: [
      {
        q: 'What does a product page tell me?',
        a: 'The price with any discount, the size options, the colour and fabric choices, the stock status, and an estimated delivery date.',
        points: [
          'Size, colour and fabric are chosen on the product page. Made-to-order pieces advertise "Customize Yours - Any Color, Any Size!".',
          'Stock is shown per item, for example "In stock (max 5)", and the quantity per order is capped.',
          'The same page confirms free assembly and free delivery on furniture orders of AED 500 or more.',
          'A "Try in store!" link points the piece to the showrooms.',
        ],
      },
      {
        q: 'Will the colour match my screen?',
        a: 'Not exactly. Product colours, textures and finishes may vary slightly because of screen settings or production batches.',
        points: [
          'Product photos use props for illustrative purposes.',
          'Product colour may vary slightly because of photographic lighting or your screen settings.',
          'This is not treated as a defect, so it is not a ground for return.',
        ],
      },
      {
        q: 'How many can I order at once?',
        a: 'Quantity limits can be applied to any order, and the product page shows the maximum, for example "max 5".',
        points: [
          'All products are subject to availability.',
          'Royal Furniture can reject all or part of an order and can discontinue products without notice, even after an order has been placed.',
          'An order is not accepted until Royal Furniture accepts it, and more information can be requested first.',
        ],
      },
      {
        q: 'Where are the materials, dimensions and specs?',
        a: 'They are not published.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'Product pages carry a General Information block with Material, Dimensions, Specs, Warranty and Assembly headings, but on the pages checked those headings have no values behind them (for example Serafina Corner Sofa and Kaspar 6 Door Wardrobe). There is no separate specification page or downloadable spec sheet.',
          replace: 'REPLACE_ME (material, dimensions and specification values per product, or a link to a spec sheet)',
        },
      },
      {
        q: 'Can I get an alert when an item is back in stock?',
        a: 'Not published.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'Stock status is shown per item, but no page tells customers whether a restock alert exists or how to sign up for one. The store backend exposes a stock notification endpoint, which is not documented for shoppers.',
          replace: 'REPLACE_ME (whether restock alerts are offered, and how a customer signs up)',
        },
      },
    ],
  },
  {
    id: 'tracking',
    title: 'Order tracking',
    lead: 'Your order status and expected delivery date are in Account, under Order history. Click & Collect orders track preparation, dispatch and delivery.',
    icon: Navigation,
    rows: [
      {
        q: 'How do I track my order?',
        a: 'In this app, open Account and read Order history: each order shows its status, the purchase date, the expected delivery date, and the warranty that applies to every item.',
        points: [
          'The website header also has a Track Order link.',
          'Click & Collect orders show preparation, dispatch and delivery milestones in real time, and send an SMS and email when the order is ready.',
        ],
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The Track Order link in the website header has no public page behind it: royalfurniture.ae/ae/en/track-order/ returns 404, and no page documents what the tracker asks for (order number, email, phone) or what it shows.',
          replace: 'REPLACE_ME (Track Order destination and the details a customer needs to enter)',
        },
      },
      {
        q: 'What do the order statuses mean?',
        a: 'Request received: the order is with Royal Furniture and not yet confirmed. Confirmed: stock, delivery and payment are agreed. Delivered: complete. Cancelled: closed without delivery.',
        points: ['Orders placed in this app are requests. Royal Furniture contacts you to confirm delivery, stock and payment before fulfilment.'],
      },
      {
        q: 'How do I find my delivery date?',
        a: 'The product page shows an estimated delivery date that you can update for your area, and the date is confirmed with you after ordering.',
        points: ['Full payment is needed 3 business days before that date, or the delivery is rescheduled to the next available slot.'],
      },
    ],
  },
  {
    id: 'account',
    title: 'Account & privacy',
    lead: 'Sign in or sign up at the top of every page on the website. In this app your profile stays on your device.',
    icon: UserRound,
    rows: [
      {
        q: 'What does this app store about me?',
        a: 'Your name, email address and mobile number, saved on your device only.',
        points: [
          'No password and no payment details are stored.',
          'Orders and warranty requests made in the app are recorded on the device, with no server call.',
        ],
      },
      {
        q: 'Do I need an account to order?',
        a: 'The website does not say.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'Every page shows a "Sign in or sign up" link, but no page states whether an account is required to place an order, or what an account gives you beyond faster checkout.',
          replace: 'REPLACE_ME (whether an account is required to order, and the benefits of having one)',
        },
      },
      {
        q: 'How do I reset my password?',
        a: 'Not published.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The terms explain that a login and password are personal and that Royal Furniture must be told about a breach, but there is no password reset or account recovery flow documented, and no account page is linked from the help centre.',
          replace: 'REPLACE_ME (password reset steps, and how to close or correct an account)',
        },
      },
      {
        q: 'Is my data shared with anyone?',
        a: 'No. Card details and personally identifiable information are not stored, sold, shared, rented or leased to third parties.',
        points: [
          'The Privacy Policy is published on the website under Help, and explains how personal data is collected, used and protected.',
          'Website policies and terms can change. Customers are notified of changes, as is the payment gateway provider.',
        ],
      },
    ],
  },
  {
    id: 'stores',
    title: 'Showrooms',
    lead: '12 showrooms across Dubai, Abu Dhabi, Al Ain, Sharjah, Ras Al Khaimah and Ajman, all opening at 10:00.',
    icon: MapPin,
    stores: true,
    rows: [
      {
        q: 'What can I do in a showroom?',
        a: 'Try the furniture in person and get free advice from the in-store design consultants.',
        points: [
          'Test comfort and materials across the full catalogue.',
          'Some promotions are available in store only.',
          'Product pages have a "Try in store!" link for the piece you are viewing.',
        ],
      },
      {
        q: 'Where is the head office?',
        a: 'Royal Furniture Group, Ajman Industrial Area, next to Sharjah Power Station, P.O. Box 2327, Ajman, UAE.',
        note: 'Closing times are not published for any showroom, so call the store before travelling.',
      },
    ],
  },
  {
    id: 'contact',
    title: 'Contact us',
    lead: 'Call 800 76925 (800 ROYAL), Monday to Saturday, 8 AM to 7 PM GST.',
    icon: Phone,
    rows: [
      {
        q: 'Which number do I call?',
        a: 'The customer care hotline is 800 76925, also written as 800ROYAL and +971 80 076 925. It is open Monday to Saturday, 8 AM to 7 PM GST.',
        points: ['Product pages have a "Request a call back" link that dials the same number.'],
      },
      {
        q: 'Can I chat instead of calling?',
        a: 'Yes, on WhatsApp. Two different numbers are published.',
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The terms list "Chat with us: 058-8800-318" and use +971 58 880 0318 for custom colours, sizes and lead times, and the floating call button on every page dials +971 58 880 0318. The store locator lists WhatsApp support as +971 55 979 3675, which the contact page calls e-commerce support. Confirm which number shoppers should message.',
          replace: 'REPLACE_ME (the single WhatsApp or chat number for shoppers)',
        },
      },
      {
        q: 'Which email address should I use?',
        a: 'Three addresses are published for three different purposes.',
        points: [
          'customercare@royalgroup.ae: customer service, on the contact page and in the terms.',
          'Customercare@royalfurniture.ae: email support on the store locator, which promises a reply within 24 hours.',
          'webstore@royalgroup.ae: labelled Help Center in the footer, press and global marketing on the contact page, and the address the terms give for custom-made and imported item queries.',
        ],
        flag: {
          kind: 'conflict',
          label: 'Published twice, differently',
          detail: 'The customer care email appears on two different domains: royalgroup.ae on the contact page and in the terms, and royalfurniture.ae on the store locator. Confirm which inbox is monitored before publishing one address.',
          replace: 'REPLACE_ME (the single customer care email address)',
        },
      },
      {
        q: 'How fast is email support?',
        a: 'The store locator says email queries are answered within 24 hours.',
      },
      {
        q: 'I want a custom colour or size. Who do I ask?',
        a: 'WhatsApp +971 58 880 0318, or email webstore@royalgroup.ae.',
        points: [
          'Product pages advertise "Customize Yours - Any Color, Any Size!".',
          'All custom-made products are made on order, and displayed colours are subject to availability.',
          'Use the same channels for delivery lead times and product queries on imported in-stock items.',
        ],
      },
      {
        q: 'Is there a Royal Furniture app?',
        a: 'Yes. The website footer links to Google Play and the App Store.',
        flag: {
          kind: 'pending',
          label: 'Not published',
          detail: 'The footer shows Instagram, Facebook, X and YouTube icons, but every one of them links to "#" with no profile behind it, so no social channel can be given to customers.',
          replace: 'REPLACE_ME (social media profile URLs, or remove the icons)',
        },
      },
    ],
  },
  {
    id: 'gaps',
    title: 'Not covered on the website',
    lead: 'These are real shopper questions the site does not answer. Nothing here has been guessed.',
    icon: FileQuestion,
    rows: [
      {
        q: 'What is still missing?',
        a: 'Every item below is a question a customer would reasonably ask, with no answer published on royalfurniture.ae.',
        points: [
          'Order tracking: the Track Order flow, its destination, and the details it asks for.',
          'Delivery: a standard lead time, made-to-order lead times, coverage outside the UAE, and any excluded areas.',
          'Showrooms: closing times and day-specific or public-holiday hours.',
          'Payment: any method beyond Visa and MasterCard, including cash on delivery and Tabby.',
          'Prices: whether the displayed prices include VAT.',
          'Made-to-order: the deposit amount or percentage.',
          'Returns: the answers behind the Return Policy accordions, including off-the-shelf cancellation and cancellation by seller.',
          'Warranty: the claim procedure, the proof required, and the response time.',
          'Account: password reset, account recovery, and whether an account is needed to order.',
          'Contact: social media profiles.',
        ],
      },
      {
        q: 'Where do I go next if my question is not here?',
        a: 'Call 800 76925 (Monday to Saturday, 8 AM to 7 PM GST) or email customercare@royalgroup.ae with your order number.',
        points: [
          'The Help Center on the website groups the same topics: Cooltech warranty, Warranty, Return Policy, Terms & Conditions, Privacy Policy, Click & Collect, Store Locator and Contact Us.',
          'For custom colours, sizes or lead times, WhatsApp +971 58 880 0318.',
          'For a specific showroom, call that store directly: every showroom number is listed in the Showrooms section.',
        ],
      },
    ],
  },
];

/** One support topic card: the answer first, then the conditions that matter. */
export function SupportCard({ section }: { section: SupportSection }) {
  const Icon = section.icon;
  return (
    <View style={styles.supportCard}>
      <View style={styles.supportCardHead}>
        <View style={styles.supportCardIcon}><Icon color={COLORS.red} size={17} /></View>
        <Text style={styles.supportCardTitle}>{section.title}</Text>
      </View>
      <Text style={styles.supportLead}>{section.lead}</Text>
      {section.rows.map((row) => (
        <View key={row.q} style={styles.supportRow}>
          <Text style={styles.supportQuestion}>{row.q}</Text>
          <Text style={styles.supportAnswer}>{row.a}</Text>
          {!!row.points?.length && row.points.map((point) => <Text key={point} style={styles.supportPoint}>{`·  ${point}`}</Text>)}
          {!!row.note && <Text style={styles.supportNote}>{row.note}</Text>}
          {!!row.flag && (
            <View style={[styles.supportFlag, row.flag.kind === 'conflict' ? styles.supportFlagConflict : styles.supportFlagPending]}>
              <View style={styles.supportFlagHead}>
                {row.flag.kind === 'conflict' ? <CircleAlert color="#8A4B08" size={13} /> : <Hourglass color={COLORS.muted} size={13} />}
                <Text style={[styles.supportFlagLabel, row.flag.kind === 'conflict' ? styles.supportFlagLabelConflict : styles.supportFlagLabelPending]}>
                  {row.flag.kind === 'conflict' ? 'CONFLICT' : 'PENDING'} · {row.flag.label}
                </Text>
              </View>
              <Text style={styles.supportFlagDetail}>{row.flag.detail}</Text>
              {!!row.flag.replace && <Text style={styles.supportFlagReplace}>{row.flag.replace}</Text>}
            </View>
          )}
        </View>
      ))}
      {section.stores && royalFurnitureData.stores.map((store) => (
        <View key={store.city + store.addr} style={styles.policyRow}>
          <MapPin color={COLORS.muted} size={15} />
          <View style={styles.policyCopy}>
            <Text style={styles.policyRowTitle}>{store.city}</Text>
            <Text style={styles.policyRowBody}>{store.addr}</Text>
            <Text style={styles.policyRowBody}>{`Open ${store.open} · ${store.tel}`}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Rough reading weight of a topic, so the two desktop columns stay even. */
export const sectionWeight = (section: SupportSection) => section.rows.reduce((total, row) => total + row.a.length + (row.points || []).reduce((sum, point) => sum + point.length, 0) + (row.flag ? row.flag.detail.length : 0), 0) + (section.stores ? royalFurnitureData.stores.length * 130 : 0);

/** A dropdown of support topics, ordered the way a shopper meets them. */
export type SupportCategory = { id: string; title: string; blurb: string; icon: typeof Truck; topics: readonly string[] };
export type SupportGroup = { category: SupportCategory; topics: readonly SupportSection[] };

export const supportCategories: readonly SupportCategory[] = [
  { id: 'buying', title: 'Product info & payment', blurb: 'What a product page tells you, colours and stock limits, prices and VAT, cards, Tamara and flexi payment.', icon: Wallet, topics: ['product', 'payment'] },
  { id: 'orders', title: 'Orders & delivery', blurb: 'Delivery charges and timeframes, what to do on delivery day, Click & Collect, and tracking an order.', icon: Truck, topics: ['delivery', 'collect', 'tracking'] },
  { id: 'aftercare', title: 'Returns & warranty', blurb: 'What can be returned or exchanged, cancellations and refunds, and the warranty on each product type.', icon: RotateCcw, topics: ['returns', 'warranty'] },
  { id: 'account', title: 'Account & privacy', blurb: 'What this app stores about you, signing in, passwords, and how your details are treated.', icon: UserRound, topics: ['account'] },
  { id: 'places', title: 'Stores & contact', blurb: 'The 12 showrooms and their numbers, who to call, WhatsApp, email and opening hours.', icon: MapPin, topics: ['stores', 'contact'] },
  { id: 'gaps', title: 'Not covered on the website', blurb: 'The questions the site does not answer yet, each marked pending, and where to go next.', icon: FileQuestion, topics: ['gaps'] },
];

export const supportSectionById = new Map(supportSections.map((section) => [section.id, section]));
export const supportGroups: readonly SupportGroup[] = supportCategories.map((category) => ({
  category,
  topics: category.topics.flatMap((id) => { const found = supportSectionById.get(id); return found ? [found] : []; }),
}));

/** Rough reading weight of a whole dropdown, so the desktop columns stay even. */
export const groupWeight = (group: SupportGroup) => group.topics.reduce((total, section) => total + sectionWeight(section), 0);

/** Deal items into two columns, shortest column first, keeping page order. */
export function balanceColumns<T>(items: readonly T[], weightOf: (item: T) => number): readonly (readonly T[])[] {
  const columns: T[][] = [[], []];
  const loads = [0, 0];
  for (const item of items) {
    const target = loads[0] <= loads[1] ? 0 : 1;
    columns[target].push(item);
    loads[target] += weightOf(item);
  }
  return columns;
}

/**
 * One category dropdown. Same accordion as the product page: the title row is
 * the button, the symbol shows the state, and the topics mount only when open.
 */
export function SupportCategoryCard({ group, open, onToggle }: { group: SupportGroup; open: boolean; onToggle: () => void }) {
  const Icon = group.category.icon;
  const count = group.topics.length;
  const topicWord = count === 1 ? 'topic' : 'topics';
  return (
    <View style={styles.supportCategory}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${group.category.title}. ${open ? 'Hide' : 'Show'} ${count} ${topicWord}`}
        aria-expanded={open}
        onPress={onToggle}
        style={styles.supportCategoryTrigger}
      >
        <View style={styles.supportCategoryIcon}><Icon color={COLORS.red} size={17} /></View>
        <View style={styles.supportCategoryCopy}>
          <View style={styles.orderSectionHeader}>
            <Text style={styles.supportCategoryTitle}>{group.category.title}</Text>
            <Text style={styles.savedSectionCount}>{count} {topicWord}</Text>
          </View>
          <Text style={styles.supportCategoryBlurb}>{group.category.blurb}</Text>
        </View>
        <View style={styles.supportChevron}>
          <Text style={styles.supportSymbol}>{open ? '▲' : '▼'}</Text>
        </View>
      </Pressable>
      {open && <View style={styles.supportCategoryBody}>{group.topics.map((section) => <SupportCard key={section.id} section={section} />)}</View>}
    </View>
  );
}

/**
 * The Shopping support area of the Account page: the topics grouped into six
 * category dropdowns, closed until the shopper opens one. Two columns on wide
 * screens, one column on phones.
 */
export function ShoppingSupport() {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [openCategories, setOpenCategories] = useState<readonly string[]>([]);
  const toggleCategory = (id: string) => setOpenCategories((open) => open.includes(id) ? open.filter((item) => item !== id) : [...open, id]);
  const columns = wide ? balanceColumns(supportGroups, groupWeight) : [supportGroups];
  return (
    <View style={styles.policyCard}>
      <View style={styles.orderSectionHeader}>
        <Text style={styles.policyTitle}>Shopping support</Text>
        <Text style={styles.savedSectionCount}>{supportCategories.length} categories</Text>
      </View>
      <Text style={styles.supportIntro}>
        {`Open a category to read its answers. ${SUPPORT_CHECKED}. Where the site publishes two versions of a fact the row is marked CONFLICT, and where it publishes nothing the row is marked PENDING with what is missing.`}
      </Text>
      <View style={wide ? styles.supportColumns : styles.supportColumnStack}>
        {columns.map((column, index) => (
          <View key={index} style={styles.supportColumn}>
            {column.map((group) => <SupportCategoryCard key={group.category.id} group={group} open={openCategories.includes(group.category.id)} onToggle={() => toggleCategory(group.category.id)} />)}
          </View>
        ))}
      </View>
    </View>
  );
}
