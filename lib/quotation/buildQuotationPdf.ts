import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export interface QuotationPdfItem { description: string; quantity: number; unit_price: number; }
export interface QuotationPdfData {
  companyName: string; companyAddress: string; companyContact: string; socialMediaAccount?: string; emailAddress?: string; website?: string;
  logoBytes?: Uint8Array; dateCreated: string; validUntil?: string; customerName: string; customerContact?: string | null; customerEmail?: string | null; customerLocation?: string | null;
  projectJobId: string; version?: number; items: QuotationPdfItem[]; servicesNote: string; terms: string; additionalNotes?: string | null;
  validDays: number; discountType?: "none" | "percentage" | "fixed"; discountValue?: number; discountAmount?: number; taxEnabled?: boolean; taxRate?: number; taxAmount?: number;
  otherCharges?: number; otherChargesNote?: string | null; paymentTerms?: "50_50" | "full_on_completion" | "full_on_installation" | "custom";
}

const PAGE_WIDTH = 612, PAGE_HEIGHT = 792, MARGIN = 42;
const NAVY = rgb(0.03, 0.08, 0.10);
const BLUE = rgb(0.02, 0.46, 0.72);
const TEAL = rgb(0.08, 0.70, 0.73);
const GOLD = rgb(0.95, 0.67, 0.02);
const INK = rgb(0.12, 0.14, 0.16);
const MUTED = rgb(0.38, 0.42, 0.45);
const LIGHT = rgb(0.95, 0.97, 0.97);
const BORDER = rgb(0.82, 0.85, 0.86);

function money(value: number) { return `PHP ${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean), lines: string[] = []; let current = "";
  for (const word of words) { const candidate = current ? `${current} ${word}` : word; if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) { lines.push(current); current = word; } else current = candidate; }
  if (current) lines.push(current); return lines.length ? lines : [""];
}
function shortDate(value?: string) { return value ? new Date(value).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—"; }

export async function buildQuotationPdfBytes(data: QuotationPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = data.logoBytes ? await doc.embedJpg(data.logoBytes) : null;
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  const ensure = (height: number) => { if (y - height < MARGIN) { page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]); y = PAGE_HEIGHT - MARGIN; drawPageAccent(); } };
  const drawPageAccent = () => { page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 5, width: PAGE_WIDTH, height: 5, color: TEAL }); page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH * 0.55, height: 3, color: GOLD }); };
  drawPageAccent();
  const text = (value: string, x: number, yy: number, size = 9, f = font, color = INK) => page.drawText(value, { x, y: yy, size, font: f, color });
  const wrapped = (value: string, x: number, size: number, maxWidth: number, gap = 12, f = font, color = INK) => { for (const line of wrapText(value, f, size, maxWidth)) { ensure(gap); text(line, x, y, size, f, color); y -= gap; } };

  // Branded header: the actual logo is black-backed, so place it in a dark brand band.
  page.drawRectangle({ x: MARGIN, y: PAGE_HEIGHT - 126, width: contentWidth, height: 78, color: NAVY });
  page.drawRectangle({ x: MARGIN, y: PAGE_HEIGHT - 126, width: 8, height: 78, color: GOLD });
  if (logo) {
    const w = 112, h = w * (402 / 621);
    page.drawImage(logo, { x: MARGIN + 20, y: PAGE_HEIGHT - 113, width: w, height: h });
  }
  const companyX = MARGIN + 150;
  text(data.companyName, companyX, PAGE_HEIGHT - 68, 12, bold, rgb(1, 1, 1));
  wrapped(data.companyAddress, companyX, 7.5, 300, 10, font, rgb(0.86, 0.9, 0.91));
  text(`Contact: ${data.companyContact}`, companyX, PAGE_HEIGHT - 100, 7.5, font, rgb(0.86, 0.9, 0.91));
  y = PAGE_HEIGHT - 145;

  text("QUOTATION", MARGIN, y, 20, bold, BLUE);
  text(`v${data.version ?? 1}`, MARGIN + 112, y + 2, 8, bold, TEAL);
  const metaX = PAGE_WIDTH - MARGIN - 205;
  text(`Quotation No. ${data.projectJobId}`, metaX, y + 3, 8, bold, INK);
  text(`Date: ${data.dateCreated}`, metaX, y - 10, 8, font, MUTED);
  text(`Valid until: ${data.validUntil ?? shortDate(data.dateCreated)}`, metaX, y - 23, 8, font, MUTED);
  y -= 40;

  // Customer card.
  page.drawRectangle({ x: MARGIN, y: y - 54, width: contentWidth, height: 62, color: LIGHT, borderColor: BORDER, borderWidth: 0.7 });
  text("BILL TO / CUSTOMER", MARGIN + 12, y - 8, 7, bold, BLUE);
  text(data.customerName || "—", MARGIN + 12, y - 23, 10, bold, INK);
  if (data.customerContact) text(data.customerContact, MARGIN + 12, y - 37, 7.5, font, MUTED);
  if (data.customerEmail) text(data.customerEmail, MARGIN + 190, y - 37, 7.5, font, MUTED);
  if (data.customerLocation) text(data.customerLocation, MARGIN + 190, y - 23, 7.5, font, MUTED);
  y -= 72;

  text("PROJECT DESCRIPTION", MARGIN, y, 7.5, bold, MUTED); y -= 14;
  const projectDescription = data.servicesNote || "Signage fabrication and installation services";
  wrapped(projectDescription, MARGIN, 9, contentWidth, 12, font, INK); y -= 8;

  // Item table.
  ensure(35);
  const tableTop = y;
  page.drawRectangle({ x: MARGIN, y: tableTop - 20, width: contentWidth, height: 22, color: NAVY });
  text("DESCRIPTION", MARGIN + 8, tableTop - 13, 7.5, bold, rgb(1, 1, 1));
  text("QTY", MARGIN + 342, tableTop - 13, 7.5, bold, rgb(1, 1, 1));
  text("UNIT PRICE", MARGIN + 385, tableTop - 13, 7.5, bold, rgb(1, 1, 1));
  text("TOTAL", MARGIN + 470, tableTop - 13, 7.5, bold, rgb(1, 1, 1));
  y = tableTop - 30;

  let subtotal = 0;
  for (let idx = 0; idx < data.items.length; idx++) {
    const item = data.items[idx], lineTotal = (item.quantity || 0) * (item.unit_price || 0); subtotal += lineTotal;
    const lines = wrapText(item.description || "—", font, 8.2, 325), rowH = Math.max(22, lines.length * 10 + 10);
    ensure(rowH + 4);
    if (idx % 2 === 0) page.drawRectangle({ x: MARGIN, y: y - rowH + 5, width: contentWidth, height: rowH, color: rgb(0.985, 0.987, 0.987) });
    lines.forEach((line, li) => text(line, MARGIN + 8, y - li * 10, 8.2, font, INK));
    text(String(item.quantity), MARGIN + 342, y, 8.2);
    text(money(item.unit_price), MARGIN + 385, y, 8.2);
    text(money(lineTotal), MARGIN + 470, y, 8.2, bold, INK);
    page.drawLine({ start: { x: MARGIN, y: y - rowH + 3 }, end: { x: MARGIN + contentWidth, y: y - rowH + 3 }, thickness: 0.35, color: BORDER });
    y -= rowH;
  }

  const discount = data.discountAmount ?? 0, tax = data.taxAmount ?? 0, charges = data.otherCharges ?? 0;
  const total = Math.max(0, subtotal - discount + tax + charges);
  y -= 8; ensure(105);
  const summaryX = MARGIN + 345, valueX = MARGIN + 470;
  const summary = (label: string, value: number, color = INK, boldValue = false) => { text(label, summaryX, y, 8, font, MUTED); text(money(value), valueX, y, 8, boldValue ? bold : font, color); y -= 13; };
  summary("Subtotal", subtotal);
  if (discount > 0) summary(`Discount${data.discountType === "percentage" ? ` (${data.discountValue ?? 0}%)` : ""}`, -discount, rgb(0.75, 0.15, 0.18));
  if (data.taxEnabled) summary(`VAT / Tax (${data.taxRate ?? 0}%)`, tax);
  if (charges > 0) summary(data.otherChargesNote || "Other charges", charges);
  page.drawRectangle({ x: summaryX - 8, y: y - 8, width: contentWidth - (summaryX - MARGIN) + 8, height: 27, color: BLUE });
  text("TOTAL", summaryX, y + 2, 10, bold, rgb(1, 1, 1));
  text(money(total), valueX, y + 2, 10, bold, rgb(1, 1, 1));
  y -= 28;

  if (data.additionalNotes?.trim()) {
    ensure(55); text("ADDITIONAL NOTES", MARGIN, y, 8, bold, BLUE); y -= 13; wrapped(data.additionalNotes.trim(), MARGIN, 8.5, contentWidth, 12, font, INK); y -= 5;
  }
  ensure(48); text("PAYMENT TERMS", MARGIN, y, 8, bold, BLUE); y -= 13;
  const payment = data.paymentTerms === "full_on_completion" ? "Full payment on completion" : data.paymentTerms === "full_on_installation" ? "Full payment on installation" : data.paymentTerms === "custom" ? "Custom payment schedule as agreed" : "50% downpayment / 50% after completion";
  wrapped(payment, MARGIN, 8.5, contentWidth, 12, font, INK); y -= 5;

  ensure(60); text("TERMS & CONDITIONS", MARGIN, y, 8, bold, BLUE); y -= 13;
  for (const line of (data.terms || `Price quotation valid for ${data.validDays} days.`).split("\n")) { wrapped(line.trim() || " ", MARGIN, 7.7, contentWidth, 11, font, INK); }
  y -= 8; ensure(65);
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 180, y }, thickness: 0.8, color: INK });
  page.drawLine({ start: { x: MARGIN + 260, y }, end: { x: MARGIN + 440, y }, thickness: 0.8, color: INK });
  text("Customer / Authorized Representative", MARGIN, y - 12, 7, font, MUTED);
  text("Date", MARGIN + 260, y - 12, 7, font, MUTED);

  // Footer on every page.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawRectangle({ x: MARGIN, y: 25, width: contentWidth, height: 0.7, color: BORDER });
    p.drawText(`${data.companyName} · ${data.projectJobId}`, { x: MARGIN, y: 14, size: 6.5, font, color: MUTED });
    p.drawText(`Page ${i + 1} of ${pages.length}`, { x: PAGE_WIDTH - MARGIN - 55, y: 14, size: 6.5, font, color: MUTED });
  });
  return doc.save();
}
