const sendMail = jest.fn().mockResolvedValue(undefined);
const createTransport = jest.fn().mockReturnValue({ sendMail });

jest.mock('nodemailer', () => ({ createTransport: (...args: unknown[]) => createTransport(...args) }));
jest.mock('../../config', () => ({
  config: {
    MAIL_ENABLED: true,
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: 'studio@example.com',
    SMTP_PASS: 'secret',
    SMTP_FROM: 'Carla Création <studio@example.com>',
    PUBLIC_ORIGIN: 'https://carlacreation.example',
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MailService } = require('./mail.service');

describe('MailService — studio address privacy', () => {
  let service: InstanceType<typeof MailService>;

  const baseInput = {
    clientName: 'Alice',
    clientEmail: 'alice@example.com',
    date: '2026-08-01',
    guests: [{ name: 'Alice', serviceName: 'Coupe Femme', startTime: '10:00', endTime: '10:45' }],
  };

  beforeEach(() => {
    sendMail.mockClear();
    service = new MailService();
  });

  it('sendBookingReceived (still pending) never includes the studio address', async () => {
    await service.sendBookingReceived(baseInput);
    const html = sendMail.mock.calls[0][0].html;
    expect(html).not.toContain('1 rue Georges Clemenceau');
    expect(html).toContain('adresse exacte vous sera communiquée à la confirmation');
  });

  it('sendStatusUpdate reveals the studio address once confirmed', async () => {
    await service.sendStatusUpdate({ ...baseInput, status: 'confirmed' });
    const html = sendMail.mock.calls[0][0].html;
    expect(html).toContain('1 rue Georges Clemenceau');
  });

  it('sendStatusUpdate does not reveal the address on a refusal', async () => {
    await service.sendStatusUpdate({ ...baseInput, status: 'refused' });
    const html = sendMail.mock.calls[0][0].html;
    expect(html).not.toContain('1 rue Georges Clemenceau');
  });

  it('sendStatusUpdate does not reveal the address on a cancellation', async () => {
    await service.sendStatusUpdate({ ...baseInput, status: 'cancelled' });
    const html = sendMail.mock.calls[0][0].html;
    expect(html).not.toContain('1 rue Georges Clemenceau');
  });

  it('sendReminder reveals the address (reminders only fire for confirmed bookings)', async () => {
    await service.sendReminder(baseInput);
    const html = sendMail.mock.calls[0][0].html;
    expect(html).toContain('1 rue Georges Clemenceau');
  });

  it('never hides an à-domicile client\'s own address, regardless of status', async () => {
    const homeInput = { ...baseInput, atClientHome: true, clientAddress: '9 avenue du Test, 59000 Lille' };
    await service.sendBookingReceived(homeInput);
    const html = sendMail.mock.calls[0][0].html;
    expect(html).toContain('9 avenue du Test, 59000 Lille');
  });

  it('renders the revealed studio address as a clickable Google Maps link', async () => {
    await service.sendStatusUpdate({ ...baseInput, status: 'confirmed' });
    const html = sendMail.mock.calls[0][0].html;
    expect(html).toContain(
      `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('1 rue Georges Clemenceau, 59120 Loos')}"`,
    );
  });

  it('renders an à-domicile client\'s address as a clickable Google Maps link too', async () => {
    const homeInput = { ...baseInput, atClientHome: true, clientAddress: '9 avenue du Test, 59000 Lille' };
    await service.sendBookingReceived(homeInput);
    const html = sendMail.mock.calls[0][0].html;
    expect(html).toContain(
      `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('9 avenue du Test, 59000 Lille')}"`,
    );
  });

  it('renders the client\'s address as a maps link in the admin new-booking notification too', async () => {
    const homeInput = { ...baseInput, clientPhone: '0600000000', atClientHome: true, clientAddress: '9 avenue du Test, 59000 Lille' };
    await service.sendAdminNewBookingNotification(homeInput);
    const html = sendMail.mock.calls[0][0].html;
    expect(html).toContain(
      `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('9 avenue du Test, 59000 Lille')}"`,
    );
  });

  it('sendStatusUpdate sends a review-request email (not the booking-status template) once completed', async () => {
    await service.sendStatusUpdate({ ...baseInput, status: 'completed' });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const { subject, html } = sendMail.mock.calls[0][0];
    expect(subject).toContain('Merci pour votre visite');
    expect(html).toContain('https://carlacreation.example/#testimonials');
    expect(html).not.toContain('<table');
  });

  it('sendAdminCancellationNotification sends to the studio inbox, not the client', async () => {
    await service.sendAdminCancellationNotification({ ...baseInput, clientPhone: '0600000000' });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const { to, subject, html } = sendMail.mock.calls[0][0];
    expect(to).toBe('studio@example.com');
    expect(subject).toContain('Rendez-vous annulé par le client');
    expect(html).toContain('Alice');
    expect(html).toContain('0600000000');
  });

  it('sendAdminCancellationNotification includes the client\'s cancellation reason when given', async () => {
    await service.sendAdminCancellationNotification({ ...baseInput, cancellationReason: 'Empêchement de dernière minute' });
    const html = sendMail.mock.calls[0][0].html;
    expect(html).toContain('Empêchement de dernière minute');
  });

  it('always sends a plain-text alternative alongside the HTML (avoids an HTML-only spam signal)', async () => {
    await service.sendBookingReceived(baseInput);
    const { html, text } = sendMail.mock.calls[0][0];
    expect(text).toBeTruthy();
    expect(text).not.toMatch(/<[a-z][\s\S]*>/i); // no leftover HTML tags
    expect(text).toContain('Alice');
    expect(text).toContain('Coupe Femme');
    expect(html).toContain('<table');
  });
});
