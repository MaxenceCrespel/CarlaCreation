import PDFDocument from 'pdfkit';
import { siteConfig } from '../../site-config';
import { Invoice } from '../../database/entities/invoice.entity';

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Deliberately has no SIRET/legal-mentions block yet — Carla isn't
// officially déclarée as auto-entrepreneuse. `invoice.legal_mentions`
// is rendered when present so this becomes a one-line change once she is.
export function renderInvoicePdf(invoice: Invoice): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  doc.fontSize(20).text(siteConfig.siteName, { continued: false });
  doc.fontSize(10).fillColor('#666').text(siteConfig.sitePublicArea);
  doc.text(siteConfig.sitePhone);
  doc.text(siteConfig.siteEmail);
  doc.fillColor('#000');

  doc.moveDown(2);
  doc.fontSize(16).text(`Facture ${invoice.number}`);
  doc.fontSize(10).fillColor('#666').text(`Date d'émission : ${formatDate(invoice.issue_date)}`);
  doc.fillColor('#000');

  doc.moveDown(1.5);
  doc.fontSize(11).text('Client', { underline: true });
  doc.fontSize(10);
  doc.text(invoice.client_name);
  if (invoice.client_address) doc.text(invoice.client_address);
  if (invoice.client_email) doc.text(invoice.client_email);
  if (invoice.client_phone) doc.text(invoice.client_phone);

  doc.moveDown(1.5);

  const tableTop = doc.y;
  const col = { description: 50, quantity: 330, unitPrice: 400, total: 480 };
  doc.fontSize(10).fillColor('#666');
  doc.text('Description', col.description, tableTop);
  doc.text('Qté', col.quantity, tableTop);
  doc.text('Prix unit.', col.unitPrice, tableTop);
  doc.text('Total', col.total, tableTop);
  doc.fillColor('#000');
  doc.moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).strokeColor('#ccc').stroke();

  let y = tableTop + 24;
  for (const item of invoice.items) {
    const lineTotal = Math.round(item.quantity * item.unit_price_cents);
    doc.fontSize(10);
    doc.text(item.description, col.description, y, { width: 270 });
    doc.text(item.quantity.toString(), col.quantity, y);
    doc.text(formatCents(item.unit_price_cents), col.unitPrice, y);
    doc.text(formatCents(lineTotal), col.total, y);
    y += 20;
  }

  doc.moveTo(50, y + 4).lineTo(545, y + 4).strokeColor('#ccc').stroke();
  doc.fontSize(12).text(`Total : ${formatCents(invoice.total_cents)}`, col.total - 60, y + 14, { width: 155, align: 'right' });

  doc.moveDown(3);
  const statusLabel = invoice.status === 'paid' ? 'Payée' : 'Non payée';
  doc.fontSize(10).fillColor('#666').text(`Statut : ${statusLabel}${invoice.payment_method ? ` (${invoice.payment_method})` : ''}`);
  doc.fillColor('#000');

  if (invoice.notes) {
    doc.moveDown(1);
    doc.fontSize(9).fillColor('#666').text(invoice.notes);
    doc.fillColor('#000');
  }

  if (invoice.legal_mentions) {
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#999').text(invoice.legal_mentions);
    doc.fillColor('#000');
  }

  doc.end();
  return doc;
}
