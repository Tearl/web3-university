import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.js";
import type { CreateProfileNonceInput, ProfileRepository } from "./types.js";

export class PrismaProfileRepository implements ProfileRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  findProfile(privyDid: string) {
    return this.client.user.findUnique({
      where: { privyDid },
      select: { privyDid: true, walletAddress: true, username: true },
    });
  }

  createNonce(input: CreateProfileNonceInput) {
    return this.client.profileNonce.create({ data: input });
  }

  findNonce(nonce: string) {
    return this.client.profileNonce.findUnique({
      where: { nonce },
      select: {
        privyDid: true,
        wallet: true,
        username: true,
        chainId: true,
        nonce: true,
        expiresAt: true,
        usedAt: true,
      },
    });
  }

  async consumeNonceAndUpdateProfile(input: CreateProfileNonceInput, now: Date) {
    return this.client.$transaction(async (transaction) => {
      const consumed = await transaction.profileNonce.updateMany({
        where: {
          nonce: input.nonce,
          privyDid: input.privyDid,
          wallet: input.wallet,
          username: input.username,
          chainId: input.chainId,
          expiresAt: input.expiresAt,
          usedAt: null,
          AND: { expiresAt: { gt: now } },
        },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) return "invalid_or_used" as const;

      await transaction.user.upsert({
        where: { privyDid: input.privyDid },
        create: { privyDid: input.privyDid, walletAddress: input.wallet, username: input.username },
        update: { walletAddress: input.wallet, username: input.username },
      });
      return "updated" as const;
    });
  }

  async disconnect() {
    await this.client.$disconnect();
  }
}
