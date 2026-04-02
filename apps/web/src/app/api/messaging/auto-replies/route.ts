import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@shorterlink/shared";

export async function GET() {
  const { error } = await authorize(PERMISSIONS.MESSAGING_AUTO_REPLY_MANAGE);
  if (error) return error;

  const rules = await prisma.autoReplyRule.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    include: {
      channel: { select: { type: true } },
    },
  });

  return NextResponse.json(
    rules.map((r) => ({
      id: r.id,
      name: r.keyword ? `${r.trigger}: ${r.keyword}` : r.trigger,
      triggerType: r.trigger,
      triggerValue: r.keyword,
      body: r.responseBody,
      enabled: r.isActive,
      channelType: r.channel?.type || null,
      createdAt: r.createdAt,
    })),
  );
}

export async function POST(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_AUTO_REPLY_MANAGE);
  if (error) return error;

  const body = await request.json();
  const { name, triggerType, triggerValue, body: ruleBody, channelType } = body;

  if (!ruleBody?.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  // Map frontend trigger type to Prisma enum
  const triggerMap: Record<string, string> = {
    NEW_CONVERSATION: "FIRST_MESSAGE",
    KEYWORD: "KEYWORD_MATCH",
    OUTSIDE_HOURS: "OUTSIDE_BUSINESS_HOURS",
    NO_AGENT: "FIRST_MESSAGE",
    WAIT_TIMEOUT: "FIRST_MESSAGE",
  };
  const trigger = triggerMap[triggerType] || "FIRST_MESSAGE";

  let channelId: string | null = null;
  if (channelType) {
    const channel = await prisma.channel.findFirst({
      where: { type: channelType },
      select: { id: true },
    });
    channelId = channel?.id || null;
  }

  const rule = await prisma.autoReplyRule.create({
    data: {
      trigger: trigger as "FIRST_MESSAGE" | "OUTSIDE_BUSINESS_HOURS" | "KEYWORD_MATCH",
      keyword: triggerValue || null,
      responseBody: ruleBody.trim(),
      channelId,
      isActive: true,
      createdBy: session.user!.id,
      companyId: session.user!.companyId ?? "",
    },
    include: {
      channel: { select: { type: true } },
    },
  });

  return NextResponse.json(
    {
      id: rule.id,
      name: name || rule.trigger,
      triggerType: rule.trigger,
      triggerValue: rule.keyword,
      body: rule.responseBody,
      enabled: rule.isActive,
      channelType: rule.channel?.type || null,
      createdAt: rule.createdAt,
    },
    { status: 201 },
  );
}
