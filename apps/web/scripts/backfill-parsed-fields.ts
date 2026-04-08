/**
 * Backfill: re-parse all IncomingEmail records to fill customerName, customerLang, etc.
 * Run: npx tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/backfill-parsed-fields.ts
 */

// Inline parser to avoid import issues
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractCustomerName(text: string): string | null {
  const patterns = [
    /Name\s*[:：]\s*(.+?)(?:\s*(?:E-?mail|Эл\.\s*почта|Ел\.\s*пошта|El\.\s*paštas|Treść|Body|Текст сообщения|Текст повідомлення)\s*[:：]|$)/i,
    /(?:имя|ім['ʼ]?я|imię|ваше имя|ваше ім['ʼ]?я)\s*[:：]\s*(.+?)(?:\s*(?:E-?mail|Эл\.\s*почта|Ел\.\s*пошта|Telefon|Phone)\s*[:：]|$)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) { const n = m[1].trim(); if (n.length <= 60 && !n.includes("@")) return n; }
  }
  return null;
}

function extractCustomerLang(text: string): string | null {
  const m = text.match(/lang\s*[:：]\s*([a-z]{2})/i);
  return m ? m[1].toLowerCase() : null;
}

function extractCustomerEmail(text: string): string | null {
  const patterns = [
    /E-mail\s*[:：]\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i,
    /(?:Эл\.\s*почта|Ел\.\s*пошта)\s*[:：]\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i,
    /(?:email|почта|пошта|електронна)\s*[:：]\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].toLowerCase();
  }
  const all = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
  if (all) {
    const found = all.find((e) => !/(noreply|no-reply|mailer|system|wordpress|hostinger|shopify)/i.test(e));
    if (found) return found.toLowerCase();
  }
  return null;
}

function extractProductName(text: string): string | null {
  const m = text.match(/Produkt\s*[:：]\s*(.+?)(?:\s*Sku\s*[:：]|Link\s*[:：]|Name\s*[:：]|E-mail\s*[:：]|$)/i);
  return m ? m[1].trim() : null;
}

function extractProductUrl(text: string): string | null {
  const linkField = text.match(/Link\s*[:：]\s*(https?:\/\/[^\s]+)/i);
  if (linkField) return linkField[1];
  const anyUrl = text.match(/(https?:\/\/[^\s,;)]+)/i);
  return anyUrl ? anyUrl[1] : null;
}

function detectCategory(text: string): "lead" | "other" {
  if (/source\s*[:：]\s*video_review/i.test(text)) return "lead";
  return "other";
}

// Use pg directly to avoid Prisma adapter issues
import pg from "pg";

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query('SELECT id, body, subject FROM "IncomingEmail"');
  let updated = 0;

  for (const row of rows) {
    const text = stripHtml(row.body);
    const combined = `${row.subject} ${text}`;

    const customerName = extractCustomerName(text);
    const customerEmail = extractCustomerEmail(text);
    const customerLang = extractCustomerLang(text);
    const productName = extractProductName(combined);
    const productUrl = extractProductUrl(text);
    const category = detectCategory(text);

    await client.query(
      `UPDATE "IncomingEmail" SET
        "customerName" = $1, "customerEmail" = $2, "customerLang" = $3,
        "productName" = $4, "productUrl" = $5, "category" = $6
       WHERE id = $7`,
      [customerName, customerEmail, customerLang, productName, productUrl, category, row.id]
    );
    updated++;
  }

  console.log(`Backfill done: ${updated}/${rows.length} emails re-parsed`);
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
