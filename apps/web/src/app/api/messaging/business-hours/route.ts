import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@shorterlink/shared";

const DAY_MAP: Record<string, string> = {
  MONDAY: "monday",
  TUESDAY: "tuesday",
  WEDNESDAY: "wednesday",
  THURSDAY: "thursday",
  FRIDAY: "friday",
  SATURDAY: "saturday",
  SUNDAY: "sunday",
};

const REVERSE_DAY_MAP: Record<string, string> = {
  monday: "MONDAY",
  tuesday: "TUESDAY",
  wednesday: "WEDNESDAY",
  thursday: "THURSDAY",
  friday: "FRIDAY",
  saturday: "SATURDAY",
  sunday: "SUNDAY",
};

interface DaySchedule {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export async function GET() {
  const { error } = await authorize(PERMISSIONS.MESSAGING_HOURS_MANAGE);
  if (error) return error;

  const schedule = await prisma.businessHoursSchedule.findFirst({
    where: { isDefault: true },
    include: {
      slots: true,
    },
  });

  if (!schedule) {
    return NextResponse.json(null);
  }

  // Convert slots into frontend schedule format
  const scheduleMap: Record<string, DaySchedule> = {};
  for (const day of Object.values(DAY_MAP)) {
    scheduleMap[day] = { enabled: false, startTime: "09:00", endTime: "18:00" };
  }

  for (const slot of schedule.slots) {
    const dayKey = DAY_MAP[slot.dayOfWeek];
    if (dayKey) {
      scheduleMap[dayKey] = {
        enabled: slot.isActive,
        startTime: slot.startTime,
        endTime: slot.endTime,
      };
    }
  }

  return NextResponse.json({
    id: schedule.id,
    timezone: schedule.timezone,
    schedule: scheduleMap,
  });
}

export async function POST(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_HOURS_MANAGE);
  if (error) return error;

  const body = await request.json();
  const { timezone, schedule: scheduleData } = body;

  const created = await prisma.businessHoursSchedule.create({
    data: {
      name: "Default",
      timezone: timezone || "Europe/Warsaw",
      isDefault: true,
      companyId: session.user!.companyId ?? "",
      slots: {
        create: Object.entries(scheduleData as Record<string, DaySchedule>).map(
          ([day, data]) => ({
            dayOfWeek: REVERSE_DAY_MAP[day] as "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY",
            startTime: data.startTime,
            endTime: data.endTime,
            isActive: data.enabled,
          }),
        ),
      },
    },
    include: { slots: true },
  });

  const scheduleMap: Record<string, DaySchedule> = {};
  for (const slot of created.slots) {
    const dayKey = DAY_MAP[slot.dayOfWeek];
    if (dayKey) {
      scheduleMap[dayKey] = {
        enabled: slot.isActive,
        startTime: slot.startTime,
        endTime: slot.endTime,
      };
    }
  }

  return NextResponse.json(
    { id: created.id, timezone: created.timezone, schedule: scheduleMap },
    { status: 201 },
  );
}
