import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/admin-auth.guard';
import { CsrfGuard } from '../../common/csrf';
import { ContactService } from './contact.service';
import { UpdateContactMessageDto } from './dto/contact.dto';

@UseGuards(AdminAuthGuard)
@Controller('api/admin/contact-messages')
export class AdminContactController {
  constructor(private readonly contactService: ContactService) {}

  @Get()
  findAll() {
    return this.contactService.findAll();
  }

  @UseGuards(CsrfGuard)
  @Patch(':id')
  updateRead(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateContactMessageDto) {
    return this.contactService.setRead(id, dto.isRead);
  }

  @UseGuards(CsrfGuard)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.contactService.remove(id);
    return { success: true };
  }
}
