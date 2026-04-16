"use client";
// React Compiler is incompatible with react-hook-form's watch/Controller pattern.
// Disable memoization for this file.
"use no memo";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import type { IncomingEmail, Video } from "@/types";
import { VALID_LANGUAGES } from "@/lib/constants/languages";
import {
  sendEmailSchema,
  sendAllegroSchema,
  type SendEmailInput,
  type SendAllegroInput,
  type SendLanguage,
} from "@/lib/schemas/send";

import { EmailSelector } from "@/components/dashboard/send/email-selector";
import { VideoSelector } from "@/components/dashboard/send/video-selector";
import { EmailPreview } from "@/components/dashboard/send/email-preview";
import { SendResult } from "@/components/dashboard/send/send-result";
import { ModeToggle, type SendMode } from "@/components/dashboard/send/mode-toggle";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SendResultData = {
  shortLink: { url: string };
  landing: { url: string };
  sentEmail?: { status: string };
};

const LANGUAGE_OPTIONS: { value: SendLanguage; label: string }[] = [
  { value: "pl", label: "Polski" },
  { value: "uk", label: "Українська" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "lt", label: "Lietuvių" },
  { value: "et", label: "Eesti" },
  { value: "lv", label: "Latviešu" },
];

export default function SendPage() {
  const [mode, setMode] = useState<SendMode>("email");
  const [emails, setEmails] = useState<IncomingEmail[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [result, setResult] = useState<SendResultData | null>(null);
  const [resultLanguage, setResultLanguage] = useState<SendLanguage>("pl");
  const [apiError, setApiError] = useState("");
  const [pendingData, setPendingData] = useState<
    | { kind: "email"; data: SendEmailInput }
    | { kind: "allegro"; data: SendAllegroInput }
    | null
  >(null);

  const emailForm = useForm<SendEmailInput>({
    resolver: zodResolver(sendEmailSchema),
    mode: "onTouched",
    defaultValues: {
      mode: "email",
      emailId: "",
      videoId: "",
      language: "pl",
      personalNote: "",
    },
  });

  const allegroForm = useForm<SendAllegroInput>({
    resolver: zodResolver(sendAllegroSchema),
    mode: "onTouched",
    defaultValues: {
      mode: "allegro",
      productUrl: "",
      videoId: "",
      language: "pl",
    },
  });

  async function refetchVideos() {
    try {
      const r = await fetch("/api/videos");
      const d = r.ok ? await r.json() : [];
      setVideos(Array.isArray(d) ? d : []);
    } catch {
      // ignore
    }
  }

  // Load data
  useEffect(() => {
    fetch("/api/emails?filter=new&page=1")
      .then((r) => (r.ok ? r.json() : { emails: [] }))
      .then((d) => {
        setEmails(d.emails || []);
        setLoadingEmails(false);
      })
      .catch(() => setLoadingEmails(false));

    fetch("/api/videos")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        setVideos(Array.isArray(d) ? d : []);
        setLoadingVideos(false);
      })
      .catch(() => setLoadingVideos(false));

    fetch("/api/emails/sync", { method: "POST" }).catch(() => {});
    fetch("/api/videos/sync", { method: "POST" }).catch(() => {});
  }, []);

  async function handleNewVideo(videoId: string, which: "email" | "allegro") {
    await refetchVideos();
    if (which === "email") {
      emailForm.setValue("videoId", videoId, { shouldValidate: true });
    } else {
      allegroForm.setValue("videoId", videoId, { shouldValidate: true });
    }
  }

  const [selectedEmailId, setSelectedEmailId] = useState("");
  const [selectedVideoIdEmail, setSelectedVideoIdEmail] = useState("");
  const [selectedVideoIdAllegro, setSelectedVideoIdAllegro] = useState("");
  const [selectedLangEmail, setSelectedLangEmail] = useState<SendLanguage>("pl");
  const [personalNoteValue, setPersonalNoteValue] = useState("");

  useEffect(() => {
    const subscription = emailForm.watch((value) => {
      setSelectedEmailId(value.emailId || "");
      setSelectedVideoIdEmail(value.videoId || "");
      setSelectedLangEmail((value.language as SendLanguage) || "pl");
      setPersonalNoteValue(value.personalNote || "");
    });
    return () => subscription.unsubscribe();
  }, [emailForm]);

  useEffect(() => {
    const subscription = allegroForm.watch((value) => {
      setSelectedVideoIdAllegro(value.videoId || "");
    });
    return () => subscription.unsubscribe();
  }, [allegroForm]);

  const selectedEmailData = emails.find((e) => e.id === selectedEmailId);
  const selectedVideoData = videos.find(
    (v) => v.id === (mode === "email" ? selectedVideoIdEmail : selectedVideoIdAllegro),
  );

  function handleSelectEmail(id: string) {
    emailForm.setValue("emailId", id, { shouldValidate: true });
    const email = emails.find((e) => e.id === id);
    if (
      email?.customerLang &&
      VALID_LANGUAGES.includes(email.customerLang as SendLanguage)
    ) {
      emailForm.setValue("language", email.customerLang as SendLanguage);
    }
  }

  function onSubmitEmail(data: SendEmailInput) {
    setPendingData({ kind: "email", data });
  }

  function onSubmitAllegro(data: SendAllegroInput) {
    setPendingData({ kind: "allegro", data });
  }

  async function handleConfirmedSubmit() {
    if (!pendingData) return;
    const { kind, data } = pendingData;
    setPendingData(null);
    setApiError("");
    setResult(null);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = await res.json();
      if (!res.ok) {
        setApiError(
          payload.error ||
            (kind === "email" ? "Ошибка отправки" : "Ошибка генерации"),
        );
      } else {
        setResultLanguage(data.language);
        setResult(payload);
      }
    } catch {
      setApiError("Ошибка соединения");
    }
  }

  function handleReset() {
    setResult(null);
    setApiError("");
    emailForm.reset();
    allegroForm.reset();
  }

  function handleModeChange(newMode: SendMode) {
    setMode(newMode);
    setApiError("");
    setResult(null);
  }

  if (result) {
    return (
      <SendResult
        result={result}
        mode={mode}
        language={resultLanguage}
        onReset={handleReset}
      />
    );
  }

  const isAllegro = mode === "allegro";

  return (
    <div>
      <div className="mb-6">
        <ModeToggle mode={mode} onChange={handleModeChange} />
        <h1 className="mt-4 text-2xl font-bold text-gray-900">
          {isAllegro ? "Сгенерировать ссылку для Allegro" : "Отправить письмо"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isAllegro
            ? "Создайте короткую ссылку на лендинг с видеообзором"
            : "Выберите заявку и видео для отправки"}
        </p>
      </div>

      {apiError && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
          {apiError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isAllegro ? (
          <Form {...allegroForm}>
            <form
              onSubmit={allegroForm.handleSubmit(onSubmitAllegro)}
              className="space-y-6"
            >
              <div className="grid gap-2">
                <label
                  htmlFor="allegro-product-url"
                  className="text-sm font-semibold text-gray-900"
                >
                  1. Ссылка на товар на Allegro
                </label>
                <input
                  id="allegro-product-url"
                  type="url"
                  placeholder="https://allegro.pl/oferta/..."
                  {...allegroForm.register("productUrl")}
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-muted transition-colors aria-invalid:border-red-500 aria-invalid:ring-red-200"
                  aria-invalid={
                    !!allegroForm.formState.errors.productUrl
                  }
                />
                {allegroForm.formState.errors.productUrl && (
                  <p className="text-sm text-red-500">
                    {allegroForm.formState.errors.productUrl.message}
                  </p>
                )}
              </div>

              <FormField
                control={allegroForm.control}
                name="videoId"
                render={({ field }) => (
                  <FormItem>
                    <VideoSelector
                      videos={videos}
                      loading={loadingVideos}
                      selectedId={field.value}
                      onSelect={(id) =>
                        allegroForm.setValue("videoId", id, {
                          shouldValidate: true,
                        })
                      }
                      onVideoCreated={(id) => handleNewVideo(id, "allegro")}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-gray-900">
                  3. Настройки
                </h2>

                <FormField
                  control={allegroForm.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Язык лендинга</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) =>
                          field.onChange(v as SendLanguage)
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LANGUAGE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  size="lg"
                  disabled={allegroForm.formState.isSubmitting}
                  className="w-full bg-brand hover:bg-brand-hover text-white"
                >
                  {allegroForm.formState.isSubmitting
                    ? "Генерация..."
                    : "Сгенерировать ссылку"}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          <Form {...emailForm}>
            <form
              onSubmit={emailForm.handleSubmit(onSubmitEmail)}
              className="space-y-6"
            >
              <FormField
                control={emailForm.control}
                name="emailId"
                render={({ field }) => (
                  <FormItem>
                    <EmailSelector
                      emails={emails}
                      loading={loadingEmails}
                      selectedId={field.value}
                      onSelect={handleSelectEmail}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={emailForm.control}
                name="videoId"
                render={({ field }) => (
                  <FormItem>
                    <VideoSelector
                      videos={videos}
                      loading={loadingVideos}
                      selectedId={field.value}
                      onSelect={(id) =>
                        emailForm.setValue("videoId", id, {
                          shouldValidate: true,
                        })
                      }
                      onVideoCreated={(id) => handleNewVideo(id, "email")}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-gray-900">
                  3. Настройки
                </h2>

                {selectedEmailData && (
                  <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                    <span className="font-medium">
                      {selectedEmailData.customerName || "Клиент"}
                    </span>
                    {" → "}
                    <span>{selectedEmailData.customerEmail}</span>
                  </div>
                )}

                <FormField
                  control={emailForm.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Язык письма и лендинга</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) =>
                          field.onChange(v as SendLanguage)
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LANGUAGE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={emailForm.control}
                  name="personalNote"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Персональная заметка (опционально)</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder="Добавьте личное сообщение..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  size="lg"
                  disabled={emailForm.formState.isSubmitting}
                  className="w-full bg-brand hover:bg-brand-hover text-white"
                >
                  {emailForm.formState.isSubmitting
                    ? "Отправка..."
                    : "Отправить"}
                </Button>
              </div>
            </form>
          </Form>
        )}

        <div className="hidden lg:block">
          <div className="sticky top-8">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
              Предпросмотр
            </p>
            {isAllegro ? (
              <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
                <svg
                  className="w-12 h-12 text-gray-300 mx-auto mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                  />
                </svg>
                <p className="text-gray-400 text-sm">
                  После генерации вы получите короткую ссылку. Лендинг будет
                  показывать видеообзор и вести на товар Allegro.
                </p>
              </div>
            ) : (
              <EmailPreview
                email={selectedEmailData}
                video={selectedVideoData}
                language={selectedLangEmail}
                personalNote={personalNoteValue || ""}
              />
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingData}
        title={
          pendingData?.kind === "allegro"
            ? "Сгенерировать ссылку для Allegro?"
            : "Отправить email клиенту?"
        }
        description={
          pendingData?.kind === "allegro"
            ? "Будет создана короткая ссылка для Allegro."
            : "Клиент получит письмо с видеообзором."
        }
        confirmLabel={
          pendingData?.kind === "allegro" ? "Сгенерировать" : "Отправить"
        }
        onConfirm={handleConfirmedSubmit}
        onCancel={() => setPendingData(null)}
      />
    </div>
  );
}
