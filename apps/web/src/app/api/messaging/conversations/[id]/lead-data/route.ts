import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

/**
 * GET /api/messaging/conversations/:id/lead-data
 * Get parsed lead data for this conversation's contact (for pre-filling /send page).
 */
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
        include: {
          channels: true,
          customFields: true,
        },
      },
      channel: { select: { type: true } },
    },
  });

  if (!conversation || conversation.companyId !== (session.user.companyId ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!conversation.contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contact = conversation.contact;
  const emailCh = contact.channels.find((c) => c.channelType === "EMAIL");
  const fields = Object.fromEntries(contact.customFields.map((f) => [f.fieldName, f.fieldValue]));

  return NextResponse.json({
    contactId: contact.id,
    customerName: contact.displayName,
    customerEmail: emailCh?.identifier || null,
    customerPhone: fields.phone || null,
    productName: fields.productName || null,
    productUrl: fields.productUrl || null,
    channelType: conversation.channel.type,
    conversationId: id,
  });
}
