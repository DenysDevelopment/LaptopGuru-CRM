import { z } from "zod";

export const TIMEZONES = [
  "Europe/Warsaw",
  "Europe/Moscow",
  "Europe/Kiev",
  "Europe/London",
  "America/New_York",
  "UTC",
] as const;

export const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type DayKey = (typeof DAY_KEYS)[number];

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const daySchema = z
  .object({
    enabled: z.boolean(),
    startTime: z
      .string()
      .regex(timeRegex, "Формат HH:MM"),
    endTime: z
      .string()
      .regex(timeRegex, "Формат HH:MM"),
  })
  .refine(
    (v) => !v.enabled || v.startTime < v.endTime,
    { message: "Время начала должно быть раньше окончания", path: ["endTime"] },
  );

export const businessHoursSchema = z.object({
  timezone: z.enum(TIMEZONES),
  schedule: z.object({
    monday: daySchema,
    tuesday: daySchema,
    wednesday: daySchema,
    thursday: daySchema,
    friday: daySchema,
    saturday: daySchema,
    sunday: daySchema,
  }),
});

export type BusinessHoursInput = z.infer<typeof businessHoursSchema>;
