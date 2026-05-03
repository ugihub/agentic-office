/**
 * JWT RS256 — sign and verify tokens using jose library.
 *
 * RS256 = asymmetric. Private key signs (server only), public key verifies (all services).
 * Token rotation: issue new tokens with newIssueTime, allow grace period for old.
 *
 * CRITICAL: Private key MUST be in secrets manager (Doppler/Vault), not in code.
 */
import { SignJWT, jwtVerify, importPKCS8, importSPKI, type JWTPayload } from 'jose'
import { type Result, ok, err } from '@bureau/shared-kernel'
import { UnauthorizedError } from '@bureau/shared-kernel'

export interface BureauJwtPayload extends JWTPayload {
  sub: string           // userId
  tenantId: string
  permissions: string[]
  typ: 'access'
}

export interface JwtSignOptions {
  subject: string        // userId
  tenantId: string
  permissions: string[]
  expiresIn?: string     // default: '1h'
  issuer?: string
}

export interface JwtVerifyOptions {
  issuer?: string
  audience?: string
}

let _privateKey: CryptoKey | null = null
let _publicKey: CryptoKey | null = null

/** Initialize JWT keys from PEM strings. Call at service startup. */
export async function initJwtKeys(
  privateKeyPem: string,
  publicKeyPem: string,
): Promise<void> {
  _privateKey = await importPKCS8(privateKeyPem, 'RS256')
  _publicKey = await importSPKI(publicKeyPem, 'RS256')
}

/**
 * Sign a JWT token. Requires initJwtKeys() to have been called.
 * Returns Result<token, Error>.
 */
export async function signJwt(options: JwtSignOptions): Promise<Result<string, Error>> {
  if (_privateKey === null) {
    return err(new Error('JWT private key not initialized. Call initJwtKeys() at startup.'))
  }

  try {
    const issuer = options.issuer ?? process.env['JWT_ISSUER'] ?? 'https://auth.bureau.id'
    const expiresIn = options.expiresIn ?? '1h'

    const token = await new SignJWT({
      tenantId: options.tenantId,
      permissions: options.permissions,
      typ: 'access',
    } satisfies Omit<BureauJwtPayload, keyof JWTPayload>)
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(options.subject)
      .setIssuer(issuer)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(_privateKey)

    return ok(token)
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Verify a JWT token. Returns the decoded payload on success.
 * Returns UnauthorizedError on invalid/expired token.
 */
export async function verifyJwt(
  token: string,
  options: JwtVerifyOptions = {},
): Promise<Result<BureauJwtPayload, UnauthorizedError>> {
  if (_publicKey === null) {
    return err(new UnauthorizedError('JWT public key not initialized'))
  }

  try {
    const issuer = options.issuer ?? process.env['JWT_ISSUER'] ?? 'https://auth.bureau.id'

    const { payload } = await jwtVerify(token, _publicKey, {
      issuer,
      algorithms: ['RS256'],
    })

    if (
      typeof payload['tenantId'] !== 'string' ||
      !Array.isArray(payload['permissions'])
    ) {
      return err(new UnauthorizedError('Invalid token payload structure'))
    }

    return ok(payload as BureauJwtPayload)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Token verification failed'
    return err(new UnauthorizedError(`Invalid or expired token: ${message}`))
  }
}
