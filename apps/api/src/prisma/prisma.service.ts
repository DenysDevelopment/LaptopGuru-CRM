import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ClsService } from 'nestjs-cls';

// Models excluded from automatic tenant filtering
// User and Company are global; AuditLog is written by super-admin without tenant context
const TENANT_EXCLUDED = ['User', 'Company', 'AuditLog'];

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private rawClient_: PrismaClient;
  private client: PrismaClient;

  constructor(private readonly cls: ClsService) {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });

    this.rawClient_ = new PrismaClient({ adapter });

    const getCompanyId = (): string | null =>
      this.cls.get<string | null>('companyId') ?? null;

    this.client = this.rawClient_.$extends({
      query: {
        $allModels: {
          async findMany({ args, query, model }: { args: any; query: any; model: string }) {
            const cid = getCompanyId();
            if (!cid || TENANT_EXCLUDED.includes(model)) return query(args);
            args.where = { ...args.where, companyId: cid };
            return query(args);
          },
          async findFirst({ args, query, model }: { args: any; query: any; model: string }) {
            const cid = getCompanyId();
            if (!cid || TENANT_EXCLUDED.includes(model)) return query(args);
            args.where = { ...args.where, companyId: cid };
            return query(args);
          },
          async findFirstOrThrow({ args, query, model }: { args: any; query: any; model: string }) {
            const cid = getCompanyId();
            if (!cid || TENANT_EXCLUDED.includes(model)) return query(args);
            args.where = { ...args.where, companyId: cid };
            return query(args);
          },
          // findUnique cannot have extra WHERE fields added (Prisma constraint).
          // Instead: fetch then validate ownership post-query.
          async findUnique({ args, query, model }: { args: any; query: any; model: string }) {
            const result = await query(args);
            const cid = getCompanyId();
            if (!cid || TENANT_EXCLUDED.includes(model)) return result;
            if (result && 'companyId' in result) {
              if ((result as Record<string, unknown>).companyId !== cid) return null;
            }
            return result;
          },
          async findUniqueOrThrow({ args, query, model }: { args: any; query: any; model: string }) {
            const result = await query(args);
            const cid = getCompanyId();
            if (!cid || TENANT_EXCLUDED.includes(model)) return result;
            if (result && 'companyId' in result) {
              if ((result as Record<string, unknown>).companyId !== cid) {
                throw new Error(`Record not found`);
              }
            }
            return result;
          },
          async create({ args, query, model }: { args: any; query: any; model: string }) {
            const cid = getCompanyId();
            if (!cid || TENANT_EXCLUDED.includes(model)) return query(args);
            (args.data as Record<string, unknown>).companyId ??= cid;
            return query(args);
          },
          async createMany({ args, query, model }: { args: any; query: any; model: string }) {
            const cid = getCompanyId();
            if (!cid || TENANT_EXCLUDED.includes(model)) return query(args);
            if (Array.isArray(args.data)) {
              args.data = args.data.map((d: Record<string, unknown>) => ({
                ...d,
                companyId: d.companyId ?? cid,
              }));
            }
            return query(args);
          },
          async update({ args, query, model }: { args: any; query: any; model: string }) {
            const cid = getCompanyId();
            if (!cid || TENANT_EXCLUDED.includes(model)) return query(args);
            args.where = { ...args.where, companyId: cid };
            return query(args);
          },
          async updateMany({ args, query, model }: { args: any; query: any; model: string }) {
            const cid = getCompanyId();
            if (!cid || TENANT_EXCLUDED.includes(model)) return query(args);
            args.where = { ...args.where, companyId: cid };
            return query(args);
          },
          async delete({ args, query, model }: { args: any; query: any; model: string }) {
            const cid = getCompanyId();
            if (!cid || TENANT_EXCLUDED.includes(model)) return query(args);
            args.where = { ...args.where, companyId: cid };
            return query(args);
          },
          async deleteMany({ args, query, model }: { args: any; query: any; model: string }) {
            const cid = getCompanyId();
            if (!cid || TENANT_EXCLUDED.includes(model)) return query(args);
            args.where = { ...args.where, companyId: cid };
            return query(args);
          },
        },
      },
    }) as unknown as PrismaClient;
  }

  async onModuleInit() {
    await this.rawClient_.$connect();
  }

  async onModuleDestroy() {
    await this.rawClient_.$disconnect();
  }

  /** Raw client — bypasses tenant extension. Use for super-admin global queries
   *  and for models excluded from tenant filtering (User, Company, AuditLog). */
  get raw(): PrismaClient {
    return this.rawClient_;
  }

  // ─── Model getters (all go through tenant extension) ───────────────────────
  get user() { return this.client.user; }
  get incomingEmail() { return this.client.incomingEmail; }
  get video() { return this.client.video; }
  get landing() { return this.client.landing; }
  get shortLink() { return this.client.shortLink; }
  get sentEmail() { return this.client.sentEmail; }
  get quickLink() { return this.client.quickLink; }
  get quickLinkVisit() { return this.client.quickLinkVisit; }
  get landingVisit() { return this.client.landingVisit; }
  get contact() { return this.client.contact; }
  get contactChannel() { return this.client.contactChannel; }
  get contactMerge() { return this.client.contactMerge; }
  get contactCustomField() { return this.client.contactCustomField; }
  get channel() { return this.client.channel; }
  get channelConfig() { return this.client.channelConfig; }
  get conversation() { return this.client.conversation; }
  get conversationTag() { return this.client.conversationTag; }
  get conversationAssignment() { return this.client.conversationAssignment; }
  get conversationSla() { return this.client.conversationSla; }
  get message() { return this.client.message; }
  get messageStatusEvent() { return this.client.messageStatusEvent; }
  get messageAttachment() { return this.client.messageAttachment; }
  get messageReaction() { return this.client.messageReaction; }
  get messageGeolocation() { return this.client.messageGeolocation; }
  get internalNote() { return this.client.internalNote; }
  get tag() { return this.client.tag; }
  get template() { return this.client.template; }
  get templateVariable() { return this.client.templateVariable; }
  get msgQuickReply() { return this.client.msgQuickReply; }
  get team() { return this.client.team; }
  get teamMember() { return this.client.teamMember; }
  get businessHoursSchedule() { return this.client.businessHoursSchedule; }
  get businessHoursSlot() { return this.client.businessHoursSlot; }
  get notification() { return this.client.notification; }
  get webhookEvent() { return this.client.webhookEvent; }
  get outboundJob() { return this.client.outboundJob; }
  get outboundJobLog() { return this.client.outboundJobLog; }
  get typingIndicator() { return this.client.typingIndicator; }
  get company() { return this.client.company; }
  get auditLog() { return this.client.auditLog; }
  get analyticsMessageDaily() { return this.client.analyticsMessageDaily; }
  get analyticsConversationDaily() { return this.client.analyticsConversationDaily; }
  get analyticsResponseTime() { return this.client.analyticsResponseTime; }

  async $queryRaw(query: TemplateStringsArray, ...values: unknown[]) {
    return this.rawClient_.$queryRaw(query, ...values);
  }

  async $transaction(fn: Parameters<typeof this.client.$transaction>[0]) {
    return (this.client as unknown as PrismaClient).$transaction(fn as never);
  }
}
