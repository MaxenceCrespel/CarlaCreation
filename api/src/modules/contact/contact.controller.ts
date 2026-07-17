import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CsrfGuard } from '../../common/csrf';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/contact.dto';

@Controller('api/contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @UseGuards(CsrfGuard)
  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateContactDto) {
    await this.contactService.create(dto);
    return { success: true };
  }
}
