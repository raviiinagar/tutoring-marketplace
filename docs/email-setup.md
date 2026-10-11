# Set up real verification email

Owner decision: defer live email-provider and sender-domain setup until a domain is purchased. Continue testing with `MAIL_TRANSPORT=capture`; use `/dev/inbox` in the running local app to open verification links. No provider account or domain purchase is required for this local flow. The steps below are for the later SMTP setup, not a prerequisite for continuing implementation.

Recommended starting provider: Brevo, because its SMTP service works with the existing mail adapter. Its free plan currently allows 300 emails per day; this is a development starting point, not a launch capacity guarantee. [Official plan details](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans). Checked 11 October 2026. Provider account creation and sender approval remain pending.

1. Create your own account at [Brevo](https://www.brevo.com/) and complete its account verification.
2. Add a sender under **Settings → Senders, Domains & IPs → Senders** and complete sender verification. For the production sender, use a domain you control and authenticate it using the DNS records shown by Brevo. A free mailbox sender may be rewritten by Brevo; it does not replace production domain authentication. [Sender setup](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email), [sender requirements](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders).
3. Ensure transactional sending is activated. If pending or blocked, follow the account's activation instructions or contact provider support. [Activation troubleshooting](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP).
4. Open the account's **SMTP & API → SMTP** settings. Copy the displayed SMTP login and generate an **SMTP key**, not an API key or your account password. [Official SMTP instructions](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).
5. Stop `npm run dev`. Edit the existing `.env` locally, replacing the placeholders below. Keep all existing database, secret and web-origin settings unchanged:

```dotenv
MAIL_TRANSPORT=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=YOUR_SMTP_LOGIN_FROM_BREVO
SMTP_PASSWORD=YOUR_SMTP_KEY
SMTP_FROM=YOUR_VERIFIED_SENDER_EMAIL
```

Store these values only in the local ignored `.env`. Do not send the key through chat or commit it. Keep `NODE_ENV=development` for local testing; SMTP mode does not require production mode. The adapter requires STARTTLS on port 587.

6. Restart `npm run dev`. The worker should report `transport smtp`. Open `/auth/check-email`, enter your existing unverified email, and select **Send new verification email**. Alternatively create a new account. Re-registering an existing pending email does not resend its original message. Previously captured emails are not automatically sent again.
7. Check your mailbox and spam folder, and the provider's transactional logs. Open the fresh verification link within 15 minutes. Links point to `WEB_ORIGIN`; localhost links work on the same computer running the app, not another device or a hosted Lovable preview.

The software already supports SMTP. No live delivery test can be completed until your account, sender and credentials are configured. Once configured, ask Codex to verify configuration and delivery status without printing secrets. If your account is already verified, use a new test account rather than expecting another verification email for it.
