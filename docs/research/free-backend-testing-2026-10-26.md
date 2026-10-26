# Free backend testing options for the existing platform

Researched 26 October 2026. The Netlify preview is separate from backend provisioning. This note creates no account, infrastructure, SMTP connection, payment transaction or paid commitment.

## Practical recommendation

For **temporary testing of the existing complete runtime**, first check eligibility for the **new AWS Free plan**. Use a small explicitly approved test VM to run the existing NestJS API, continuous worker, PostgreSQL 16 and real ClamAV, with the built UI on Netlify and HTTPS API routing. This keeps the existing architecture instead of rewriting workers into serverless functions.

This is a **credit-funded test period**, not indefinitely free hosting. AWS supplies eligible new customers $100 at signup and up to $100 more through activities. The Free plan ends after six months or credit exhaustion, whichever happens first. AWS closes the account at that point, so export test data before expiry. Stay on the Free plan; paid upgrades, AWS Organizations and other documented transitions can change the billing boundary. [AWS account-plan rules](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html).

AWS announced a new signup on 16 September 2026: **most new customers need no card initially**, and can use an existing Google/GitHub/Apple/Amazon login. This is not universal: extra verification may be required, and prior AWS customers may be ineligible and placed on a Paid plan. Check the actual signup screens before continuing. [Official launch announcement](https://aws.amazon.com/about-aws/whats-new/2026/09/New-AWS-Builder-Experience/), [Current AWS signup and eligibility](https://aws.amazon.com/start-here/).

The new experience's Free service list includes **EC2, EBS, Lightsail, RDS, SES and S3**. Service inclusion does not guarantee every instance size, region or feature is available. Multi-region/cross-region features are restricted; this is not evidence for the production recovery design. [Supported services](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html), [Project regions](https://docs.aws.amazon.com/accounts/latest/reference/project-regions.html).

The documented new signup currently assigns Indian contact addresses to **Sydney (`ap-southeast-2`)**, rather than Mumbai. Confirm the selected region before deployment and use fictional testing data. Selecting another region can require the advanced signup/features; do not activate these or change billing merely to match the production-region ADR. [Country-to-region mapping](https://docs.aws.amazon.com/accounts/latest/reference/project-regions.html).

Lightsail's old short free trials have been replaced by the AWS credit program for new customers. Do not follow an old “three months free” tutorial. A VM consumes credits while provisioned, so neither six months of eligibility nor the headline $200 guarantees that long a runtime. Build artifacts off the VM and plan a bounded test window. [Current Lightsail billing FAQ](https://docs.aws.amazon.com/en_en/lightsail/latest/userguide/amazon-lightsail-frequently-asked-questions-faq-billing-and-account-management.html).

## Comparison

| Option | Current allowance / conditions | Fit for the existing complete test runtime |
| --- | --- | --- |
| AWS Free plan | Credit-funded, max six months; new-customer eligibility; often no card for new signup | **Recommended first check for a temporary test VM.** Full OS permits ordinary processes and self-managed PostgreSQL/ClamAV. Confirm exact resource eligibility and cost before provisioning. |
| Oracle Always Free A1 | Current documented limit **2 OCPUs / 12 GB RAM**; home-region capacity; card verification | **Best ongoing-free VM candidate if obtainable.** ARM build/dependency compatibility must be verified. No availability or indefinite resource-retention guarantee. |
| Northflank Developer Sandbox | Two always-on services, one database, two jobs; payment method required | Possible basic API + worker + database trial. **Complete scanner/runtime fit not established**; confirm exact free memory, disk, SMTP egress and persistent state before selecting. |
| Render Free | Web services sleep after 15 idle minutes; SMTP 25/465/587 blocked; free database expires after 30 days; no free worker service type | **Does not fit the present full workflow.** Current SMTP adapter accepts only 465/587; sleeping services cannot supply the continuous worker as designed. |
| Koyeb Free | One 512 MB / 0.1 vCPU web instance, sleeps after one idle hour; no worker instances; free PostgreSQL only five active hours/month | **Does not fit the present full workflow.** Too little runtime/memory and no continuous free worker. |

Provider sources: [Oracle current resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Northflank pricing](https://northflank.com/pricing), [Northflank Sandbox/card rules](https://northflank.com/docs/v1/application/billing/pricing-on-northflank), [Render Free limitations](https://render.com/docs/free), [Koyeb instance limitations](https://www.koyeb.com/docs/reference/instances), [Koyeb free database limit](https://www.koyeb.com/docs/databases).

## Oracle details

Current Oracle documentation specifies **1,500 OCPU-hours and 9,000 GB-hours monthly**, equivalent to 2 OCPUs and 12 GB on Always Free tenancies. Older 4-OCPU/24-GB tutorials are not a safe basis for a new free account. Instances must be in the home region; available capacity is not guaranteed. Idle instances can be reclaimed after the documented seven-day utilization assessment. Keep independent copies of test data; do not create artificial workload to evade inactivity rules. [Current compute limits, capacity and reclamation](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

Oracle requires identity/contact and suitable credit/debit-card verification; temporary authorization holds can occur. Some debit/prepaid/virtual cards are not accepted. Always Free has no SLA or ordinary support entitlement. Do not upgrade to Pay As You Go merely to escape capacity problems without a separate billing decision. [Oracle Free Tier FAQ](https://www.oracle.com/cloud/free/faq/).

## Real test emails without buying a domain

Use a **dedicated eligible Gmail testing account**, sending as that same account. Gmail supports TLS SMTP at `smtp.gmail.com`, normally port 465 or 587. An app password requires 2-Step Verification and is unavailable for some account/security policies. Supply it through a protected environment file/provider secret, never chat or Git. This can test actual verification/reset delivery without purchasing a sending domain; it is not a production transactional-mail recommendation. [Google SMTP documentation](https://developers.google.com/workspace/gmail/imap/imap-smtp), [Google app-password requirements](https://support.google.com/mail/answer/185833).

The repository's `apps/api/src/mail.ts` already uses authenticated Nodemailer TLS, and `config.ts` only permits SMTP ports 465/587. Render Free's block therefore cannot be solved by changing one environment value to a different port. EC2's documented default email restriction concerns port 25; still test actual 465/587 connectivity and Gmail authentication on the selected host. [EC2 SMTP policy](https://aws.amazon.com/ec2/faqs/).

## Memory and deployment prerequisites

ClamAV's official recommendation is **3–4 GiB RAM for the scanner**, in addition to other running applications. A 512 MB free container or 1–2 GB VM is not a credible complete-platform host with real malware scanning. An 8 GB testing VM is a reasonable initial planning target, subject to actual memory measurement and approved credit usage. Oracle A1's current 12 GB allowance has enough nominal room; that is a sizing inference, not a measured acceptance result. [ClamAV system requirements](https://docs.clamav.net/Introduction.html), [Scanner engine/reload memory](https://docs.clamav.net/manual/Installing/Docker.html).

Minimum human setup before the agent can deploy:

1. Create the selected cloud account and complete identity/MFA checks; verify the actual **Free** plan, credits, expiry, region and resource eligibility. Account login, OTP/card checks remain the owner's responsibility.
2. Connect a scoped cloud CLI/project session or provide restricted SSH access to an approved VM. Do not share root login, card details or plaintext credentials in chat.
3. Prepare the dedicated SMTP testing account and enter its app password through protected configuration. Verify real receipt, including spam handling.
4. Provide a stable HTTPS API hostname. A paid domain is optional for evaluation: a free DDNS subdomain is possible, but needs its own account and TLS setup. Netlify routing must preserve the existing same-public-origin cookie/origin model. [DuckDNS official service](https://www.duckdns.org/faqs.jsp).
5. Approve a concrete resource list with a bounded test window and teardown/export plan. A free-plan account is not authorization to upgrade or create paid resources.

## What full testing still means

Public staging must use the real SMTP adapter, real scanner or explicitly unavailable uploads, separate test data/secrets and HTTPS. Do not expose development captured mail, fictional Guardian verification, fixture scanner or operator/bootstrap endpoints publicly. The production-runtime staging configuration requires its existing privacy/recovery readiness checks; do not bypass them to fit a free host.

Adult accounts, Tutor evidence/listings, Contact Requests and chat can be tested once backend setup and the required access entitlement flow are available. Live money is not required: payment-provider test mode needs actual sandbox credentials and the isolation policy the code enforces. Current production runtime explicitly rejects Razorpay test mode; a safe testing deployment design must account for this before claiming payment testing online. Never mark live merchant acceptance or Guardian verification complete from fixtures.

This recommendation does not replace ADR 0008's production decision or satisfy Task 28. It provides a realistic, source-backed way to obtain a temporary compatible test host while preserving those launch dependencies.
