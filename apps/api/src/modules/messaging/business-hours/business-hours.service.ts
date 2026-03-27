import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateScheduleDto, UpdateScheduleDto, CreateSlotDto } from './dto/create-schedule.dto';

@Injectable()
export class BusinessHoursService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.businessHoursSchedule.findMany({
      include: { slots: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const schedule = await this.prisma.businessHoursSchedule.findUnique({
      where: { id },
      include: { slots: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] } },
    });
    if (!schedule) throw new NotFoundException(`Schedule ${id} not found`);
    return schedule;
  }

  async create(dto: CreateScheduleDto) {
    if (dto.isDefault) {
      await this.prisma.businessHoursSchedule.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.businessHoursSchedule.create({
      data: {
        name: dto.name,
        timezone: dto.timezone ?? 'Europe/Warsaw',
        isDefault: dto.isDefault ?? false,
      },
      include: { slots: true },
    });
  }

  async update(id: string, dto: UpdateScheduleDto) {
    await this.ensureExists(id);

    if (dto.isDefault) {
      await this.prisma.businessHoursSchedule.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.businessHoursSchedule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
      include: { slots: true },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.businessHoursSchedule.delete({ where: { id } });
  }

  async addSlot(scheduleId: string, dto: CreateSlotDto) {
    await this.ensureExists(scheduleId);
    return this.prisma.businessHoursSlot.create({
      data: {
        scheduleId,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });
  }

  async removeSlot(scheduleId: string, slotId: string) {
    const slot = await this.prisma.businessHoursSlot.findFirst({
      where: { id: slotId, scheduleId },
    });
    if (!slot) throw new NotFoundException(`Slot ${slotId} not found in schedule ${scheduleId}`);
    return this.prisma.businessHoursSlot.delete({ where: { id: slotId } });
  }

  async checkCurrent(): Promise<{ withinBusinessHours: boolean; schedule: string | null; timezone: string | null }> {
    const schedule = await this.prisma.businessHoursSchedule.findFirst({
      where: { isDefault: true },
      include: { slots: true },
    });

    if (!schedule) {
      return { withinBusinessHours: false, schedule: null, timezone: null };
    }

    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: schedule.timezone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const weekday = parts.find((p) => p.type === 'weekday')?.value?.toUpperCase() as DayOfWeek | undefined;
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
    const currentTime = `${hour}:${minute}`;

    if (!weekday) {
      return { withinBusinessHours: false, schedule: schedule.name, timezone: schedule.timezone };
    }

    const activeSlots = schedule.slots.filter(
      (slot) => slot.isActive && slot.dayOfWeek === weekday,
    );

    const isWithin = activeSlots.some(
      (slot) => currentTime >= slot.startTime && currentTime < slot.endTime,
    );

    return {
      withinBusinessHours: isWithin,
      schedule: schedule.name,
      timezone: schedule.timezone,
    };
  }

  private async ensureExists(id: string) {
    const schedule = await this.prisma.businessHoursSchedule.findUnique({ where: { id } });
    if (!schedule) throw new NotFoundException(`Schedule ${id} not found`);
    return schedule;
  }
}
