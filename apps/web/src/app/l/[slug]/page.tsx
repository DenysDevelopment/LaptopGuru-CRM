import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { Metadata } from "next";
import { LandingClient } from "./landing-client";
import { signVideoUrl } from "@/lib/cloudfront-signer";

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const landing = await prisma.landing.findFirst({
    where: { slug },
    include: { video: true },
  });

  if (!landing) return {};

  const lang = landing.language || "pl";
  const meta = metaByLang[lang] || metaByLang.pl;

  return {
    title: landing.title,
    description: `${meta.desc} — ${landing.video.title}`,
    openGraph: {
      title: landing.title,
      description: meta.og,
      images: [landing.video.thumbnail],
    },
  };
}

export default async function LandingPage({ params }: Props) {
  const { slug } = await params;

  const landing = await prisma.landing.findFirst({
    where: { slug },
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
