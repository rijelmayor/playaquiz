import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export interface QuotationPdfItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface QuotationPdfData {
  companyName: string;
  companyAddress: string;
  companyContact: string;
  socialMediaAccount?: string;
  emailAddress?: string;
  website?: string;
  logoBytes?: Uint8Array;
  dateCreated: string;
  customerName: string;
  projectJobId: string;
  items: QuotationPdfItem[];
  servicesNote: string;
  terms: string;
  validDays: number;
  paymentTerms?: "50_50" | "full_on_completion" | "full_on_installation" | "custom";
}

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 48;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

// Builds the "Project Quotation" PDF matching the DW AdSign format. Works
// in both the browser (download button) and Node (email-send API route) —
// pdf-lib has no DOM/canvas dependency either way.
export async function buildQuotationPdfBytes(data: QuotationPdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logo = data.logoBytes ? await pdfDoc.embedJpg(data.logoBytes) : null;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  function newPageIfNeeded(nextLineHeight: number) {
    if (y - nextLineHeight < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawLine(
    text: string,
    { size = 10, useFont = font, color = rgb(0.1, 0.1, 0.1), gap = 14, x = MARGIN }: {
      size?: number;
      useFont?: PDFFont;
      color?: ReturnType<typeof rgb>;
      gap?: number;
      x?: number;
    } = {}
  ) {
    newPageIfNeeded(gap);
    page.drawText(text, { x, y, size, font: useFont, color });
    y -= gap;
  }

  function drawWrapped(
    text: string,
    { size = 10, useFont = font, gap = 13, maxWidth = contentWidth, x = MARGIN }: {
      size?: number;
      useFont?: PDFFont;
      gap?: number;
      maxWidth?: number;
      x?: number;
    } = {}
  ) {
    for (const line of wrapText(text, useFont, size, maxWidth)) {
      drawLine(line, { size, useFont, gap, x });
    }
  }

  // ── Header ──────────────────────────────────────────────────────────
  // Company information remains on the left while the DW logo sits on the upper-right.
  if (logo) {
    // Keep the original DW Advertising Signages aspect ratio (621 × 402)
    // instead of forcing the logo into a square.
    const logoWidth = 104;
    const logoHeight = logoWidth * (402 / 621);
    page.drawImage(logo, {
      x: PAGE_WIDTH - MARGIN - logoWidth,
      y: PAGE_HEIGHT - MARGIN - logoHeight + 6,
      width: logoWidth,
      height: logoHeight
    });
  }

  const headerMaxWidth = contentWidth - 88;
  drawWrapped(data.companyName, { size: 14, useFont: bold, gap: 18, maxWidth: headerMaxWidth });
  drawWrapped(data.companyAddress, { size: 9, gap: 12, maxWidth: headerMaxWidth });
  drawWrapped(`Contact: ${data.companyContact}`, { size: 9, gap: 12, maxWidth: headerMaxWidth });

  // Optional channels are omitted when the admin leaves them blank.
  if (data.socialMediaAccount?.trim()) {
    drawWrapped(`Social Media: ${data.socialMediaAccount.trim()}`, { size: 8.5, gap: 11, maxWidth: headerMaxWidth });
  }
  if (data.emailAddress?.trim()) {
    drawWrapped(`Email: ${data.emailAddress.trim()}`, { size: 8.5, gap: 11, maxWidth: headerMaxWidth });
  }
  if (data.website?.trim()) {
    drawWrapped(`Website: ${data.website.trim()}`, { size: 8.5, gap: 11, maxWidth: headerMaxWidth });
  }

  y -= 4;
  drawLine("Project Quotation", { size: 13, useFont: bold, gap: 24 });

  drawLine(`Date Created: ${data.dateCreated}`, { size: 10, gap: 16 });
  drawLine(`Customer Name: ${data.customerName}`, { size: 10, gap: 16 });
  drawLine(`Project/Job ID: ${data.projectJobId}`, { size: 10, gap: 16 });
  const paymentArrangement = data.paymentTerms === "full_on_completion"
    ? "Full payment on completion"
    : data.paymentTerms === "full_on_installation"
      ? "Full payment on installation"
      : data.paymentTerms === "custom"
        ? "Custom payment schedule (see agreed terms)"
        : "50% downpayment / 50% after completion";
  drawLine(`Payment Arrangement: ${paymentArrangement}`, { size: 10, gap: 24 });

  // ── Item table ──────────────────────────────────────────────────────
  const colX = { item: MARGIN, qty: MARGIN + 280, price: MARGIN + 340, total: MARGIN + 430 };
  const descMaxWidth = colX.qty - colX.item - 8;

  newPageIfNeeded(20);
  page.drawRectangle({
    x: MARGIN,
    y: y - 6,
    width: contentWidth,
    height: 18,
    color: rgb(0.93, 0.93, 0.93)
  });
  page.drawText("Item / Description", { x: colX.item + 2, y, size: 9, font: bold });
  page.drawText("Qty", { x: colX.qty, y, size: 9, font: bold });
  page.drawText("Price", { x: colX.price, y, size: 9, font: bold });
  page.drawText("Total", { x: colX.total, y, size: 9, font: bold });
  y -= 20;

  let subtotal = 0;
  for (const item of data.items) {
    const lineTotal = item.quantity * item.unit_price;
    subtotal += lineTotal;
    const descLines = wrapText(item.description || "—", font, 9, descMaxWidth);
    newPageIfNeeded(descLines.length * 12 + 4);
    const rowTop = y;
    descLines.forEach((line, i) => {
      page.drawText(line, { x: colX.item + 2, y: rowTop - i * 12, size: 9, font });
    });
    page.drawText(String(item.quantity), { x: colX.qty, y: rowTop, size: 9, font });
    page.drawText(`PHP ${item.unit_price.toLocaleString("en-PH")}`, { x: colX.price, y: rowTop, size: 9, font });
    page.drawText(`PHP ${lineTotal.toLocaleString("en-PH")}`, { x: colX.total, y: rowTop, size: 9, font });
    y = rowTop - descLines.length * 12 - 4;
  }

  newPageIfNeeded(18);
  page.drawLine({
    start: { x: MARGIN, y: y + 6 },
    end: { x: MARGIN + contentWidth, y: y + 6 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7)
  });
  y -= 6;
  drawLine(`Total: PHP ${subtotal.toLocaleString("en-PH")}`, { size: 11, useFont: bold, gap: 26, x: colX.price });

  // ── Services ────────────────────────────────────────────────────────
  drawLine("Services:", { size: 10, useFont: bold, gap: 14 });
  drawWrapped(data.servicesNote, { size: 10, gap: 14 });
  y -= 8;

  // ── Terms and Conditions ───────────────────────────────────────────
  drawLine("Terms and Condition:", { size: 10, useFont: bold, gap: 16 });
  for (const rawLine of data.terms.split("\n")) {
    drawWrapped(rawLine.trim() || " ", { size: 9, gap: 13 });
  }
  drawLine(`Price Quote Valid ${data.validDays} days from Date Created.`, { size: 9, gap: 22 });

  // ── Signature ───────────────────────────────────────────────────────
  newPageIfNeeded(40);
  drawLine("Conforme: _______________________________", { size: 10, gap: 14 });
  drawLine("Customer Signature over Printed Name", { size: 8 });

  return pdfDoc.save();
}
