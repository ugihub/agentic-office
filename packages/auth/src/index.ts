/**
 * @bureau/auth
 *
 * JWT RS256 signing/verification + API key management.
 * CRITICAL: Private keys via Doppler/Vault only, never in code.
 */

export {
  initJwtKeys,
  signJwt,
  verifyJwt,
  type BureauJwtPayload,
  type JwtSignOptions,
  type JwtVerifyOptions,
} from "./jwt.js";

export {
  generateApiKey,
  hashApiKey,
  isValidApiKeyFormat,
  extractKeyPrefix,
  encryptProviderKey,
  decryptProviderKey,
  type GeneratedApiKey,
  type ApiKeyEnvironment,
} from "./apikey.js";
