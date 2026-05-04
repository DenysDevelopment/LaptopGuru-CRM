import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { syncEmails } from "@/lib/imap";
import { syncEmailsToMessaging } from "@/lib/imap-messaging";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function POST() {
  const { error } = await authorize(PERMISSIONS.EMAILS_WRITE);
  if (error) return error;

  try {
    // 1) Заявки workflow: persist raw IncomingEmail rows.
    const imported = await syncEmails();
    // 2) Mirror the same inbox into the unified messaging UI as
    //    Conversation + Message. Failure here must NOT lose the imported
    //    leads from step 1, so we swallow and log.
    let mirrored = 0;
    try {
      mirrored = await syncEmailsToMessaging();
    } catch (mirrorErr) {
      console.error("[IMAP SYNC] mirror to messaging failed:", mirrorErr);
    }
    return NextResponse.json({ imported, mirrored });
  } catch (error) {
    console.error("[IMAP SYNC ERROR]", error);
    return NextResponse.json({ error: "Ошибка синхронизации почты" }, { status: 500 });
  }
}
