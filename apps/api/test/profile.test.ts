import { afterEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { createApp } from "../src/app.js";
import { IdentityNotConfiguredError } from "../src/identity-verifier.js";
import { createProfileTypedData } from "../src/profile-signature.js";
import { MemoryCourseRepository, MemoryProfileRepository } from "./helpers.js";

const accountA = privateKeyToAccount("0x0000000000000000000000000000000000000000000000000000000000000001");
const accountB = privateKeyToAccount("0x0000000000000000000000000000000000000000000000000000000000000002");
const didA = "did:privy:user-a";
const didB = "did:privy:user-b";
const apps: ReturnType<typeof createApp>[] = [];

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function setup(initialTime = new Date("2026-08-12T10:00:00.000Z")) {
  let currentTime = initialTime;
  const profiles = new MemoryProfileRepository();
  const app = createApp({
    courses: new MemoryCourseRepository(),
    profiles,
    purchases: { hasPurchased: async () => false },
    identities: {
      async verify(token) {
        if (token === "token-a") return { privyDid: didA, wallets: [accountA.address] };
        if (token === "token-b") return { privyDid: didB, wallets: [accountB.address] };
        throw new Error("invalid token");
      },
    },
    now: () => currentTime,
  });
  apps.push(app);
  return { app, profiles, advance: (milliseconds: number) => { currentTime = new Date(currentTime.getTime() + milliseconds); } };
}

const authA = { authorization: "Bearer token-a" };

async function issueAndSign(app: ReturnType<typeof createApp>, username = "alice") {
  const nonceResponse = await app.inject({
    method: "POST", url: "/profile/nonce", headers: authA, payload: { wallet: accountA.address, username },
  });
  expect(nonceResponse.statusCode).toBe(200);
  const challenge = nonceResponse.json();
  const signature = await accountA.signTypedData({
    ...challenge.typedData,
    message: { ...challenge.typedData.message, expiresAt: BigInt(challenge.typedData.message.expiresAt) },
  });
  return { challenge, signature };
}

function updatePayload(challenge: any, signature: `0x${string}`) {
  return {
    wallet: challenge.typedData.message.wallet,
    username: challenge.typedData.message.username,
    nonce: challenge.typedData.message.nonce,
    expiresAt: Number(challenge.typedData.message.expiresAt),
    chainId: challenge.chainId,
    signature,
  };
}

describe("Privy authenticated profile updates", () => {
  it("requires a valid bearer token", async () => {
    const { app } = setup();
    expect((await app.inject({ method: "GET", url: "/profile" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/profile", headers: { authorization: "Bearer bad" } })).statusCode).toBe(401);
  });

  it("reports an unavailable identity service when Privy is not configured", async () => {
    const { app } = setup();
    const unavailableApp = createApp({
      courses: new MemoryCourseRepository(),
      profiles: new MemoryProfileRepository(),
      purchases: { hasPurchased: async () => false },
      identities: { verify: async () => { throw new IdentityNotConfiguredError(); } },
    });
    apps.push(unavailableApp);
    const response = await unavailableApp.inject({
      method: "GET",
      url: "/profile",
      headers: { authorization: "Bearer any-token" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("identity_not_configured");
  });

  it("rejects a wallet that is not linked to the authenticated user", async () => {
    const { app } = setup();
    const response = await app.inject({
      method: "POST", url: "/profile/nonce", headers: authA,
      payload: { wallet: accountB.address, username: "alice" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("wallet_not_linked");
  });

  it("updates a profile once and blocks replay", async () => {
    const { app } = setup();
    const { challenge, signature } = await issueAndSign(app);
    const payload = updatePayload(challenge, signature);
    expect((await app.inject({ method: "PATCH", url: "/profile", headers: authA, payload })).statusCode).toBe(200);
    const replay = await app.inject({ method: "PATCH", url: "/profile", headers: authA, payload });
    expect(replay.statusCode).toBe(409);
    expect(replay.json().error.code).toBe("nonce_invalid_or_used");
  });

  it("updates a profile when the challenge is issued between whole seconds", async () => {
    const { app } = setup(new Date("2026-08-12T10:00:00.537Z"));
    const { challenge, signature } = await issueAndSign(app, "alice-ms");
    const response = await app.inject({
      method: "PATCH",
      url: "/profile",
      headers: authA,
      payload: updatePayload(challenge, signature),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().profile.username).toBe("alice-ms");
  });

  it("rejects an expired challenge", async () => {
    const { app, advance } = setup();
    const { challenge, signature } = await issueAndSign(app);
    advance(5 * 60 * 1000 + 1);
    expect((await app.inject({ method: "PATCH", url: "/profile", headers: authA, payload: updatePayload(challenge, signature) })).statusCode).toBe(409);
  });

  it("rejects token and wallet mixing", async () => {
    const { app } = setup();
    const { challenge, signature } = await issueAndSign(app);
    const response = await app.inject({
      method: "PATCH", url: "/profile", headers: { authorization: "Bearer token-b" }, payload: updatePayload(challenge, signature),
    });
    expect(response.statusCode).toBe(403);
  });

  it("rejects username tampering", async () => {
    const { app } = setup();
    const { challenge, signature } = await issueAndSign(app);
    const response = await app.inject({
      method: "PATCH", url: "/profile", headers: authA,
      payload: { ...updatePayload(challenge, signature), username: "mallory" },
    });
    expect(response.statusCode).toBe(409);
  });

  it("rejects wrong chainId and domain signatures", async () => {
    const { app } = setup();
    const { challenge } = await issueAndSign(app);
    const message = { ...challenge.typedData.message, expiresAt: BigInt(challenge.typedData.message.expiresAt) };
    const wrongDomainSignature = await accountA.signTypedData({
      ...createProfileTypedData(message),
      domain: { name: "OtherApp", version: "1", chainId: challenge.chainId },
    });
    const wrongDomain = await app.inject({
      method: "PATCH", url: "/profile", headers: authA, payload: updatePayload(challenge, wrongDomainSignature),
    });
    expect(wrongDomain.statusCode).toBe(403);

    const { challenge: second, signature } = await issueAndSign(app, "alice2");
    const wrongChain = await app.inject({
      method: "PATCH", url: "/profile", headers: authA,
      payload: { ...updatePayload(second, signature), chainId: second.chainId + 1 },
    });
    expect(wrongChain.statusCode).toBe(400);
  });
});
