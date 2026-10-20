import Link from 'next/link';
import type { Metadata } from 'next';
import { STORE } from '@fitsecret/shared/seed';
import Legal from '@/components/Legal';

export const metadata: Metadata = { title: 'Privacy Policy', description: 'How Fit Secrets collects, uses and protects your personal data.' };

// Template aligned with India's Digital Personal Data Protection Act, 2023. Have it reviewed before launch.
export default function Privacy() {
  return (
    <Legal
      title="Privacy Policy"
      updated="19 October 2026"
      intro="We collect only what we need to fulfil your order and look after you as a customer. We do not sell your personal data."
      sections={[
        ['What we collect', <>
          <ul>
            <li><b>Order details:</b> your name, mobile number, email (optional), delivery address and the items you order.</li>
            <li><b>Account details:</b> your email address if you sign in to see your orders.</li>
            <li><b>Payment status:</b> whether a payment succeeded and its reference. Card and UPI details are handled by Razorpay; we never see or store them.</li>
            <li><b>Messages:</b> anything you send us on WhatsApp, phone or email.</li>
            <li><b>Your device:</b> your cart and saved address are kept in your own browser (local storage) so they are there next time. This is not sent to us until you place an order.</li>
          </ul>
        </>],
        ['How we use it', <>
          <ul>
            <li>To process, pack, deliver and support your orders, including updates about order status.</li>
            <li>To keep invoices and records we are required to keep under tax law (GST).</li>
            <li>To answer your questions and handle returns or complaints.</li>
            <li>To send offers only if you have asked us to. You can opt out at any time.</li>
          </ul>
        </>],
        ['Who we share it with', <>
          <p>Only with the partners needed to complete your order, and only what they need:</p>
          <ul>
            <li><b>Courier and delivery partners:</b> your name, phone and address.</li>
            <li><b>Razorpay:</b> to process online payments.</li>
            <li><b>Supabase:</b> our secure cloud database provider, which stores order records.</li>
            <li><b>Authorities:</b> when the law requires it.</li>
          </ul>
          <p>We do not sell or rent your personal data to anyone.</p>
        </>],
        ['How long we keep it', <>
          <p>We keep order and invoice records for as long as tax and accounting laws require (generally 8 years). Other data, such as enquiries, is deleted when it is no longer needed. You can ask us to delete your account at any time.</p>
        </>],
        ['How we protect it', <>
          <p>Data is sent over encrypted connections (HTTPS) and stored with access controls, so customers can only see their own orders and only authorised staff can see store records. No system is perfectly secure, but we take reasonable steps to protect your information.</p>
        </>],
        ['Your rights', <>
          <p>Under the Digital Personal Data Protection Act, 2023, you can ask us to:</p>
          <ul>
            <li>tell you what personal data we hold about you and how it is used;</li>
            <li>correct or update it;</li>
            <li>delete it, unless we must keep it by law;</li>
            <li>withdraw consent for optional uses such as offers.</li>
          </ul>
          <p>To make a request, contact us using the details below. We will respond within 30 days.</p>
        </>],
        ['Cookies', <>
          <p>We use only the browser storage needed for the site to work: your cart, saved checkout details and sign-in session. We do not use advertising trackers.</p>
        </>],
        ['Children', <>
          <p>Our website is meant for adults. We do not knowingly collect data from children under 18 without the consent of a parent or guardian.</p>
        </>],
        ['Grievance officer and contact', <>
          <p>For any privacy question or complaint, contact our grievance officer at Fit Secrets, {STORE.address}, email <a href={`mailto:${STORE.email}`}>{STORE.email}</a>, phone <a href={`tel:+91${STORE.phone}`}>{STORE.phone}</a>.</p>
          <p>We may update this policy and will change the date above when we do. See also our <Link href="/terms">Terms &amp; Conditions</Link>.</p>
        </>],
      ]}
    />
  );
}
