import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { Metadata } from "next";
import { LandingClient } from "./landing-client";
import { signVideoUrl } from "@/lib/cloudfront-signer";
import { resolveCompanyFromDomain } from "@/lib/domain";

// CloudFront signer uses node:crypto — must not run on Edge
export const runtime = "nodejs";

interface Props {
  params: Promise<{ slug: string }>;
}

const metaByLang: Record<string, { desc: string; og: string }> = {
  pl: { desc: "Recenzja wideo od laptopguru.pl", og: "Obejrzyj recenzję wideo od laptopguru.pl" },
  uk: { desc: "Відеоогляд від laptopguru.pl", og: "Дивіться відеоогляд від laptopguru.pl" },
  ru: { desc: "Видеообзор от laptopguru.pl", og: "Смотрите видеообзор от laptopguru.pl" },
  en: { desc: "Video review from laptopguru.pl", og: "Watch a video review from laptopguru.pl" },
};

// Strip common landing-subdomain prefixes to get the apex domain the favicon
// should come from: `l.laptopguru.pl` -> `laptopguru.pl`. Multi-label public
// suffixes (e.g. co.uk) are rare here, so we only peel a single known prefix.
const FAVICON_SUBDOMAIN_PREFIXES = ["l.", "landing.", "www."];
function apexFromCustomDomain(customDomain: string): string {
  const lower = customDomain.toLowerCase();
  for (const prefix of FAVICON_SUBDOMAIN_PREFIXES) {
    if (lower.startsWith(prefix)) return lower.slice(prefix.length);
  }
  return lower;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const companyId = await resolveCompanyFromDomain();
  const landing = await prisma.landing.findFirst({
    where: { slug, ...(companyId ? { companyId } : {}) },
    include: { video: true, company: { select: { customDomain: true } } },
  });

  if (!landing) return {};

  const lang = landing.language || "pl";
  const meta = metaByLang[lang] || metaByLang.pl;

  // Pull the favicon from the company's public site so the landing tab icon
  // matches the parent brand (e.g. laptopguru.pl) instead of the CRM's default.
  // Google's s2 service returns an icon for any domain without needing to
  // parse Shopify's versioned <link rel="icon"> CDN URL.
  const customDomain = landing.company?.customDomain;
  const icons = customDomain
    ? {
        icon: `https://www.google.com/s2/favicons?domain=${apexFromCustomDomain(customDomain)}&sz=64`,
      }
    : undefined;

  return {
    title: landing.title,
    description: `${meta.desc} — ${landing.video.title}`,
    openGraph: {
      title: landing.title,
      description: meta.og,
      images: [landing.video.thumbnail],
    },
    ...(icons && { icons }),
  };
}

export default async function LandingPage({ params }: Props) {
  const { slug } = await params;
  const companyId = await resolveCompanyFromDomain();

  const landing = await prisma.landing.findFirst({
    where: { slug, ...(companyId ? { companyId } : {}) },
    include: { video: true },
  });

  if (!landing) notFound();

  // Increment views
  await prisma.landing.update({
    where: { id: landing.id },
    data: { views: { increment: 1 } },
  });

  const lang = (landing.language || "pl") as "pl" | "uk" | "ru" | "en" | "lt" | "et" | "lv";

  // For S3 videos, generate signed CloudFront URL
  const video = landing.video;
  const isS3 = video.source === "S3" && video.s3KeyOutput;
  let signedVideoUrl: string | null = null;
  if (isS3) {
    try {
      signedVideoUrl = signVideoUrl(video.s3KeyOutput!);
    } catch {
      // CloudFront not configured — fall back to no video
    }
  }

  return (
    <LandingClient
      landing={{
        id: landing.id,
        slug: landing.slug,
        title: landing.title,
        productUrl: landing.productUrl,
        buyButtonText: landing.buyButtonText,
        personalNote: landing.personalNote,
        customerName: landing.customerName,
        productName: landing.productName,
        language: lang,
        type: landing.type,
      }}
      video={{
        id: video.id,
        source: video.source,
        youtubeId: video.youtubeId,
        videoUrl: signedVideoUrl,
        thumbnail: video.thumbnail,
        title: video.title,
        durationSeconds: video.durationSeconds,
      }}
    />
  );
}
