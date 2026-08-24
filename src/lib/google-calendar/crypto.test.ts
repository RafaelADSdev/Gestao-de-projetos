import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "./crypto";

const secret = "test-only-secret-with-more-than-thirty-two-characters";

describe("encrypted Google Calendar secrets", () => {
  it("round-trips with authenticated encryption", () => {
    const encrypted = encryptSecret("refresh-token", secret, "refresh:abc");

    expect(encrypted).not.toContain("refresh-token");
    expect(decryptSecret(encrypted, secret, "refresh:abc")).toBe(
      "refresh-token",
    );
  });

  it("rejects ciphertext used for another purpose", () => {
    const encrypted = encryptSecret("refresh-token", secret, "refresh:abc");

    expect(() => decryptSecret(encrypted, secret, "access:abc")).toThrow();
  });
});
