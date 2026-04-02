import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function GET(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_ANALYTICS_READ);
  if (error) return error;

  const companyId = session.user.companyId ?? "";

  const url = request.nextUrl;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const dateFilter = {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: new Date(to) } : {}),
  };

  const hasDateFilter = from || to;

  // Get conversation counts per channel type
  const convByChannel = await prisma.analyticsConversationDaily.groupBy({
    by: ["channelType"],
    where: { companyId, ...(hasDateFilter ? { date: dateFilter } : {}) },
    _sum: { count: true },
  });

  // Get message counts per channel type
  const msgByChannel = await prisma.analyticsMessageDaily.groupBy({
    by: ["channelType"],
    where: { companyId, ...(hasDateFilter ? { date: dateFilter } : {}) },
    _sum: { count: true },
  });

  // Get avg response time per channel type
  const rtByChannel = await prisma.analyticsResponseTime.groupBy({
    by: ["channelType"],
    where: { companyId, ...(hasDateFilter ? { date: dateFilter } : {}) },
    _avg: { avgResponseMs: true },
  });

  // Merge all stats by channel type
  const channelTypes = new Set<string>();
  convByChannel.forEach((c) => channelTypes.add(c.channelType));
  msgByChannel.forEach((m) => channelTypes.add(m.channelType));
  rtByChannel.forEach((r) => channelTypes.add(r.channelType));

  const stats = Array.from(channelTypes).map((channelType) => {
    const conv = convByChannel.find((c) => c.channelType === channelType);
    const msg = msgByChannel.find((m) => m.channelType === channelType);
    const rt = rtByChannel.find((r) => r.channelType === channelType);

    return {
      channelType,
      conversations: conv?._sum.count || 0,
      messages: msg?._sum.count || 0,
      avgResponseTime: ((rt?._avg.avgResponseMs || 0) / 1000),
    };
  });

  // Sort by conversations desc
  stats.sort((a, b) => b.conversations - a.conversations);

  return NextResponse.json(stats);
}
