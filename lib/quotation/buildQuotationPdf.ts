import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
} from "pdf-lib";

export interface QuotationPdfItem {
  description: string;
  quantity: number;
  unit?: string;
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
  validUntil?: string;

  customerName: string;
  customerContact?: string | null;
  customerEmail?: string | null;
  customerLocation?: string | null;

  /**
   * Job / Project identifier.
   * Example: JOB-0763905A
   */
  projectJobId: string;

  /**
   * Actual job name shown under PROJECT DESCRIPTION.
   * Example: Buld up Acrylic Signage
   */
  jobName: string;

  version?: number;

  items: QuotationPdfItem[];

  /**
   * Service notes / quotation notes.
   * This is intentionally NOT used for PROJECT DESCRIPTION.
   */
  servicesNote: string;

  terms: string;
  additionalNotes?: string | null;

  validDays: number;

  discountType?: "none" | "percentage" | "fixed";
  discountValue?: number;
  discountAmount?: number;

  taxEnabled?: boolean;
  taxRate?: number;
  taxAmount?: number;

  otherCharges?: number;
  otherChargesNote?: string | null;

  paymentTerms?:
    | "50_50"
    | "full_on_completion"
    | "full_on_installation"
    | "custom";

  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;

  gcashNumber?: string | null;
  gcashAccountName?: string | null;
  gcashQrBytes?: Uint8Array | null;

  /**
   * Sample mock-up / desired reference photos to append
   * as dedicated quotation pages.
   */
  mockupImageBytes?: Uint8Array[];
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 42;

const NAVY = rgb(0.03, 0.08, 0.10);
const BLUE = rgb(0.02, 0.46, 0.72);
const TEAL = rgb(0.08, 0.70, 0.73);
const GOLD = rgb(0.95, 0.67, 0.02);
const INK = rgb(0.12, 0.14, 0.16);
const MUTED = rgb(0.38, 0.42, 0.45);
const LIGHT = rgb(0.95, 0.97, 0.97);
const BORDER = rgb(0.82, 0.85, 0.86);

function money(value: number) {
  return `PHP ${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (
      font.widthOfTextAtSize(candidate, size) > maxWidth &&
      current
    ) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [""];
}

function shortDate(value?: string) {
  return value
    ? new Date(value).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
}

// CRM stores optimized photos as WebP.
// pdf-lib only embeds PNG/JPEG, so callers must convert
// WebP → PNG/JPEG before passing mock-up bytes.
// Logos/QR still try PNG then JPG here.
async function embedImageAuto(
  doc: PDFDocument,
  bytes: Uint8Array
): Promise<PDFImage | null> {
  try {
    return await doc.embedPng(bytes);
  } catch {
    // Not PNG.
  }

  try {
    return await doc.embedJpg(bytes);
  } catch {
    // Not JPG either.
  }

  return null;
}

/**
 * True when the buffer looks like WebP (RIFF....WEBP).
 */
export function isWebpBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export async function buildQuotationPdfBytes(
  data: QuotationPdfData
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logo = data.logoBytes
    ? await doc.embedJpg(data.logoBytes)
    : null;

  const qr = data.gcashQrBytes
    ? await embedImageAuto(doc, data.gcashQrBytes)
    : null;

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const contentWidth = PAGE_WIDTH - MARGIN * 2;

  const drawPageAccent = () => {
    page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - 5,
      width: PAGE_WIDTH,
      height: 5,
      color: TEAL,
    });

    page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - 8,
      width: PAGE_WIDTH * 0.55,
      height: 3,
      color: GOLD,
    });
  };

  const ensure = (height: number) => {
    if (y - height < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawPageAccent();
    }
  };

  drawPageAccent();

  const text = (
    value: string,
    x: number,
    yy: number,
    size = 9,
    f = font,
    color = INK
  ) => {
    page.drawText(value, {
      x,
      y: yy,
      size,
      font: f,
      color,
    });
  };

  const wrapped = (
    value: string,
    x: number,
    size: number,
    maxWidth: number,
    gap = 12,
    f = font,
    color = INK
  ) => {
    for (const line of wrapText(value, f, size, maxWidth)) {
      ensure(gap);
      text(line, x, y, size, f, color);
      y -= gap;
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // BRANDED HEADER
  // ─────────────────────────────────────────────────────────────────────

  // The actual logo is black-backed, so place it in a dark brand band.
  page.drawRectangle({
    x: MARGIN,
    y: PAGE_HEIGHT - 126,
    width: contentWidth,
    height: 78,
    color: NAVY,
  });

  page.drawRectangle({
    x: MARGIN,
    y: PAGE_HEIGHT - 126,
    width: 8,
    height: 78,
    color: GOLD,
  });

  if (logo) {
    const w = 112;
    const h = w * (402 / 621);

    page.drawImage(logo, {
      x: MARGIN + 20,
      y: PAGE_HEIGHT - 113,
      width: w,
      height: h,
    });
  }

  const companyX = MARGIN + 150;

  text(
    data.companyName,
    companyX,
    PAGE_HEIGHT - 68,
    12,
    bold,
    rgb(1, 1, 1)
  );

  wrapped(
    data.companyAddress,
    companyX,
    7.5,
    300,
    10,
    font,
    rgb(0.86, 0.9, 0.91)
  );

  text(
    `Contact: ${data.companyContact}`,
    companyX,
    PAGE_HEIGHT - 100,
    7.5,
    font,
    rgb(0.86, 0.9, 0.91)
  );

  y = PAGE_HEIGHT - 145;

  // ─────────────────────────────────────────────────────────────────────
  // QUOTATION HEADER
  // ─────────────────────────────────────────────────────────────────────

  text(
    "QUOTATION",
    MARGIN,
    y,
    20,
    bold,
    BLUE
  );

  text(
    `v${data.version ?? 1}`,
    MARGIN + 112,
    y + 2,
    8,
    bold,
    TEAL
  );

  const metaX = PAGE_WIDTH - MARGIN - 205;

  text(
    `Quotation No. ${data.projectJobId}`,
    metaX,
    y + 3,
    8,
    bold,
    INK
  );

  text(
    `Date: ${data.dateCreated}`,
    metaX,
    y - 10,
    8,
    font,
    MUTED
  );

  text(
    `Valid until: ${
      data.validUntil ?? shortDate(data.dateCreated)
    }`,
    metaX,
    y - 23,
    8,
    font,
    MUTED
  );

  y -= 40;

  // ─────────────────────────────────────────────────────────────────────
  // CUSTOMER CARD
  // ─────────────────────────────────────────────────────────────────────

  page.drawRectangle({
    x: MARGIN,
    y: y - 54,
    width: contentWidth,
    height: 62,
    color: LIGHT,
    borderColor: BORDER,
    borderWidth: 0.7,
  });

  text(
    "BILL TO / CUSTOMER",
    MARGIN + 12,
    y - 8,
    7,
    bold,
    BLUE
  );

  text(
    data.customerName || "—",
    MARGIN + 12,
    y - 23,
    10,
    bold,
    INK
  );

  if (data.customerContact) {
    text(
      data.customerContact,
      MARGIN + 12,
      y - 37,
      7.5,
      font,
      MUTED
    );
  }

  if (data.customerEmail) {
    text(
      data.customerEmail,
      MARGIN + 190,
      y - 37,
      7.5,
      font,
      MUTED
    );
  }

  if (data.customerLocation) {
    text(
      data.customerLocation,
      MARGIN + 190,
      y - 23,
      7.5,
      font,
      MUTED
    );
  }

  y -= 72;

  // ─────────────────────────────────────────────────────────────────────
  // PROJECT DESCRIPTION
  //
  // IMPORTANT:
  // This section now displays JOB NAME.
  // It does NOT use servicesNote.
  // ─────────────────────────────────────────────────────────────────────

  text(
    "PROJECT DESCRIPTION",
    MARGIN,
    y,
    7.5,
    bold,
    MUTED
  );

  y -= 14;

  const projectDescription =
    data.jobName?.trim() ||
    "Signage fabrication and installation services";

  wrapped(
    projectDescription,
    MARGIN,
    9,
    contentWidth,
    12,
    bold,
    INK
  );

  y -= 8;

  // ─────────────────────────────────────────────────────────────────────
  // ITEM TABLE
  // ─────────────────────────────────────────────────────────────────────

  ensure(35);

  const tableTop = y;

  page.drawRectangle({
    x: MARGIN,
    y: tableTop - 20,
    width: contentWidth,
    height: 22,
    color: NAVY,
  });

  text(
    "DESCRIPTION",
    MARGIN + 8,
    tableTop - 13,
    7.5,
    bold,
    rgb(1, 1, 1)
  );

  text(
    "QTY",
    MARGIN + 342,
    tableTop - 13,
    7.5,
    bold,
    rgb(1, 1, 1)
  );

  text(
    "UNIT",
    MARGIN + 370,
    tableTop - 13,
    7.5,
    bold,
    rgb(1, 1, 1)
  );

  text(
    "UNIT PRICE",
    MARGIN + 398,
    tableTop - 13,
    7.5,
    bold,
    rgb(1, 1, 1)
  );

  text(
    "TOTAL",
    MARGIN + 470,
    tableTop - 13,
    7.5,
    bold,
    rgb(1, 1, 1)
  );

  y = tableTop - 30;

  let subtotal = 0;

  for (let idx = 0; idx < data.items.length; idx++) {
    const item = data.items[idx];

    const lineTotal =
      (item.quantity || 0) *
      (item.unit_price || 0);

    subtotal += lineTotal;

    const lines = wrapText(
      item.description || "—",
      font,
      8.2,
      325
    );

    const rowH = Math.max(
      22,
      lines.length * 10 + 10
    );

    ensure(rowH + 4);

    if (idx % 2 === 0) {
      page.drawRectangle({
        x: MARGIN,
        y: y - rowH + 5,
        width: contentWidth,
        height: rowH,
        color: rgb(0.985, 0.987, 0.987),
      });
    }

    lines.forEach((line, li) => {
      text(
        line,
        MARGIN + 8,
        y - li * 10,
        8.2,
        font,
        INK
      );
    });

    text(
      String(item.quantity),
      MARGIN + 342,
      y,
      8.2
    );

    text(
      item.unit || "unit",
      MARGIN + 370,
      y,
      8.2
    );

    text(
      money(item.unit_price),
      MARGIN + 398,
      y,
      8.2
    );

    text(
      money(lineTotal),
      MARGIN + 470,
      y,
      8.2,
      bold,
      INK
    );

    page.drawLine({
      start: {
        x: MARGIN,
        y: y - rowH + 3,
      },
      end: {
        x: MARGIN + contentWidth,
        y: y - rowH + 3,
      },
      thickness: 0.35,
      color: BORDER,
    });

    y -= rowH;
  }

  // ─────────────────────────────────────────────────────────────────────
  // TOTALS
  // ─────────────────────────────────────────────────────────────────────

  const discount = data.discountAmount ?? 0;
  const tax = data.taxAmount ?? 0;
  const charges = data.otherCharges ?? 0;

  const total = Math.max(
    0,
    subtotal - discount + tax + charges
  );

  y -= 8;

  ensure(105);

  const summaryX = MARGIN + 345;
  const valueX = MARGIN + 470;

  const summary = (
    label: string,
    value: number,
    color = INK,
    boldValue = false
  ) => {
    text(
      label,
      summaryX,
      y,
      8,
      font,
      MUTED
    );

    text(
      money(value),
      valueX,
      y,
      8,
      boldValue ? bold : font,
      color
    );

    y -= 13;
  };

  summary(
    "Subtotal",
    subtotal
  );

  if (discount > 0) {
    summary(
      `Discount${
        data.discountType === "percentage"
          ? ` (${data.discountValue ?? 0}%)`
          : ""
      }`,
      -discount,
      rgb(0.75, 0.15, 0.18)
    );
  }

  if (data.taxEnabled) {
    summary(
      `VAT / Tax (${data.taxRate ?? 0}%)`,
      tax
    );
  }

  if (charges > 0) {
    summary(
      data.otherChargesNote || "Other charges",
      charges
    );
  }

  page.drawRectangle({
    x: summaryX - 8,
    y: y - 8,
    width:
      contentWidth -
      (summaryX - MARGIN) +
      8,
    height: 27,
    color: BLUE,
  });

  text(
    "TOTAL",
    summaryX,
    y + 2,
    10,
    bold,
    rgb(1, 1, 1)
  );

  text(
    money(total),
    valueX,
    y + 2,
    10,
    bold,
    rgb(1, 1, 1)
  );

  y -= 28;

  // ─────────────────────────────────────────────────────────────────────
  // ADDITIONAL NOTES
  // ─────────────────────────────────────────────────────────────────────

  if (data.additionalNotes?.trim()) {
    ensure(55);

    text(
      "ADDITIONAL NOTES",
      MARGIN,
      y,
      8,
      bold,
      BLUE
    );

    y -= 13;

    wrapped(
      data.additionalNotes.trim(),
      MARGIN,
      8.5,
      contentWidth,
      12,
      font,
      INK
    );

    y -= 5;
  }

  // ─────────────────────────────────────────────────────────────────────
  // PAYMENT TERMS
  // ─────────────────────────────────────────────────────────────────────

  ensure(48);

  text(
    "PAYMENT TERMS",
    MARGIN,
    y,
    8,
    bold,
    BLUE
  );

  y -= 13;

  const payment =
    data.paymentTerms === "full_on_completion"
      ? "Full payment on completion"
      : data.paymentTerms === "full_on_installation"
      ? "Full payment on installation"
      : data.paymentTerms === "custom"
      ? "Custom payment schedule as agreed"
      : "50% downpayment / 50% after completion";

  wrapped(
    payment,
    MARGIN,
    8.5,
    contentWidth,
    12,
    font,
    INK
  );

  y -= 5;

  // ─────────────────────────────────────────────────────────────────────
  // TERMS & CONDITIONS
  // ─────────────────────────────────────────────────────────────────────

  ensure(60);

  text(
    "TERMS & CONDITIONS",
    MARGIN,
    y,
    8,
    bold,
    BLUE
  );

  y -= 13;

  for (
    const line of (
      data.terms ||
      `Price quotation valid for ${data.validDays} days.`
    ).split("\n")
  ) {
    wrapped(
      line.trim() || " ",
      MARGIN,
      7.7,
      contentWidth,
      11,
      font,
      INK
    );
  }

  y -= 8;

  // ─────────────────────────────────────────────────────────────────────
  // HOW TO PAY
  // ─────────────────────────────────────────────────────────────────────

  const hasBank = Boolean(
    data.bankName ||
    data.bankAccountNumber
  );

  const hasGcash = Boolean(
    data.gcashNumber ||
    qr
  );

  if (hasBank || hasGcash) {
    const boxHeight = 94;

    ensure(boxHeight + 10);

    const boxTop = y;

    page.drawRectangle({
      x: MARGIN,
      y: boxTop - boxHeight,
      width: contentWidth,
      height: boxHeight,
      color: LIGHT,
      borderColor: BORDER,
      borderWidth: 0.7,
    });

    page.drawRectangle({
      x: MARGIN,
      y: boxTop - 16,
      width: contentWidth,
      height: 16,
      color: NAVY,
    });

    text(
      "HOW TO PAY",
      MARGIN + 10,
      boxTop - 11.5,
      8,
      bold,
      rgb(1, 1, 1)
    );

    const qrSlot = qr ? 62 : 0;

    const colWidth =
      (contentWidth - 20 - qrSlot) /
      (hasBank && hasGcash ? 2 : 1);

    let colX = MARGIN + 10;

    const innerY = boxTop - 30;

    if (hasBank) {
      text(
        "Bank Transfer",
        colX,
        innerY,
        7.5,
        bold,
        INK
      );

      let by = innerY - 11;

      if (data.bankName) {
        text(
          data.bankName,
          colX,
          by,
          7.5,
          font,
          INK
        );

        by -= 10;
      }

      if (data.bankAccountName) {
        text(
          data.bankAccountName,
          colX,
          by,
          7.5,
          font,
          MUTED
        );

        by -= 10;
      }

      if (data.bankAccountNumber) {
        text(
          `Acct No. ${data.bankAccountNumber}`,
          colX,
          by,
          7.5,
          bold,
          INK
        );
      }

      colX += colWidth;
    }

    if (hasGcash) {
      text(
        "GCash",
        colX,
        innerY,
        7.5,
        bold,
        INK
      );

      let gy = innerY - 11;

      if (data.gcashNumber) {
        text(
          data.gcashNumber,
          colX,
          gy,
          7.5,
          bold,
          INK
        );

        gy -= 10;
      }

      if (data.gcashAccountName) {
        text(
          data.gcashAccountName,
          colX,
          gy,
          7.5,
          font,
          MUTED
        );
      }
    }

    if (qr) {
      // 76pt gives the QR enough physical size
      // to scan reliably from a printed PDF.
      const qrSize = 76;

      const qrX =
        MARGIN +
        contentWidth -
        10 -
        qrSize;

      const qrY =
        boxTop -
        16 -
        6 -
        qrSize;

      page.drawRectangle({
        x: qrX - 3,
        y: qrY - 3,
        width: qrSize + 6,
        height: qrSize + 6,
        color: rgb(1, 1, 1),
        borderColor: BORDER,
        borderWidth: 0.7,
      });

      page.drawImage(qr, {
        x: qrX,
        y: qrY,
        width: qrSize,
        height: qrSize,
      });

      text(
        "Scan to pay via GCash",
        qrX + qrSize / 2 - 34,
        qrY - 10,
        6.5,
        font,
        MUTED
      );
    }

    y = boxTop - boxHeight - 24;
  } else {
    y -= 18;
  }

  // ─────────────────────────────────────────────────────────────────────
  // CUSTOMER CONFORME / ACCEPTANCE
  // ─────────────────────────────────────────────────────────────────────

  ensure(105);

  text(
    "CUSTOMER CONFORME / ACCEPTANCE",
    MARGIN,
    y,
    8,
    bold,
    BLUE
  );

  y -= 28;

  const signatureY = y;

  const leftX = MARGIN;
  const rightX = MARGIN + 300;

  page.drawLine({
    start: {
      x: leftX,
      y: signatureY,
    },
    end: {
      x: leftX + 210,
      y: signatureY,
    },
    thickness: 0.8,
    color: INK,
  });

  page.drawLine({
    start: {
      x: rightX,
      y: signatureY,
    },
    end: {
      x: rightX + 180,
      y: signatureY,
    },
    thickness: 0.8,
    color: INK,
  });

  text(
    "Signature",
    leftX,
    signatureY - 12,
    7,
    font,
    MUTED
  );

  text(
    "Date",
    rightX,
    signatureY - 12,
    7,
    font,
    MUTED
  );

  y = signatureY - 38;

  page.drawLine({
    start: {
      x: leftX,
      y,
    },
    end: {
      x: leftX + 210,
      y,
    },
    thickness: 0.8,
    color: INK,
  });

  page.drawLine({
    start: {
      x: rightX,
      y,
    },
    end: {
      x: rightX + 180,
      y,
    },
    thickness: 0.8,
    color: INK,
  });

  text(
    "Printed Name / Authorized Representative",
    leftX,
    y - 12,
    7,
    font,
    MUTED
  );

  text(
    "Company / Position",
    rightX,
    y - 12,
    7,
    font,
    MUTED
  );

  // ─────────────────────────────────────────────────────────────────────
  // SAMPLE MOCK-UP PAGE(S)
  // ─────────────────────────────────────────────────────────────────────

  const mockupBytes = (
    data.mockupImageBytes ?? []
  ).filter(Boolean);

  if (mockupBytes.length > 0) {
    const embedded: {
      img: PDFImage;
      w: number;
      h: number;
    }[] = [];

    for (const bytes of mockupBytes) {
      const img = await embedImageAuto(
        doc,
        bytes
      );

      if (img) {
        embedded.push({
          img,
          w: img.width,
          h: img.height,
        });
      }
    }

    if (embedded.length > 0) {
      // Up to 2 images per page, stacked vertically.
      const maxPerPage = 2;

      for (
        let start = 0;
        start < embedded.length;
        start += maxPerPage
      ) {
        page = doc.addPage([
          PAGE_WIDTH,
          PAGE_HEIGHT,
        ]);

        drawPageAccent();

        y = PAGE_HEIGHT - MARGIN;

        text(
          "SAMPLE MOCK-UP",
          MARGIN,
          y,
          16,
          bold,
          BLUE
        );

        text(
          `Quotation ${data.projectJobId}`,
          MARGIN + 160,
          y + 2,
          8,
          font,
          MUTED
        );

        y -= 18;

        text(
          "Visual reference for the proposed signage design / desired sample.",
          MARGIN,
          y,
          8,
          font,
          MUTED
        );

        y -= 22;

        const slice = embedded.slice(
          start,
          start + maxPerPage
        );

        const availableH =
          y - MARGIN - 20;

        const gap = 16;

        const slotH =
          (availableH -
            gap * (slice.length - 1)) /
          slice.length;

        for (
          let i = 0;
          i < slice.length;
          i++
        ) {
          const {
            img,
            w,
            h,
          } = slice[i];

          const maxW = contentWidth;
          const maxH = slotH - 14;

          const scale = Math.min(
            maxW / w,
            maxH / h,
            1
          );

          const drawW = w * scale;
          const drawH = h * scale;

          const slotTop =
            y -
            i * (slotH + gap);

          const imgX =
            MARGIN +
            (contentWidth - drawW) / 2;

          const imgY =
            slotTop - drawH;

          page.drawRectangle({
            x: imgX - 4,
            y: imgY - 4,
            width: drawW + 8,
            height: drawH + 8,
            color: rgb(1, 1, 1),
            borderColor: BORDER,
            borderWidth: 0.7,
          });

          page.drawImage(img, {
            x: imgX,
            y: imgY,
            width: drawW,
            height: drawH,
          });

          text(
            `Sample Mock-Up ${
              start + i + 1
            } of ${embedded.length}`,
            MARGIN,
            imgY - 12,
            7,
            font,
            MUTED
          );
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // FOOTER ON EVERY PAGE
  // ─────────────────────────────────────────────────────────────────────

  const pages = doc.getPages();

  pages.forEach((p, i) => {
    p.drawRectangle({
      x: MARGIN,
      y: 25,
      width: contentWidth,
      height: 0.7,
      color: BORDER,
    });

    p.drawText(
      `${data.companyName} · ${data.projectJobId}`,
      {
        x: MARGIN,
        y: 14,
        size: 6.5,
        font,
        color: MUTED,
      }
    );

    p.drawText(
      `Page ${i + 1} of ${pages.length}`,
      {
        x: PAGE_WIDTH - MARGIN - 55,
        y: 14,
        size: 6.5,
        font,
        color: MUTED,
      }
    );
  });

  return doc.save();
}
