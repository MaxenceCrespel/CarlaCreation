import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactMessage } from '../../database/entities/contact-message.entity';
import { CreateContactDto } from './dto/contact.dto';
import { PushService } from '../push/push.service';

@Injectable()
export class ContactService {
  constructor(
    @InjectRepository(ContactMessage) private readonly contactRepo: Repository<ContactMessage>,
    private readonly pushService: PushService,
  ) {}

  async create(dto: CreateContactDto): Promise<void> {
    const message = this.contactRepo.create({ name: dto.name, phone: dto.phone, message: dto.message });
    await this.contactRepo.save(message);

    await this.pushService.notifyAdmins({
      title: 'Nouveau message de contact',
      body: `${dto.name} — ${dto.message.slice(0, 80)}`,
      url: '/admin',
    });
  }

  findAll(): Promise<ContactMessage[]> {
    return this.contactRepo.find({ order: { created_at: 'DESC' } });
  }

  async setRead(id: number, isRead: boolean): Promise<ContactMessage> {
    const item = await this.contactRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Message introuvable.');

    item.is_read = isRead;
    return this.contactRepo.save(item);
  }

  async remove(id: number): Promise<void> {
    const result = await this.contactRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Message introuvable.');
  }
}
