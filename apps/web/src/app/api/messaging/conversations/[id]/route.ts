import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_CONVERSATIONS_READ);
  if (error) return error;

  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      contact: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          company: true,
          channels: {
            select: { channelType: true, identifier: true },
          },
        },
      },
      channel: { select: { type: true } },
      assignments: {
        where: { isActive: true },
        select: {
          user: { select: { id: true, name: true, email: true } },
        },
        take: 1,
      },
      tags: {
        include: { tag: true },
      },
    },
  });

  if (!conversation || conversation.companyId !== (session.user.companyId ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contact = conversation.contact;
  const emailChannel = contact?.channels.find((ch) => ch.channelType === "EMAIL");
  const phoneChannel = contact?.channels.find(
    (ch) => ch.channelType === "SMS" || ch.channelType === "WHATSAPP",
  );

  return NextResponse.json({
    id: conversation.id,
    status: conversation.status,
    priority: conversation.priority,
    channelType: conversation.channel.type,
    subject: conversation.subject,
    createdAt: conversation.createdAt,
    closedAt: conversation.closedAt,
    contact: contact
      ? {
          id: contact.id,
          name: contact.displayName,
          email: emailChannel?.identifier || null,
          phone: phoneChannel?.identifier || null,
          avatarUrl: contact.avatarUrl,
          company: contact.company,
          channels: contact.channels.map((ch) => ({
            type: ch.channelType,
            externalId: ch.identifier,
          })),
        }
      : null,
    assignee: conversation.assignments[0]?.user || null,
    tags: conversation.tags.map((ct) => ({
      id: ct.tag.id,
      name: ct.tag.name,
      color: ct.tag.color || "#6B7280",
    })),
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_CONVERSATIONS_WRITE);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.conversation.findUnique({
    where: { id },
    select: { companyId: true },
  });
  if (!existing || existing.companyId !== (session.user.companyId ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.status) data.status = body.status;
  if (body.priority) data.priority = body.priority;
  if (body.status === "CLOSED") data.closedAt = new Date();

  const updated = await prisma.conversation.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}
