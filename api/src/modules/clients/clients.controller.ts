import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/admin-auth.guard';
import { CsrfGuard } from '../../common/csrf';
import { ClientsService } from './clients.service';
import { CreateAndLinkClientDto, CreateClientDto, LinkClientDto, UnlinkClientDto, UpdateClientDto } from './dto/client.dto';

@UseGuards(AdminAuthGuard)
@Controller('api/admin/clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  findAll(@Query('q') q?: string) {
    return this.clientsService.findAll(q);
  }

  @Get('match')
  matchCandidates(@Query('name') name: string) {
    return this.clientsService.matchCandidates(name ?? '');
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.findOne(id);
  }

  @UseGuards(CsrfGuard)
  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @UseGuards(CsrfGuard)
  @Post('create-and-link')
  createAndLink(@Body() dto: CreateAndLinkClientDto) {
    return this.clientsService.createAndLink(dto);
  }

  @UseGuards(CsrfGuard)
  @Post('link')
  async link(@Body() dto: LinkClientDto) {
    await this.clientsService.link(dto.reservationId, dto.clientId);
    return { success: true };
  }

  @UseGuards(CsrfGuard)
  @Post('unlink')
  async unlink(@Body() dto: UnlinkClientDto) {
    await this.clientsService.unlink(dto.reservationId);
    return { success: true };
  }

  @UseGuards(CsrfGuard)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(id, dto);
  }

  @UseGuards(CsrfGuard)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.clientsService.remove(id);
    return { success: true };
  }
}
