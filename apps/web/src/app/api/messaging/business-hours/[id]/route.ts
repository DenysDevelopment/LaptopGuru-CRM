import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_HOURS_MANAGE);
  if (error) return error;

  const { id } = await params;

  // Verify ownership
  const schedule = await prisma.businessHoursSchedule.findUnique({ where: { id }, select: { companyId: true } });
  if (!schedule || schedule.companyId !== (session.user.companyId ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { timezone, schedule: scheduleData } = body;

  // Update schedule metadata
  if (timezone) {
    await prisma.businessHoursSchedule.update({
      where: { id },
      data: { timezone },
    });
  }

  // Replace all slots if schedule data provided
  if (scheduleData) {
    await prisma.businessHoursSlot.deleteMany({ where: { scheduleId: id } });
    await prisma.businessHoursSlot.createMany({
      data: Object.entries(scheduleData as Record<string, DaySchedule>).map(
        ([day, data]) => ({
          scheduleId: id,
          dayOfWeek: REVERSE_DAY_MAP[day] as "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY",
          startTime: data.startTime,
          endTime: data.endTime,
          isActive: data.enabled,
        }),
      ),
    });
  }

  const updated = await prisma.businessHoursSchedule.findUnique({
    where: { id },
    include: { slots: true },
  });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const scheduleMap: Record<string, DaySchedule> = {};
  for (const slot of updated.slots) {
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
    id: updated.id,
    timezone: updated.timezone,
    schedule: scheduleMap,
  });
}
