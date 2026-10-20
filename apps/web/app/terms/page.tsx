import Link from 'next/link';
import type { Metadata } from 'next';
import { STORE } from '@fitsecret/shared/seed';
import Legal from '@/components/Legal';

export const metadata: Metadata = { title: 'Terms & Conditions', description: 'Terms for shopping with Fit Secrets online and in store.' };

// Template written for a Vijayawada retail store selling online. Have it reviewed by the owner's legal adviser before launch.
export default function Terms() {
  return (
    <Legal
      title="Terms & Conditions"
      updated="19 October 2026"
      intro={`These terms apply when you shop with Fit Secrets, at our store on MG Road, Vijayawada or on this website. By placing an order you agree to them.`}
      sections={[
        ['Who we are', <>
          <p>This website is run by Fit Secrets, {STORE.address}. You can reach us on <a href={`tel:+91${STORE.phone}`}>{STORE.phone}</a> or <a href={`mailto:${STORE.email}`}>{STORE.email}</a>.</p>
        </>],
        ['Products and information', <>
          <p>We sell genuine products sourced from brands and their authorised importers. Product photos, descriptions and nutrition details come from the manufacturer and are for general information. Always read the label before use.</p>
          <p>Supplements are not medicines and are not a substitute for a varied diet. If you are pregnant, nursing, under 18, taking medication or have a medical condition, consult your doctor before use.</p>
        </>],
        ['Prices and availability', <>
          <p>All prices are in Indian Rupees and include applicable GST unless stated otherwise. Prices and stock can change without notice. The price charged is the one shown when you place your order.</p>
          <p>If an item turns out to be unavailable or was listed with an obvious pricing error, we will contact you and either offer an alternative or cancel that item with a full refund of any amount paid for it.</p>
        </>],
        ['Orders', <>
          <p>An order is confirmed when you receive an order number. We may cancel an order if we cannot verify the delivery details, the item is unavailable, or the order looks fraudulent. If we cancel, any amount paid is refunded in full.</p>
          <p>You can cancel an order free of charge before it is shipped by contacting us with your order number.</p>
        </>],
        ['Payment', <>
          <p>You can pay online (UPI, cards, net banking) through our payment partner Razorpay, or with cash on delivery where available. We never see or store your card details. Cash on delivery may be limited by order value or location.</p>
        </>],
        ['Shipping and delivery', <>
          <p>Shipping is free on orders above ₹999; a delivery fee shown at checkout applies below that. Delivery times are estimates and depend on the courier and your location. Once an order ships, you can follow it on our <Link href="/track">order tracking page</Link>.</p>
          <p>Please check the package when it arrives. If the outer box is damaged or tampered with, refuse delivery or tell us within 24 hours with photos.</p>
        </>],
        ['Returns, exchanges and refunds', <>
          <p>Because these are consumable health products, we can only accept returns or exchanges of sealed, unused items in their original packaging, within 7 days of delivery, with the invoice.</p>
          <p>We will replace or refund at no cost if you receive a damaged, expired, wrong or incomplete item, provided you tell us within 48 hours of delivery with photos or an unboxing video.</p>
          <p>Approved refunds are made to the original payment method, or by bank transfer or UPI for cash-on-delivery orders, usually within 7 working days of approval.</p>
        </>],
        ['Authenticity', <>
          <p>Where a brand provides an authenticity code, you can verify it before opening the seal. If a product fails the brand’s own verification, contact us before use and we will investigate and replace or refund it.</p>
        </>],
        ['Accounts', <>
          <p>If you create an account, keep your sign-in link private. You are responsible for orders placed through your account. You can ask us to close your account at any time.</p>
        </>],
        ['Liability', <>
          <p>We are responsible for supplying products as described. We are not liable for results from using a product, for misuse, or for losses that were not reasonably foreseeable. Nothing in these terms limits rights you have under the Consumer Protection Act, 2019.</p>
        </>],
        ['Changes and governing law', <>
          <p>We may update these terms; the version shown when you order applies to that order. These terms are governed by the laws of India, and courts at Vijayawada, Andhra Pradesh have jurisdiction.</p>
          <p>Questions or complaints? <Link href="/contact">Contact us</Link> and we will respond within 48 hours. See also our <Link href="/privacy">Privacy Policy</Link>.</p>
        </>],
      ]}
    />
  );
}
