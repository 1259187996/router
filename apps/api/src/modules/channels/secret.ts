import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const algorithm = 'aes-256-gcm';
const encoding = 'base64url';

function deriveEncryptionKey(secret: string) {
  return createHash('sha256').update(secret).digest();
}

export function encryptChannelSecret(plaintext: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, deriveEncryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return ['v1', iv.toString(encoding), authTag.toString(encoding), ciphertext.toString(encoding)].join(
    '.'
  );
}

export function decryptChannelSecret(ciphertext: string, secret: string) {
  const [version, ivEncoded, authTagEncoded, encryptedPayloadEncoded] = ciphertext.split('.');

  if (
    version !== 'v1' ||
    !ivEncoded ||
    !authTagEncoded ||
    !encryptedPayloadEncoded
  ) {
    throw new Error('Invalid encrypted channel secret');
  }

  const decipher = createDecipheriv(
    algorithm,
    deriveEncryptionKey(secret),
    Buffer.from(ivEncoded, encoding)
  );

  decipher.setAuthTag(Buffer.from(authTagEncoded, encoding));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPayloadEncoded, encoding)),
    decipher.final()
  ]).toString('utf8');
}
