import { config } from 'dotenv';
import path from 'path';

// Load .env from project root
config({ path: path.resolve(__dirname, '../.env') });

import { PrismaClient } from '../apps/api/src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. SUPER_ADMIN user
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL ?? 'denys@shorterlink.app';
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD ?? 'changeme123';

  const existingSuperAdmin = await prisma.user.findUnique({
    where: { email: superAdminEmail },
  });
  if (existingSuperAdmin) {
    console.log('✅ SUPER_ADMIN already exists, skipping');
  } else {
    const passwordHash = await bcrypt.hash(superAdminPassword, 10);
    await prisma.user.create({
      data: {
        email: superAdminEmail,
        name: 'Denys',
        passwordHash,
        role: 'SUPER_ADMIN',
        companyId: null,
      },
    });
    console.log('✅ SUPER_ADMIN user created');
  }

  // 2. Demo company
  let demoCompany = await prisma.company.findUnique({
    where: { slug: 'demo' },
  });
  if (demoCompany) {
    console.log('✅ Demo company already exists, skipping');
  } else {
    demoCompany = await prisma.company.create({
      data: {
        name: 'Demo Company',
        slug: 'demo',
      },
    });
    console.log('✅ Demo company created');
  }

  // 3. Demo ADMIN user
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@demo.local' },
  });
  if (existingAdmin) {
    console.log('✅ Demo ADMIN user already exists, skipping');
  } else {
    const passwordHash = await bcrypt.hash('admin12345', 10);
    await prisma.user.create({
      data: {
        email: 'admin@demo.local',
        name: 'Demo Admin',
        passwordHash,
        role: 'ADMIN',
        companyId: demoCompany.id,
      },
    });
    console.log('✅ Demo ADMIN user created');
  }

  // 4. EMAIL channel for demo company
  let emailChannel = await prisma.channel.findFirst({
    where: { companyId: demoCompany.id, type: 'EMAIL' },
  });
  if (emailChannel) {
    console.log('✅ EMAIL channel already exists, skipping');
  } else {
    emailChannel = await prisma.channel.create({
      data: {
        name: 'Email',
        type: 'EMAIL',
        companyId: demoCompany.id,
      },
    });
    console.log('✅ EMAIL channel created');
  }

  // 5. Demo contacts
  const contactsData = [
    {
      displayName: 'Jan Kowalski',
      firstName: 'Jan',
      lastName: 'Kowalski',
      company: 'ACME sp. z o.o.',
    },
    {
      displayName: 'Anna Nowak',
      firstName: 'Anna',
      lastName: 'Nowak',
    },
    {
      displayName: 'Piotr Wiśniewski',
      firstName: 'Piotr',
      lastName: 'Wiśniewski',
      company: 'Beta Sp. z o.o.',
    },
  ];

  const contacts: Array<{ id: string }> = [];
  for (const contactData of contactsData) {
    const existing = await prisma.contact.findFirst({
      where: { companyId: demoCompany.id, displayName: contactData.displayName },
    });
    if (existing) {
      console.log(`✅ Contact "${contactData.displayName}" already exists, skipping`);
      contacts.push(existing);
    } else {
      const created = await prisma.contact.create({
        data: {
          ...contactData,
          companyId: demoCompany.id,
        },
      });
      console.log(`✅ Contact "${contactData.displayName}" created`);
      contacts.push(created);
    }
  }

  // 6. Demo conversations (for contacts[0] and contacts[1]) with 1 inbound TEXT message each
  for (let i = 0; i < 2; i++) {
    const contact = contacts[i];
    let conversation = await prisma.conversation.findFirst({
      where: {
        companyId: demoCompany.id,
        contactId: contact.id,
        channelId: emailChannel.id,
      },
    });
    if (conversation) {
      console.log(`✅ Conversation for contact[${i}] already exists, skipping`);
    } else {
      conversation = await prisma.conversation.create({
        data: {
          contactId: contact.id,
          channelId: emailChannel.id,
          companyId: demoCompany.id,
          status: 'NEW',
        },
      });
      console.log(`✅ Conversation for contact[${i}] created`);
    }

    // Check if message already exists for this conversation
    const existingMessage = await prisma.message.findFirst({
      where: { conversationId: conversation.id },
    });
    if (existingMessage) {
      console.log(`✅ Message for conversation[${i}] already exists, skipping`);
    } else {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          channelId: emailChannel.id,
          companyId: demoCompany.id,
          direction: 'INBOUND',
          contentType: 'TEXT',
          body: `Demo inbound message from ${contactsData[i].displayName}`,
          contactId: contact.id,
        },
      });
      console.log(`✅ Message for conversation[${i}] created`);
    }
  }

  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
