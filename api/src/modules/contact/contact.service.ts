import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactMessage } from '../../database/entities/contact-message.entity';
import { CreateContactDto } from './dto/contact.dto';

@Injectable()
export class ContactService {
  constructor(@InjectRepository(ContactMessage) private readonly contactRepo: Repository<ContactMessage>) {}

  async create(dto: CreateContactDto): Promise<void> {
    const message = this.contactRepo.create({ name: dto.name, email: dto.email, message: dto.message });
    await this.contactRepo.save(message);
  }
}
