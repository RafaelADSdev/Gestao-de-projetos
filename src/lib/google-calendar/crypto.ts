import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ENCRYPTION_VERSION = "v1";
const IV_BYTES = 12;

function encryptionKey(secret: string): Buffer {
  if (secret.length < 32) {
    throw new Error(
      "GOOGLE_CALENDAR_ENCRYPTION_KEY deve ter pelo menos 32 caracteres aleatórios.",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSecret(
  plaintext: string,
  secret: string,
  purpose: string,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(purpose, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptSecret(
  encrypted: string,
  secret: string,
  purpose: string,
): string {
  const [version, ivValue, ciphertextValue, tagValue, extra] =
    encrypted.split(".");
  if (
    version !== ENCRYPTION_VERSION ||
    !ivValue ||
    !ciphertextValue ||
    !tagValue ||
    extra
  ) {
    throw new Error("Valor criptografado inválido.");
  }

  const iv = Buffer.from(ivValue, "base64url");
  const ciphertext = Buffer.from(ciphertextValue, "base64url");
  const tag = Buffer.from(tagValue, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== 16) {
    throw new Error("Valor criptografado inválido.");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
  decipher.setAAD(Buffer.from(purpose, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
