import { prisma } from "@/lib/db";
import { nanoid } from "./nanoid";

export function generateSlug(): string {
  return nanoid(8);
}

export function generateShortCode(): string {
  return nanoid(6);
}

export async function createShortLink(landingId: string): Promise<string> {
  let code = generateShortCode();

  // Fetch landing to get companyId
  const landing = await prisma.landing.findUnique({ where: { id: landingId }, select: { companyId: true } });
  const companyId = landing?.companyId ?? "";

  // Ensure uniqueness
  while (await prisma.shortLink.findUnique({ where: { code } })) {
    code = generateShortCode();
  }

  await prisma.shortLink.create({
    data: { code, landingId, companyId },
  });

  return code;
}
