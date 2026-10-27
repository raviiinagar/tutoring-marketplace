# Access Pass coupons

Owner request: percentage discounts including 100% off for ordinary users, available on the hosted ordinary preview for real human testing without payment.

Adopted defaults: integer percentages 1-100; INR amounts computed on the server in paise with discount rounded down; one code per pass and one use per verified account per code; staff FINANCE scope and MFA to create/list/disable; explicit start/expiry and total cap; immutable terms and redemption records. Disabling stops new redemptions, not existing coverage. Quote is advisory, commit revalidates with campaign lock. A reserved partial checkout consumes a use even if abandoned; never release an uncertain payment reservation.

Partial discounts require enabled Razorpay checkout and confirmed capture of the discounted balance. Fully discounted access bypasses Razorpay with no provider Order, payment journal, receipt claiming payment, refund or revenue. Coupon matching starts at redemption, expires after 72 hours; first eligible acceptance fixes 30 days. Existing active/matching coverage or unresolved purchase cannot be replaced. Expired coverage permits a new different code/manual purchase; the same code remains single-use.

Full coupons work for normal verified adult/Guardian accounts on the ordinary preview, retaining current learner consent, Tutor approval, participant, block and role boundaries. Existing Connections survive ordinary expiry. Payment disabled remains disabled for nonzero balances. See ADR-0010.
