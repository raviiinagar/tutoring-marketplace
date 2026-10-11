# Production requirements research: tutoring marketplace

Decision context: 10 October 2026, Asia/Calcutta. Business/platform name is undecided; VEER is the current owner. Scope: one-time Access Pass payments, direct Tuition Fee payment to Tutors, and Guardian-controlled access for child Learners. This report supports engineering decisions and is not a certification of legal compliance.

## Hosted payments, capture and access

- Use Razorpay Standard Checkout with an Order created on the server for every purchase. Amount is expressed in currency subunits; if the final checkout total is ₹599, the Order amount is 59900 paise. Verify Checkout signatures on the server using the stored Order ID, Payment ID and secret; the client-returned Order ID is not the authoritative input. Check captured payment status before fulfilment. A Razorpay Order remains `paid` after a refund, so it cannot determine Access Pass eligibility by itself. [Standard Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- Configure automatic capture and support late authorisation. Razorpay documents a three-day capture window from payment creation, after which uncaptured authorisations are automatically refunded. Do not defer capture until a Tutor accepts at the marketplace's 72-hour deadline: these are different clocks. [Capture settings](https://razorpay.com/docs/payments/payments/capture-settings)
- Engineer recommendation: model captured payment, awaiting first eligible acceptance, activated Access Pass, and refund separately. Start Contact Requests only after verified capture; activate the 30-day Access Pass once both capture and eligible acceptance are true. Persist the provider capture time separately from receipt time. Serialise acceptance and refund eligibility so the same purchase cannot activate and refund concurrently. Specify treatment of late capture, acceptance at exactly the deadline, suspended Tutors and payment disputes before implementation.

## Webhooks and recovery

Validate `X-Razorpay-Signature` using HMAC-SHA256 over the **raw request body** and the webhook secret. Retain appropriate old secrets for retries after rotation. Deduplicate using `x-razorpay-event-id`; delivery order is not guaranteed. [Validation and ordering](https://razorpay.com/docs/webhooks/validate-test/)

Razorpay retries failed delivery with exponential backoff for 24 hours; continued failures disable the webhook and require Dashboard re-enablement. Responses exceeding five seconds can cause a duplicate delivery. Notifications are asynchronous; fetch APIs can supplement critical confirmation. [Delivery and retry behaviour](https://razorpay.com/docs/webhooks/best-practices/)

Engineer recommendation: durably record a validated event before a fast 2xx response, process in a retryable worker, and make business transitions idempotent independently of event deduplication. Run periodic payment/refund reconciliation, alert on backlog and disabled delivery, and expose recovery to the operator. Test lost callbacks, delayed/duplicate/out-of-order webhooks and crash recovery. Keep live/test credentials and secrets separate and server-side.

## Refunds and settlement reconciliation

Normal refunds return funds to the original payment method. Razorpay describes 7–10 working days overall, with method-dependent timings. Normal refunds have no extra processing fee, but the original gateway transaction fee and its GST are not returned to the merchant. The marketplace's promise must distinguish refund initiation from bank receipt. [Normal refunds](https://razorpay.com/docs/payments/refunds/normal/)

Full customer refunds require enough available or reserve balance; the provider's example explicitly shows a refund failing when the captured amount minus fees is insufficient. Owner must fund the reserve and monitor it; do not reduce the promised full customer refund by provider costs. [Balance and reserve mechanics](https://razorpay.com/docs/payments/dashboard/account-settings/balances)

For retrying normal refund creation after an unknown network outcome, Razorpay documents `X-Refund-Idempotency` with a stable key of at least ten characters using letters, numbers, hyphens or underscores. Persist refund intent/key before sending and reuse it on retries. [Official idempotent refund documentation](https://github.com/razorpay/markdown-docs/blob/master/api/refunds/normal-refunds-idempotent.md)

Domestic settlement is documented as T+2 working days from capture; verify the actual account schedule and any holds rather than promising it. Settlement can be partial when refunds reduce available balance. [Settlement behaviour](https://razorpay.com/docs/payments/settlements/) The settlement reconciliation API returns payments, refunds, transfers and adjustments settled for a day/month. Reconcile gross captured payments, refunds, provider fees/tax, adjustments, settlement identifiers and bank receipts; an Access Pass ledger and bank settlement ledger have different purposes. [Official Settlement API reference](https://d6xcmfyh68wv8.cloudfront.net/docs/api/settlements/)

## DPDP commencement and child data

The Act's commencement is phased. Definitions and Board provisions are already commenced. Consent Manager-related provisions start one year after Gazette publication; substantive processing duties, including section 9 on children, start eighteen months after publication. These are not all already enforceable on 10 October 2026. [Commencement notification G.S.R. 843(E)](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf)

The Rules similarly commence rules 1–2 and 17–21 immediately, rule 4 after one year, and rules 3, 5–16, 22–23 after eighteen months. Rule 10 requires verifiable parental consent before child-data processing and due diligence that the parent is an identifiable adult, using reliable identity/age details or prescribed token routes. Restricted education exemptions exist; do not assume a Tutor marketplace qualifies as an educational institution. [DPDP Rules 2025, rules 1, 10 and Fourth Schedule](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)

Both Gazette documents print 13 November 2025, while upload identifiers contain 14 November and an official government release describes notification on 14 November. The operative text uses publication-relative dates. Plan conservatively for **13 November 2026 / 13 May 2027**; have the legal owner confirm the authoritative dates and any subsequent amendment before launch. This research did not establish a subsequent notified change to the schedule. [Official government backgrounder](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190655&lang=2&reg=48)

The Act defines a child as under eighteen and includes a parent/lawful Guardian in that child's Data Principal. Section 9 requires verifiable consent before processing, prohibits processing detrimental to child wellbeing and restricts child tracking, behavioural monitoring and targeted advertising, subject to prescribed exemptions. A Guardian owning the account does **not**, by itself, remove obligations when stored profiles or messages identify a child. [DPDP Act, sections 2 and 9](https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf)

Engineer recommendation: minimise child fields, prevent independent child accounts, restrict messages/contact disclosures to authorised adult participants, record notice/consent versions and verification outcomes, and make withdrawal/deletion operational. A checkbox or payment card alone has not been established by these sources as sufficient parental verification. Choose a verification method and retention policy before collecting identity documents; implement a configurable seam for the approved method. Counsel must settle guardianship evidence, exemption applicability and existing-law requirements during the transition.

## Dependencies the owner must resolve

| Dependency | Needed for production |
| --- | --- |
| Merchant identity | Legal operator/entity, trade name, PAN/KYC, settlement bank account and approved live account; VEER's personal name is not a confirmed business name. Activation depends on bank-partner approval. [Razorpay activation FAQ](https://github.com/razorpay/markdown-docs/blob/master/payments/faqs.md) |
| Price and invoices | Whether ₹599 is the tax-inclusive checkout total; tax registration/treatment, invoice identity and accounting review. |
| Failed matching | Capture-based 72-hour deadline, acceptance race rules, refund reserve and operator handling when initiation fails. |
| Guardian verification | Approved identity/age and authority verification method, vendor availability, consent text and minimum retention. |
| Privacy operation | Legal owner confirms commencement/amendments and applicability; operator owns requests, grievances and incidents. |

No subscriptions, lesson collection, Route transfers or Tutor payouts are required by the agreed MVP boundary.
