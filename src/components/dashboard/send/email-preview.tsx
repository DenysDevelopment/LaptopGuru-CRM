"use client";

import Image from "next/image";
import type { IncomingEmail, Video } from "@/types";

const greetings = { pl: "Witamy", uk: "Вітаємо", ru: "Здравствуйте", en: "Hello" };
const fallbackNames = { pl: "Kliencie", uk: "Клієнт", ru: "Клиент", en: "Customer" };
const badges = { pl: "Osobista recenzja wideo", uk: "Персональний відео-огляд", ru: "Персональный видеообзор", en: "Personal video review" };
const intros = {
  pl: "Nasz ekspert przygotował recenzję wideo specjalnie dla Ciebie",
  uk: "Наш експерт підготував відео-огляд спеціально для вас",
  ru: "Наш эксперт подготовил видеообзор специально для вас",
  en: "Our expert has prepared a video review especially for you",
};
const ctas = { pl: "Obejrzyj recenzję", uk: "Дивитися огляд", ru: "Смотреть обзор", en: "Watch review" };

interface EmailPreviewProps {
  email: IncomingEmail | undefined;
  video: Video | undefined;
  language: "pl" | "uk" | "ru" | "en";
  personalNote: string;
}

export function EmailPreview({ email, video, language, personalNote }: EmailPreviewProps) {
  if (!email || !video) {
    return (
      <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
        <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
        </svg>
        <p className="text-gray-400 text-sm">Выберите заявку и видео для предварительного просмотра</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 shadow-lg overflow-hidden bg-white">
      {/* Browser bar */}
      <div className="bg-gray-100 h-8 flex items-center px-3 gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        <span className="ml-2 text-[10px] text-gray-400 truncate">email preview</span>
      </div>

      <div className="text-xs">
        {/* Header */}
        <div className="bg-[#fb7830] p-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LG_logo2.webp" alt="Laptop Guru" className="h-12 mx-auto brightness-0 invert" />
          <p className="text-white/80 text-[10px] uppercase tracking-wider mt-1">
            {badges[language]}
          </p>
        </div>

        {/* Body */}
        <div className="p-4">
          <p className="font-bold text-gray-900 text-sm mb-1">
            {greetings[language]}, {email.customerName || fallbackNames[language]}!
          </p>
          <p className="text-gray-500 mb-3">{intros[language]}</p>

          {personalNote && (
            <div className="bg-orange-50 border-l-2 border-[#fb7830] p-2 mb-3 italic text-gray-600 rounded-r">
              {personalNote}
            </div>
          )}

          <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100 mb-3">
            <Image src={video.thumbnail} alt={video.title} fill className="object-cover" sizes="300px" />
          </div>
          <p className="font-medium text-gray-800 mb-3">{video.title}</p>

          <div className="text-center">
            <span className="inline-block bg-[#fb7830] text-white px-6 py-2 rounded-lg font-bold text-[11px]">
              {ctas[language]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
