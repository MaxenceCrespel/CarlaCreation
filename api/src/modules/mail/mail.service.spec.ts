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
});
