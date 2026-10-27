import { CouponHistory } from "@/components/coupon-history";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell } from "@/components/account/ui";
import { PaymentCheckout } from "@/components/payment-checkout";
export const Route = createFileRoute("/payments")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Access Pass payment — Tutor Marketplace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AuthShell
      title="Your Access Pass payment"
      intro="Review your current purchase and check its payment status."
      footer={
        <Link to="/tutors" className="link">
          Find Tutors
        </Link>
      }
    >
      <PaymentCheckout />
      <CouponHistory />
      <Link to="/payments/history" className="link mt-5 inline-block">
        Payment history and receipts
      </Link>
    </AuthShell>
  ),
});
