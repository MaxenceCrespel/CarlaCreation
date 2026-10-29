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
  // Only ever set on sendAdminCancellationNotification — the client's own
  // reason for a self-cancellation.
  cancellationReason?: string;
  // Same: null when there was no online payment to begin with (Stripe not
  // configured, "payer sur place", or the client never paid), true/false
  // once there was one.
  paymentRefunded?: boolean | null;
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
        ? `J'ai bien reçu votre demande de rendez-vous pour ${input.guests.length} personnes. Elle est actuellement <strong>en attente de confirmation</strong>.`
        : `J'ai bien reçu votre demande de rendez-vous. Elle est actuellement <strong>en attente de confirmation</strong>.`;
    // Not confirmed yet — the studio's exact address stays private until it is.
    await this.send(input.clientEmail, subject, this.renderBookingEmail(input, intro, undefined, false));
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
            ? `à domicile${input.clientAddress ? ` — ${mapsLinkHtml(input.clientAddress)}` : ''}`
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

  // Sent to the studio's own inbox when the *client* cancels their own
  // booking (see ReservationsService.cancelByGroupId) — the push
  // notification sent alongside this can be missed if Carla is offline or
  // hasn't enabled push on her device, so email is the reliable fallback.
  // Not sent when the admin cancels a booking herself (see updateStatus /
  // updateGroupStatus, which only email the client).
  async sendAdminCancellationNotification(input: BookingEmailInput): Promise<void> {
    if (!this.transporter || !config.SMTP_USER) return;

    const subject = `Rendez-vous annulé par le client — ${input.clientName}`;
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
        <h2 style="color:#9A5F4B;">Rendez-vous annulé par le client</h2>
        <p><strong>${escapeHtml(input.clientName)}</strong> — ${escapeHtml(input.clientEmail)}${input.clientPhone ? ` — ${escapeHtml(input.clientPhone)}` : ''}</p>
        <p style="margin:16px 0 4px;"><strong>Date :</strong> ${formatDateFr(input.date)}</p>
        ${input.cancellationReason ? `<p style="margin:0 0 16px;"><strong>Motif :</strong> ${escapeHtml(input.cancellationReason)}</p>` : ''}
        ${
          input.paymentRefunded === true
            ? `<p style="margin:0 0 16px;"><strong>Paiement :</strong> remboursé automatiquement.</p>`
            : input.paymentRefunded === false
              ? `<p style="margin:0 0 16px;"><strong>Paiement :</strong> le remboursement automatique a échoué — à rembourser à la main depuis le tableau de bord Stripe.</p>`
              : ''
        }
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
        <p style="margin-top:24px;"><a href="${config.PUBLIC_ORIGIN}/admin" style="color:#9A5F4B;">Voir dans l'espace admin</a></p>
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
    // Reminders only ever go out for already-confirmed bookings (see
    // ReservationsService.dispatchDueReminders), so the address is safe to show.
    await this.send(input.clientEmail, subject, this.renderBookingEmail(input, intro, undefined, true));
  }

  async sendStatusUpdate(input: BookingEmailInput & { status: string }): Promise<void> {
    // 'completed' gets its own email (a review request) instead of the
    // booking-status template below — see sendReviewRequest.
    if (input.status === 'completed') {
      await this.sendReviewRequest(input);
      return;
    }
    // Only these transitions are worth an email — 'pending' is the initial
    // state (covered by sendBookingReceived).
    if (input.status !== 'confirmed' && input.status !== 'refused' && input.status !== 'cancelled') return;

    const label = STATUS_LABELS[input.status] || input.status;
    const subjectVerb = input.status === 'confirmed' ? 'confirmé' : input.status === 'refused' ? 'refusé' : 'annulé';
    const subject = `Votre rendez-vous a été ${subjectVerb} — ${siteConfig.siteName}`;

    let intro: string;
    if (input.status === 'confirmed') {
      intro = `Bonne nouvelle : votre rendez-vous est <strong>confirmé</strong> !`;
    } else if (input.status === 'refused') {
      intro = `Je suis désolée, votre demande de rendez-vous a été <strong>refusée</strong>. N'hésitez pas à me contacter pour trouver un autre créneau.`;
    } else {
      intro = `Votre rendez-vous a été <strong>annulé</strong>.`;
    }

    // Only reveal the studio's exact address once the appointment is
    // actually confirmed — not on a refusal/cancellation notice.
    await this.send(input.clientEmail, subject, this.renderBookingEmail(input, intro, label, input.status === 'confirmed'));
  }

  // Sent once a reservation is marked "completed" by the admin — invites the
  // client to leave a review, linking to the testimonials section on the
  // homepage (there is no dedicated /avis page).
  async sendReviewRequest(input: BookingEmailInput): Promise<void> {
    const subject = `Merci pour votre visite — ${siteConfig.siteName}`;
    const reviewUrl = `${config.PUBLIC_ORIGIN}/#testimonials`;

    const html = `
      <div style="font-family: Segoe UI, Arial, sans-serif; color:#3A2E27; max-width:560px; margin:0 auto;">
        <img src="${config.PUBLIC_ORIGIN}/logo-email.png" alt="${escapeHtml(siteConfig.siteName)}" width="140" style="display:block;margin:0 0 16px;" />
        <p>Bonjour ${escapeHtml(input.clientName)},</p>
        <p>Merci pour votre visite ! J'espère que la prestation vous a plu.</p>
        <p>Votre avis compte beaucoup et aide d'autres client·e·s à me faire confiance — auriez-vous deux minutes pour en laisser un ?</p>
        <p style="margin-top:24px;">
          <a href="${siteConfig.googleReviewUrl}" style="display:inline-block;background:#9A5F4B;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Laisser un avis sur Google</a>
        </p>
        <p style="margin-top:12px;color:#6B5C51;font-size:0.9em;">Vous préférez le faire sur mon site ? <a href="${reviewUrl}" style="color:#9A5F4B;">Laisser un avis ici</a>.</p>
        <p style="margin-top:24px;">Une question ? Appelez-moi au ${escapeHtml(siteConfig.sitePhone)} ou répondez à cet email.</p>
        <p style="color:#6B5C51;font-size:0.85em;margin-top:32px;">${escapeHtml(siteConfig.siteName)}</p>
      </div>
    `;
    await this.send(input.clientEmail, subject, html);
  }

  // Sent when a client exchanges loyalty points for a euro code — see
  // RewardsService.redeem.
  async sendRedeemedReward(input: { clientName: string; clientEmail: string; code: string; amountCents: number }): Promise<void> {
    const subject = `Votre récompense fidélité — ${siteConfig.siteName}`;
    const euros = (input.amountCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0 });
    const html = `
      <div style="font-family: Segoe UI, Arial, sans-serif; color:#3A2E27; max-width:560px; margin:0 auto;">
        <img src="${config.PUBLIC_ORIGIN}/logo-email.png" alt="${escapeHtml(siteConfig.siteName)}" width="140" style="display:block;margin:0 0 16px;" />
        <p>Bonjour ${escapeHtml(input.clientName)},</p>
        <p>Merci pour votre fidélité ! Voici votre code, à utiliser à votre prochaine réservation (une seule fois, depuis votre compte) :</p>
        <p style="margin:16px 0;font-size:1.4em;font-weight:700;letter-spacing:0.05em;color:#9A5F4B;">${escapeHtml(input.code)}</p>
        <p>Il vous offre <strong>${euros} €</strong> sur votre prochaine prestation.</p>
        <p style="margin-top:24px;">
          <a href="${config.PUBLIC_ORIGIN}/booking" style="display:inline-block;background:#9A5F4B;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Prendre rendez-vous</a>
        </p>
        <p style="color:#6B5C51;font-size:0.85em;margin-top:32px;">${escapeHtml(siteConfig.siteName)}</p>
      </div>
    `;
    await this.send(input.clientEmail, subject, html);
  }

  // Sent once a year, around a client's birthday — see
  // RewardsService.sendBirthdayRewards.
  async sendBirthdayReward(input: { clientName: string; clientEmail: string; code: string; discountPercent: number; validUntil: Date }): Promise<void> {
    const subject = `Joyeux anniversaire ! Un petit cadeau — ${siteConfig.siteName}`;
    const html = `
      <div style="font-family: Segoe UI, Arial, sans-serif; color:#3A2E27; max-width:560px; margin:0 auto;">
        <img src="${config.PUBLIC_ORIGIN}/logo-email.png" alt="${escapeHtml(siteConfig.siteName)}" width="140" style="display:block;margin:0 0 16px;" />
        <p>Bonjour ${escapeHtml(input.clientName)},</p>
        <p>Joyeux anniversaire ! 🎉 Pour l'occasion, voici un code promo à utiliser à votre prochaine réservation :</p>
        <p style="margin:16px 0;font-size:1.4em;font-weight:700;letter-spacing:0.05em;color:#9A5F4B;">${escapeHtml(input.code)}</p>
        <p>Il vous donne <strong>${input.discountPercent}%</strong> de réduction sur une prestation, valable jusqu'au <strong>${formatDateFr(input.validUntil.toISOString().slice(0, 10))}</strong> (une seule utilisation, depuis votre compte).</p>
        <p style="margin-top:24px;">
          <a href="${config.PUBLIC_ORIGIN}/booking" style="display:inline-block;background:#9A5F4B;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Prendre rendez-vous</a>
        </p>
        <p style="color:#6B5C51;font-size:0.85em;margin-top:32px;">${escapeHtml(siteConfig.siteName)}</p>
      </div>
    `;
    await this.send(input.clientEmail, subject, html);
  }

  private accountEmailHtml(clientName: string, bodyHtml: string, button?: { href: string; label: string }): string {
    return `
      <div style="font-family: Segoe UI, Arial, sans-serif; color:#3A2E27; max-width:560px; margin:0 auto;">
        <img src="${config.PUBLIC_ORIGIN}/logo-email.png" alt="${escapeHtml(siteConfig.siteName)}" width="140" style="display:block;margin:0 0 16px;" />
        <p>Bonjour ${escapeHtml(clientName)},</p>
        ${bodyHtml}
        ${button ? `<p style="margin-top:24px;"><a href="${button.href}" style="display:inline-block;background:#9A5F4B;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">${escapeHtml(button.label)}</a></p><p style="color:#6B5C51;font-size:0.85em;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${button.href}</p>` : ''}
        <p style="color:#6B5C51;font-size:0.85em;margin-top:32px;">${escapeHtml(siteConfig.siteName)}</p>
      </div>
    `;
  }

  // New message from Carla in the client's conversation (« Mon compte »).
  // Only the first message of a burst triggers it — see MessagingService.
  async sendClientNewMessage(input: { clientName: string; clientEmail: string; preview: string }): Promise<void> {
    const html = this.accountEmailHtml(
      input.clientName,
      `<p>Vous avez un nouveau message de ${escapeHtml(siteConfig.siteName)} :</p>
       <blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #9A5F4B;background:#F8F4EF;color:#3A2E27;">${escapeHtml(input.preview)}</blockquote>
       <p>Pour lire la suite et répondre, connectez-vous à votre espace.</p>`,
      { href: `${config.PUBLIC_ORIGIN}/mon-compte#messages`, label: 'Lire et répondre' },
    );
    await this.send(input.clientEmail, `Nouveau message de ${siteConfig.siteName}`, html);
  }

  // Same reliable fallback as the booking notifications: push can be missed.
  async sendAdminNewClientMessage(input: { clientName: string; preview: string; clientId: number }): Promise<void> {
    if (!this.transporter || !config.SMTP_USER) return;
    const html = `
      <div style="font-family: Segoe UI, Arial, sans-serif; color:#3A2E27; max-width:560px; margin:0 auto;">
        <h2 style="color:#9A5F4B;">Nouveau message de ${escapeHtml(input.clientName)}</h2>
        <blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #9A5F4B;background:#F8F4EF;">${escapeHtml(input.preview)}</blockquote>
        <p style="margin-top:24px;"><a href="${config.PUBLIC_ORIGIN}/admin#/plus/messages/${input.clientId}" style="color:#9A5F4B;">Répondre dans l'espace admin</a></p>
      </div>
    `;
    await this.send(config.SMTP_USER, `Nouveau message — ${input.clientName}`, html);
  }

  // Sent at signup — the account only works once this link is clicked.
  async sendEmailVerification(input: { clientName: string; clientEmail: string; link: string }): Promise<void> {
    const html = this.accountEmailHtml(
      input.clientName,
      '<p>Merci pour votre inscription ! Confirmez votre adresse email pour activer votre compte (le lien est valable 24 heures).</p><p>Si vous n\'êtes pas à l\'origine de cette inscription, ignorez simplement ce message.</p>',
      { href: input.link, label: 'Confirmer mon adresse email' },
    );
    await this.send(input.clientEmail, `Confirmez votre adresse email — ${siteConfig.siteName}`, html);
  }

  async sendPasswordReset(input: { clientName: string; clientEmail: string; link: string }): Promise<void> {
    const html = this.accountEmailHtml(
      input.clientName,
      '<p>Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable 1 heure et ne peut servir qu\'une fois.</p><p>Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.</p>',
      { href: input.link, label: 'Choisir un nouveau mot de passe' },
    );
    await this.send(input.clientEmail, `Réinitialisation de votre mot de passe — ${siteConfig.siteName}`, html);
  }

  async sendAccountDeleted(input: { clientName: string; clientEmail: string }): Promise<void> {
    const html = this.accountEmailHtml(
      input.clientName,
      '<p>Votre compte et vos points de fidélité ont bien été supprimés, et vos réservations anonymisées. Seules les factures émises sont conservées, conformément à nos obligations légales.</p><p>Merci de votre confiance, et à bientôt peut-être.</p>',
    );
    await this.send(input.clientEmail, `Votre compte a été supprimé — ${siteConfig.siteName}`, html);
  }

  async sendInactivityWarning(input: { clientName: string; clientEmail: string; loginLink: string; days: number }): Promise<void> {
    const html = this.accountEmailHtml(
      input.clientName,
      `<p>Vous ne vous êtes pas connecté(e) depuis longtemps. Sans connexion de votre part, votre compte et vos points de fidélité seront supprimés dans environ <strong>${input.days} jours</strong>, conformément à notre politique de conservation des données.</p><p>Pour les conserver, il suffit de vous connecter.</p>`,
      { href: input.loginLink, label: 'Me connecter' },
    );
    await this.send(input.clientEmail, `Votre compte va être supprimé — ${siteConfig.siteName}`, html);
  }

  private renderBookingEmail(input: BookingEmailInput, introHtml: string, statusLabel?: string, revealAddress = false): string {
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

    // The client's own home address (à-domicile) isn't sensitive — they typed
    // it in themselves. The studio's address is different: it's not shown
    // until the appointment is actually confirmed (see revealAddress).
    const locationLine = input.atClientHome
      ? `<p style="margin:0 0 4px;"><strong>Lieu :</strong> à votre domicile${input.clientAddress ? ` — ${mapsLinkHtml(input.clientAddress)}` : ''}</p>`
      : `<p style="margin:0 0 4px;"><strong>Lieu :</strong> chez ${escapeHtml(siteConfig.siteName)}${
          revealAddress ? ` — ${mapsLinkHtml(siteConfig.siteAddress)}` : " — l'adresse exacte vous sera communiquée à la confirmation"
        }</p>`;

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
        <p style="margin-top:24px;">Une question ? Appelez-moi au ${escapeHtml(siteConfig.sitePhone)} ou répondez à cet email.</p>
        <p style="color:#6B5C51;font-size:0.85em;margin-top:32px;">${escapeHtml(siteConfig.siteName)}${revealAddress ? ` — ${mapsLinkHtml(siteConfig.siteAddress)}` : ''}</p>
      </div>
    `;
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[MAIL DISABLED] Would send to ${to}: "${subject}"`);
      if (config.NODE_ENV !== 'production') this.logger.log(htmlToText(html));
      return;
    }
    try {
      // An HTML-only email (no plain-text alternative) is a well-known spam
      // signal to most filters — always send both parts.
      await this.transporter.sendMail({ from: config.SMTP_FROM, to, subject, html, text: htmlToText(html) });
    } catch (err) {
      // A failed email must never break the booking flow itself — the
      // reservation is already saved; just log so the admin can investigate.
      this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
    }
  }
}

// Turns a plain address into a clickable Google Maps link — recipients can
// tap straight through instead of copy-pasting into a maps app themselves.
// Degrades gracefully to plain address text in the plain-text email part
// (htmlToText strips tags), same as every other link in these templates.
function mapsLinkHtml(address: string): string {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return `<a href="${url}" style="color:#9A5F4B;">${escapeHtml(address)}</a>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Good-enough plain-text rendering of our own template HTML (not a general
// HTML-to-text library) — just needs to be readable, not pixel-perfect.
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
