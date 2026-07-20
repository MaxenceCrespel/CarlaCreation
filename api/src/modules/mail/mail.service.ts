import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { config } from '../../config';
import { siteConfig } from '../../site-config';

export interface EmailGuest {
  name: string;
  serviceName: string;
  startTime: string;
  endTime: string;
}

export interface BookingEmailInput {
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  date: string;
  guests: EmailGuest[];
  groupId?: string;
  atClientHome?: boolean;
  clientAddress?: string | null;
}

const DAY_NAMES_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTH_NAMES_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function formatDateFr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAY_NAMES_FR[date.getDay()]} ${d} ${MONTH_NAMES_FR[m - 1]} ${y}`;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'en attente de confirmation',
  confirmed: 'confirmée',
  completed: 'terminée',
  cancelled: 'annulée',
  refused: 'refusée',
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;

  constructor() {
    if (!config.MAIL_ENABLED) {
      this.transporter = null;
      this.logger.warn(
        'SMTP_HOST is not set — booking confirmation emails will be logged to the console instead of sent. ' +
          'Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS in api/.env to send real emails.',
      );
      return;
    }
    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    });
  }

  async sendBookingReceived(input: BookingEmailInput): Promise<void> {
    const subject = `Demande de rendez-vous reçue — ${siteConfig.siteName}`;
    const intro =
      input.guests.length > 1
        ? `Nous avons bien reçu votre demande de rendez-vous pour ${input.guests.length} personnes. Elle est actuellement <strong>en attente de confirmation</strong>.`
        : `Nous avons bien reçu votre demande de rendez-vous. Elle est actuellement <strong>en attente de confirmation</strong>.`;
    await this.send(input.clientEmail, subject, this.renderBookingEmail(input, intro));
  }

  // Sent to the studio's own inbox (SMTP_USER) so the absence of an admin
  // notification system is covered by email — there is no other alert
  // mechanism when a new booking request comes in.
  async sendAdminNewBookingNotification(input: BookingEmailInput): Promise<void> {
    if (!this.transporter || !config.SMTP_USER) return;

    const subject = `Nouvelle demande de rendez-vous — ${input.clientName}`;
    const rows = input.guests
      .map(
        (g) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #E9DED2;">${escapeHtml(g.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E9DED2;">${escapeHtml(g.serviceName)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E9DED2;">${g.startTime} – ${g.endTime}</td>
        </tr>`,
      )
      .join('');

    const html = `
      <div style="font-family: Segoe UI, Arial, sans-serif; color:#3A2E27; max-width:560px; margin:0 auto;">
        <h2 style="color:#9A5F4B;">Nouvelle demande de rendez-vous</h2>
        <p><strong>${escapeHtml(input.clientName)}</strong> — ${escapeHtml(input.clientEmail)}${input.clientPhone ? ` — ${escapeHtml(input.clientPhone)}` : ''}</p>
        <p style="margin:16px 0 4px;"><strong>Date :</strong> ${formatDateFr(input.date)}</p>
        <p style="margin:0 0 4px;"><strong>Lieu :</strong> ${
          input.atClientHome
            ? `à domicile${input.clientAddress ? ` — ${escapeHtml(input.clientAddress)}` : ''}`
            : 'au studio'
        }</p>
        <table style="border-collapse:collapse;width:100%;margin:12px 0;">
          <thead>
            <tr style="background:#F8F4EF;">
              <th style="text-align:left;padding:8px 12px;">Personne</th>
              <th style="text-align:left;padding:8px 12px;">Prestation</th>
              <th style="text-align:left;padding:8px 12px;">Horaire</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:24px;"><a href="${config.PUBLIC_ORIGIN}/admin" style="color:#9A5F4B;">Confirmer ou refuser dans l'espace admin</a></p>
      </div>
    `;
    await this.send(config.SMTP_USER, subject, html);
  }

  async sendReminder(input: BookingEmailInput): Promise<void> {
    const subject = `Rappel — rendez-vous demain — ${siteConfig.siteName}`;
    const intro =
      input.guests.length > 1
        ? `Petit rappel : vous avez rendez-vous demain pour ${input.guests.length} personnes.`
        : `Petit rappel : vous avez rendez-vous demain.`;
    await this.send(input.clientEmail, subject, this.renderBookingEmail(input, intro));
  }

  async sendStatusUpdate(input: BookingEmailInput & { status: string }): Promise<void> {
    // Only these transitions are worth an email — 'pending' is the initial
    // state (covered by sendBookingReceived) and 'completed' isn't urgent.
    if (input.status !== 'confirmed' && input.status !== 'refused' && input.status !== 'cancelled') return;

    const label = STATUS_LABELS[input.status] || input.status;
    const subjectVerb = input.status === 'confirmed' ? 'confirmé' : input.status === 'refused' ? 'refusé' : 'annulé';
    const subject = `Votre rendez-vous a été ${subjectVerb} — ${siteConfig.siteName}`;

    let intro: string;
    if (input.status === 'confirmed') {
      intro = `Bonne nouvelle : votre rendez-vous est <strong>confirmé</strong> !`;
    } else if (input.status === 'refused') {
      intro = `Nous sommes désolés, votre demande de rendez-vous a été <strong>refusée</strong>. N'hésitez pas à nous contacter pour trouver un autre créneau.`;
    } else {
      intro = `Votre rendez-vous a été <strong>annulé</strong>.`;
    }

    await this.send(input.clientEmail, subject, this.renderBookingEmail(input, intro, label));
  }

  private renderBookingEmail(input: BookingEmailInput, introHtml: string, statusLabel?: string): string {
    const rows = input.guests
      .map(
        (g) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #E9DED2;">${escapeHtml(g.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E9DED2;">${escapeHtml(g.serviceName)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #E9DED2;">${g.startTime} – ${g.endTime}</td>
        </tr>`,
      )
      .join('');

    const manageLink = input.groupId
      ? `<p style="margin-top:16px;"><a href="${config.PUBLIC_ORIGIN}/mon-rendez-vous/${input.groupId}" style="color:#9A5F4B;">Voir ou annuler mon rendez-vous</a></p>`
      : '';

    const locationLine = input.atClientHome
      ? `<p style="margin:0 0 4px;"><strong>Lieu :</strong> à votre domicile${input.clientAddress ? ` — ${escapeHtml(input.clientAddress)}` : ''}</p>`
      : `<p style="margin:0 0 4px;"><strong>Lieu :</strong> chez ${escapeHtml(siteConfig.siteName)} — ${escapeHtml(siteConfig.siteAddress)}</p>`;

    return `
      <div style="font-family: Segoe UI, Arial, sans-serif; color:#3A2E27; max-width:560px; margin:0 auto;">
        <img src="${config.PUBLIC_ORIGIN}/logo-email.png" alt="${escapeHtml(siteConfig.siteName)}" width="140" style="display:block;margin:0 0 16px;" />
        <p>Bonjour ${escapeHtml(input.clientName)},</p>
        <p>${introHtml}</p>
        <p style="margin:16px 0 4px;"><strong>Date :</strong> ${formatDateFr(input.date)}</p>
        ${locationLine}
        ${statusLabel ? `<p style="margin:0 0 16px;"><strong>Statut :</strong> ${escapeHtml(statusLabel)}</p>` : ''}
        <table style="border-collapse:collapse;width:100%;margin:12px 0;">
          <thead>
            <tr style="background:#F8F4EF;">
              <th style="text-align:left;padding:8px 12px;">Personne</th>
              <th style="text-align:left;padding:8px 12px;">Prestation</th>
              <th style="text-align:left;padding:8px 12px;">Horaire</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${manageLink}
        <p style="margin-top:24px;">Une question ? Appelez-nous au ${escapeHtml(siteConfig.sitePhone)} ou répondez à cet email.</p>
        <p style="color:#6B5C51;font-size:0.85em;margin-top:32px;">${escapeHtml(siteConfig.siteName)} — ${escapeHtml(siteConfig.siteAddress)}</p>
      </div>
    `;
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[MAIL DISABLED] Would send to ${to}: "${subject}"`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: config.SMTP_FROM, to, subject, html });
    } catch (err) {
      // A failed email must never break the booking flow itself — the
      // reservation is already saved; just log so the admin can investigate.
      this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
