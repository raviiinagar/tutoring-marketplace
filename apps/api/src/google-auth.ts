import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Config } from "./config.js";
import type { Database } from "./database.js";
import type { AuthService } from "./auth.js";
import { decrypt, encrypt, hashPassword, randomToken, tokenHash } from "./security.js";

// ADR0020: sign in with Google using the server-side authorization-code flow with PKCE.
const minute = 60_000;
const authorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const issuers = new Set(["https://accounts.google.com", "accounts.google.com"]);
export const googleBindingCookie = "tm_google_signin";

/** Where a failed or cancelled attempt sends the browser. */
export type GoogleOutcome = { location: string; session?: { token: string; expires: Date } };
const failure = (reason: "failed" | "cancelled" | "unavailable" | "account") => ({
  location: "/auth/signin?google=" + reason,
});

/** Only same-site paths, never protocol-relative or API addresses. */
export function safeReturnTo(value: unknown) {
  if (typeof value !== "string" || value.length > 200) return "/account";
  if (!/^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/?]*$/.test(value) || value.startsWith("/v1") || value.startsWith("/auth/"))
    return "/account";
  return value;
}

function claims(idToken: string) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("malformed id_token");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
}

export class GoogleSignIn {
  constructor(
    private readonly database: Database,
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly now: () => Date = () => new Date(),
    private readonly post: typeof fetch = fetch,
  ) {}

  get enabled() {
    return !!this.config.google;
  }

  /** Records a one-time attempt and returns Google's consent URL plus the browser binding. */
  async start(returnTo: unknown, ip: string) {
    const google = this.config.google;
    if (!google) return { location: failure("unavailable").location };
    await this.auth.limits.consume("google-start-ip", ip, 30, 15 * minute);
    const state = randomToken(),
      binding = randomToken(),
      nonce = randomToken(),
      verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const now = this.now();
    await this.database.transaction(async (client) => {
      await client.query("DELETE FROM oauth_states WHERE expires_at<$1", [new Date(now.getTime() - 60 * minute)]);
      await client.query(
        "INSERT INTO oauth_states(id,provider,state_hash,binding_hash,encrypted_secrets,return_to,created_at,expires_at) VALUES($1,'GOOGLE',$2,$3,$4,$5,$6,$7)",
        [randomUUID(), tokenHash(state), tokenHash(binding), encrypt({ verifier, nonce }, this.config.authSecret), safeReturnTo(returnTo), now, new Date(now.getTime() + 10 * minute)],
      );
    });
    const url = new URL(authorizeUrl);
    url.search = new URLSearchParams({
      client_id: google.clientId,
      redirect_uri: google.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return { location: url.toString(), binding, bindingExpires: new Date(now.getTime() + 10 * minute) };
  }

  /** Finishes an attempt: checks the state and browser, exchanges the code, then signs in. */
  async callback(query: Record<string, unknown>, binding: string | undefined, ip: string, correlation: string): Promise<GoogleOutcome> {
    const google = this.config.google;
    if (!google) return failure("unavailable");
    try {
      await this.auth.limits.consume("google-callback-ip", ip, 30, 15 * minute);
    } catch {
      return failure("failed");
    }
    const state = typeof query.state === "string" ? query.state : "";
    if (!state || !binding) return failure("failed");
    // Consume the attempt first, so a replayed or forged state can never be used twice.
    const attempt = await this.database.transaction(async (client) => {
      const row = (await client.query("SELECT * FROM oauth_states WHERE state_hash=$1 FOR UPDATE", [tokenHash(state)])).rows[0];
      if (!row || row.consumed_at || new Date(row.expires_at) <= this.now() || row.binding_hash !== tokenHash(binding)) return null;
      await client.query("UPDATE oauth_states SET consumed_at=$2 WHERE id=$1", [row.id, this.now()]);
      return { returnTo: row.return_to as string, ...decrypt<{ verifier: string; nonce: string }>(row.encrypted_secrets, this.config.authSecret) };
    });
    if (!attempt) return failure("failed");
    if (query.error) return failure(query.error === "access_denied" ? "cancelled" : "failed");
    if (typeof query.code !== "string" || !query.code) return failure("failed");

    let identity: { sub: string; email: string; name: string };
    try {
      const response = await this.post(google.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: query.code,
          client_id: google.clientId,
          client_secret: google.clientSecret,
          redirect_uri: google.redirectUri,
          grant_type: "authorization_code",
          code_verifier: attempt.verifier,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return failure("failed");
      const body = (await response.json()) as { id_token?: string };
      // The ID token comes straight from Google's token endpoint over TLS, so its signature
      // need not be re-verified (Google's OpenID guidance); its claims are still checked.
      const c = claims(body.id_token ?? "");
      const exp = typeof c.exp === "number" ? c.exp * 1000 : 0;
      if (!issuers.has(String(c.iss)) || c.aud !== google.clientId || exp <= this.now().getTime() || c.nonce !== attempt.nonce)
        return failure("failed");
      if (c.email_verified !== true || typeof c.email !== "string" || typeof c.sub !== "string" || !c.sub) return failure("account");
      const email = c.email.trim().toLowerCase();
      if (email.length > 254) return failure("account");
      const name = typeof c.name === "string" && c.name.trim().length >= 2 ? c.name.trim().slice(0, 80) : email.split("@")[0].slice(0, 80).padEnd(2, "_");
      identity = { sub: c.sub, email, name };
    } catch {
      return failure("failed");
    }

    // A random password hash nobody knows: a Google-created account can add one later through password reset.
    const unusablePassword = await hashPassword(randomToken());
    return this.database.transaction(async (client) => {
      const user = await this.resolve(client, identity, unusablePassword, correlation);
      if (!user) return failure("account");
      const token = randomToken(),
        now = this.now(),
        expires = new Date(now.getTime() + 7 * 24 * 60 * minute);
      await client.query("INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES($1,$2,$3,$4,$5)", [randomUUID(), user.id, tokenHash(token), expires, now]);
      await client.query("UPDATE user_identities SET last_used_at=$3 WHERE provider='GOOGLE' AND subject=$1 AND user_id=$2", [identity.sub, user.id, now]);
      await this.audit(client, user.id, "SESSION_CREATED", correlation, { method: "GOOGLE" });
      return { location: attempt.returnTo, session: { token, expires } };
    });
  }

  /** The linked account, a same-email account to link, or a new account. Null when it cannot sign in. */
  private async resolve(client: PoolClient, identity: { sub: string; email: string; name: string }, unusablePassword: string, correlation: string) {
    const now = this.now();
    const linked = (await client.query("SELECT user_id FROM user_identities WHERE provider='GOOGLE' AND subject=$1", [identity.sub])).rows[0];
    if (linked) {
      const user = (await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [linked.user_id])).rows[0];
      return user?.status === "ACTIVE" && user.email_verified_at ? user : null;
    }
    const existing = (await client.query("SELECT * FROM users WHERE email=$1 FOR UPDATE", [identity.email])).rows[0];
    if (existing) {
      if (existing.status === "DISABLED") return null;
      // An account already linked to a different Google account is not taken over.
      if ((await client.query("SELECT 1 FROM user_identities WHERE provider='GOOGLE' AND user_id=$1", [existing.id])).rowCount) return null;
      // Google verified this address, which also proves ownership of an unverified registration.
      if (existing.status === "PENDING" || !existing.email_verified_at)
        await client.query("UPDATE users SET status='ACTIVE',email_verified_at=COALESCE(email_verified_at,$2) WHERE id=$1", [existing.id, now]);
      await client.query("INSERT INTO user_identities(provider,subject,user_id,email,created_at,last_used_at) VALUES('GOOGLE',$1,$2,$3,$4,$4)", [identity.sub, existing.id, identity.email, now]);
      await this.audit(client, existing.id, "GOOGLE_ACCOUNT_LINKED", correlation, {});
      return (await client.query("SELECT * FROM users WHERE id=$1", [existing.id])).rows[0];
    }
    const id = randomUUID();
    await client.query(
      "INSERT INTO users(id,email,display_name,password_hash,email_verified_at,status,created_at) VALUES($1,$2,$3,$4,$5,'ACTIVE',$5)",
      [id, identity.email, identity.name, unusablePassword, now],
    );
    await client.query("INSERT INTO user_identities(provider,subject,user_id,email,created_at,last_used_at) VALUES('GOOGLE',$1,$2,$3,$4,$4)", [identity.sub, id, identity.email, now]);
    await this.audit(client, id, "ACCOUNT_REGISTERED", correlation, { method: "GOOGLE" });
    return (await client.query("SELECT * FROM users WHERE id=$1", [id])).rows[0];
  }

  private audit(client: PoolClient, userId: string, event: string, correlation: string, metadata: Record<string, unknown>) {
    return client.query("INSERT INTO audit_events(id,user_id,event_type,correlation_id,created_at,metadata) VALUES($1,$2,$3,$4,$5,$6)", [
      randomUUID(),
      userId,
      event,
      correlation,
      this.now(),
      metadata,
    ]);
  }
}
