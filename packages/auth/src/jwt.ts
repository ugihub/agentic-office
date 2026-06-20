/**
 * JWT RS256 — sign and verify tokens using jose library.
 *
 * RS256 = asymmetric. Private key signs (server only), public key verifies (all services).
 * Token rotation: issue new tokens with newIssueTime, allow grace period for old.
 *
 * CRITICAL: Private key MUST be in secrets manager (Doppler/Vault), not in code.
 */
import {
  SignJWT,
  jwtVerify,
  importPKCS8,
  importSPKI,
  type JWTPayload,
} from "jose";

// jose v5 no longer publicly exports the `KeyLike` type. For this
// Node.js service, the actual runtime type returned by importPKCS8 /
// importSPKI is a Node `KeyObject`. (A web `CryptoKey` would require
// adding `lib: ["dom"]` to tsconfig — overkill for a backend service
// that never runs in a browser.)
type JwtKey = Awaited<ReturnType<typeof importPKCS8>>;
import { type Result, ok, err } from "@bureau/shared-kernel";
import { UnauthorizedError } from "@bureau/shared-kernel";

export interface BureauJwtPayload extends JWTPayload {
  sub: string; // userId
  tenantId: string;
  permissions: string[];
  typ: "access";
}

export interface JwtSignOptions {
  subject: string; // userId
  tenantId: string;
  permissions: string[];
  expiresIn?: string; // default: '1h'
  issuer?: string;
}

export interface JwtVerifyOptions {
  issuer?: string;
  audience?: string;
  /**
   * Maximum acceptable age of the token in milliseconds, measured from
   * the `iat` claim. Defaults to 1h, overridable via JWT_MAX_AGE_MS.
   * Independent of `exp` — a token with `exp = +30d` is still rejected
   * once it's older than `maxAge`. BUG-9 mitigation.
   */
  maxAge?: number;
}

let _privateKey: JwtKey | null = null;
let _publicKey: JwtKey | null = null;

/** Initialize JWT keys from PEM strings. Call at service startup. */
export async function initJwtKeys(
  privateKeyPem: string,
  publicKeyPem: string,
): Promise<Result<void, Error>> {
  try {
    _privateKey = await importPKCS8(privateKeyPem, "RS256");
    _publicKey = await importSPKI(publicKeyPem, "RS256");
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Sign a JWT token. Requires initJwtKeys() to have been called.
 * Returns Result<token, Error>.
 */
export async function signJwt(
  options: JwtSignOptions,
): Promise<Result<string, Error>> {
  if (_privateKey === null) {
    return err(
      new Error(
        "JWT private key not initialized. Call initJwtKeys() at startup.",
      ),
    );
  }

  try {
    const issuer =
      options.issuer ?? process.env["JWT_ISSUER"] ?? "https://auth.bureau.id";
    const expiresIn = options.expiresIn ?? "1h";

    const token = await new SignJWT({
      tenantId: options.tenantId,
      permissions: options.permissions,
      typ: "access",
    } satisfies Omit<BureauJwtPayload, keyof JWTPayload>)
      .setProtectedHeader({ alg: "RS256" })
      .setSubject(options.subject)
      .setIssuer(issuer)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(_privateKey);

    return ok(token);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Verify a JWT token. Returns the decoded payload on success.
 * Returns UnauthorizedError on invalid/expired token.
 *
 * BUG-9 mitigation: we cap token age with `maxTokenAge` (default 1h,
 * override via JWT_MAX_AGE_MS or per-call options) so a token with a
 * long `exp` still cannot be replayed forever. This is a defence in
 * depth measure — signers should still mint short-lived tokens — but
 * it caps blast radius if a token leaks after issuance.
 */
export async function verifyJwt(
  token: string,
  options: JwtVerifyOptions = {},
): Promise<Result<BureauJwtPayload, UnauthorizedError>> {
  if (_publicKey === null) {
    return err(new UnauthorizedError("JWT public key not initialized"));
  }

  try {
    const issuer =
      options.issuer ?? process.env["JWT_ISSUER"] ?? "https://auth.bureau.id";
    const envMaxAge = process.env["JWT_MAX_AGE_MS"];
    const maxAge =
      options.maxAge ??
      (envMaxAge !== undefined && envMaxAge !== ""
        ? Number.parseInt(envMaxAge, 10)
        : 60 * 60 * 1000); // 1h default

    const { payload } = await jwtVerify(token, _publicKey, {
      issuer,
      algorithms: ["RS256"],
      // If the token is older than maxAge, reject — independent of `exp`.
      // jose throws JWTExpired if `iat + maxAge < now`.
      ...(Number.isFinite(maxAge) && maxAge > 0 ? { maxTokenAge: maxAge } : {}),
      clockTolerance: 0,
    });

    if (
      typeof payload["tenantId"] !== "string" ||
      !Array.isArray(payload["permissions"])
    ) {
      return err(new UnauthorizedError("Invalid token payload structure"));
    }

    return ok(payload as BureauJwtPayload);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Token verification failed";
    return err(new UnauthorizedError(`Invalid or expired token: ${message}`));
  }
}
