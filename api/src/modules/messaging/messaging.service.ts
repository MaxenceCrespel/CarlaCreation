import * as path from 'path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Client } from '../../database/entities/client.entity';
import { ClientMessage, MessageSender } from '../../database/entities/client-message.entity';
import { MailService } from '../mail/mail.service';
import { PushService } from '../push/push.service';
import { MESSAGE_PHOTO_DIR, removePhotoFile } from './message-photos';


// No email/notification storm when several messages are sent in a row: the
// other party is only emailed again once they've read the previous message
// or this long has passed.
const NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;

export interface MessageView {
  id: number;
  sender: MessageSender;
  body: string;
  hasPhoto: boolean;
  readAt: Date | null;
  createdAt: Date;
  reservation: { id: number; date: string; startTime: string; serviceName: string } | null;
}

interface MessageRow {
  id: number;
  sender: MessageSender;
  body: string;
  has_photo: boolean;
  read_at: Date | null;
  created_at: Date;
  reservation_id: number | null;
  reservation_date: string | null;
  start_time: string | null;
  service_name: string | null;
}

function excerpt(body: string, hasPhoto: boolean): string {
  const text = body.trim();
  if (!text) return hasPhoto ? 'Photo' : '';
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

// Conversation between a client account and the salon: the client writes
// from « Mon compte », Carla answers from the admin. Each new message
// notifies the other side (push for the admin, email for the client).
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    @InjectRepository(ClientMessage) private readonly messageRepo: Repository<ClientMessage>,
    @InjectRepository(Client) private readonly clientRepo: Repository<Client>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly pushService: PushService,
    private readonly mailService: MailService,
  ) {}

  async listMessages(clientId: number): Promise<MessageView[]> {
    const rows: MessageRow[] = await this.dataSource.query(
      `SELECT m.id, m.sender, m.body, (m.photo IS NOT NULL) AS has_photo, m.read_at, m.created_at,
              m.reservation_id, r.reservation_date, r.start_time, s.name AS service_name
       FROM client_messages m
       LEFT JOIN reservations r ON r.id = m.reservation_id
       LEFT JOIN services s ON s.id = r.service_id
       WHERE m.client_id = $1
       ORDER BY m.created_at ASC, m.id ASC`,
      [clientId],
    );
    return rows.map((r) => ({
      id: r.id,
      sender: r.sender,
      body: r.body,
      hasPhoto: Boolean(r.has_photo),
      readAt: r.read_at,
      createdAt: r.created_at,
      reservation:
        r.reservation_id && r.reservation_date
          ? { id: r.reservation_id, date: r.reservation_date, startTime: r.start_time ?? '', serviceName: r.service_name ?? '' }
          : null,
    }));
  }

  // `reader` opens the thread: everything the *other* side sent becomes read.
  async markRead(clientId: number, reader: MessageSender): Promise<void> {
    await this.messageRepo.update(
      { client_id: clientId, sender: reader === 'client' ? 'admin' : 'client', read_at: IsNull() },
      { read_at: new Date() },
    );
  }

  async unreadForClient(clientId: number): Promise<number> {
    return this.messageRepo.count({ where: { client_id: clientId, sender: 'admin', read_at: IsNull() } });
  }

  async sendFromClient(clientId: number, body: string | undefined, photo: string | null, reservationId?: number): Promise<MessageView> {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) {
      removePhotoFile(photo);
      throw new NotFoundException('Compte introuvable.');
    }
    if (reservationId) {
      const [owned] = await this.dataSource.query(`SELECT id FROM reservations WHERE id = $1 AND client_id = $2`, [reservationId, clientId]);
      if (!owned) reservationId = undefined;
    }
    const saved = await this.save(clientId, 'client', body, photo, reservationId);

    if (await this.shouldNotify(clientId, 'client', saved.id)) {
      const preview = excerpt(saved.body, Boolean(photo));
      await this.pushService.notifyAdmins({ title: `Message de ${client.name}`, body: preview, url: `/admin#/plus/messages/${clientId}` });
      await this.mailService.sendAdminNewClientMessage({ clientName: client.name, preview, clientId });
    }
    return this.view(clientId, saved.id);
  }

  async sendFromAdmin(clientId: number, body: string | undefined, photo: string | null): Promise<MessageView> {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) {
      removePhotoFile(photo);
      throw new NotFoundException('Fiche cliente introuvable.');
    }
    if (!client.password_hash || !client.email) {
      removePhotoFile(photo);
      throw new BadRequestException("Cette cliente n'a pas de compte en ligne : elle ne pourrait pas lire le message.");
    }
    const saved = await this.save(clientId, 'admin', body, photo);

    if (await this.shouldNotify(clientId, 'admin', saved.id)) {
      await this.mailService.sendClientNewMessage({
        clientName: client.first_name || client.name,
        clientEmail: client.email,
        preview: excerpt(saved.body, Boolean(photo)),
      });
    }
    return this.view(clientId, saved.id);
  }

  // One row per client who has at least one message, newest activity first.
  async listConversations() {
    const rows: {
      client_id: number;
      name: string;
      has_account: boolean;
      body: string;
      has_photo: boolean;
      sender: MessageSender;
      created_at: Date;
      unread: number;
    }[] = await this.dataSource.query(
      `SELECT c.id AS client_id, c.name, (c.password_hash IS NOT NULL) AS has_account,
              last.body, (last.photo IS NOT NULL) AS has_photo, last.sender, last.created_at,
              (SELECT COUNT(*) FROM client_messages u WHERE u.client_id = c.id AND u.sender = 'client' AND u.read_at IS NULL)::int AS unread
       FROM clients c
       JOIN LATERAL (
         SELECT m.body, m.photo, m.sender, m.created_at FROM client_messages m
         WHERE m.client_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
       ) last ON true
       ORDER BY last.created_at DESC`,
    );
    return rows.map((r) => ({
      clientId: r.client_id,
      name: r.name,
      hasAccount: Boolean(r.has_account),
      lastMessage: excerpt(r.body, Boolean(r.has_photo)),
      lastSender: r.sender,
      lastAt: r.created_at,
      unread: Number(r.unread),
    }));
  }

  async getConversation(clientId: number) {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Fiche cliente introuvable.');
    return {
      client: { id: client.id, name: client.name, phone: client.phone, email: client.email, hasAccount: Boolean(client.password_hash) },
      messages: await this.listMessages(clientId),
    };
  }

  async removeMessage(id: number): Promise<void> {
    const message = await this.messageRepo.findOne({ where: { id } });
    if (!message) throw new NotFoundException('Message introuvable.');
    await this.messageRepo.delete({ id });
    removePhotoFile(message.photo);
  }

  // Absolute path of a message photo, after checking who's asking: a client
  // may only open photos of her own conversation (clientId), the admin any.
  async photoPath(messageId: number, clientId?: number): Promise<string> {
    const message = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!message || !message.photo || (clientId !== undefined && message.client_id !== clientId)) {
      throw new NotFoundException('Photo introuvable.');
    }
    return path.join(MESSAGE_PHOTO_DIR, path.basename(message.photo));
  }

  private async save(clientId: number, sender: MessageSender, body: string | undefined, photo: string | null, reservationId?: number) {
    const text = (body ?? '').trim();
    if (!text && !photo) throw new BadRequestException('Écrivez un message ou ajoutez une photo.');
    return this.messageRepo.save(
      this.messageRepo.create({ client_id: clientId, sender, body: text, photo, reservation_id: reservationId ?? null }),
    );
  }

  // Notify only if the previous message from the same sender has been read
  // or is older than the cooldown — see NOTIFY_COOLDOWN_MS.
  private async shouldNotify(clientId: number, sender: MessageSender, newId: number): Promise<boolean> {
    try {
      const [previous]: { read_at: Date | null; created_at: Date }[] = await this.dataSource.query(
        `SELECT read_at, created_at FROM client_messages
         WHERE client_id = $1 AND sender = $2 AND id <> $3
         ORDER BY created_at DESC, id DESC LIMIT 1`,
        [clientId, sender, newId],
      );
      if (!previous) return true;
      return previous.read_at !== null || Date.now() - new Date(previous.created_at).getTime() > NOTIFY_COOLDOWN_MS;
    } catch (err) {
      this.logger.warn(`Notification check failed for client ${clientId}: ${(err as Error).message}`);
      return true;
    }
  }

  private async view(clientId: number, messageId: number): Promise<MessageView> {
    const all = await this.listMessages(clientId);
    const found = all.find((m) => m.id === messageId);
    if (!found) throw new NotFoundException('Message introuvable.');
    return found;
  }
}
