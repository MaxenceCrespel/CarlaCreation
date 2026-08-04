import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Invoice } from '../../database/entities/invoice.entity';
import { InvoiceItem } from '../../database/entities/invoice-item.entity';
import { Reservation } from '../../database/entities/reservation.entity';
import { Service } from '../../database/entities/service.entity';
import { ReservationAddon } from '../../database/entities/reservation-addon.entity';
import { CreateInvoiceDto, UpdateInvoiceStatusDto } from './dto/invoice.dto';

function computeTotalCents(items: { quantity: number; unitPriceCents: number }[]): number {
  return items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitPriceCents), 0);
}

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Reservation) private readonly reservationRepo: Repository<Reservation>,
    @InjectRepository(Service) private readonly serviceRepo: Repository<Service>,
    @InjectRepository(ReservationAddon) private readonly reservationAddonRepo: Repository<ReservationAddon>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(): Promise<Invoice[]> {
    return this.invoiceRepo.find({ relations: { items: true }, order: { created_at: 'DESC' } });
  }

  async findOne(id: number): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({ where: { id }, relations: { items: true } });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    return invoice;
  }

  // Pre-fills client info + a single line item from a reservation, for the
  // "créer une facture depuis ce rdv" flow — the admin can still edit
  // everything before it's actually created. Not itself a persisted call.
  async draftFromReservation(reservationId: number): Promise<{ clientName: string; clientEmail: string; clientPhone: string; clientAddress: string; items: { description: string; quantity: number; unitPriceCents: number }[] }> {
    const reservation = await this.reservationRepo.findOne({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException('Réservation introuvable.');

    const items: { description: string; quantity: number; unitPriceCents: number }[] = [];
    const service = await this.serviceRepo.findOne({ where: { id: reservation.service_id } });
    if (service) {
      items.push({ description: service.name, quantity: 1, unitPriceCents: service.price_cents });
    }
    const addons = await this.reservationAddonRepo.find({ where: { reservation_id: reservation.id } });
    for (const addon of addons) {
      items.push({ description: addon.name, quantity: 1, unitPriceCents: addon.extra_price_cents });
    }
    if (reservation.travel_fee_cents) {
      items.push({ description: 'Frais de déplacement', quantity: 1, unitPriceCents: reservation.travel_fee_cents });
    }

    return {
      clientName: reservation.client_name,
      clientEmail: reservation.client_email,
      clientPhone: reservation.client_phone,
      clientAddress: reservation.client_address ?? '',
      items,
    };
  }

  async create(dto: CreateInvoiceDto): Promise<Invoice> {
    return this.dataSource.transaction(async (manager) => {
      const totalCents = computeTotalCents(dto.items);

      let invoice = manager.create(Invoice, {
        number: '',
        reservation_id: dto.reservationId ?? null,
        client_name: dto.clientName.trim(),
        client_email: dto.clientEmail?.trim() ?? '',
        client_phone: dto.clientPhone?.trim() ?? '',
        client_address: dto.clientAddress?.trim() ?? '',
        issue_date: dto.issueDate ?? new Date().toISOString().slice(0, 10),
        status: 'unpaid',
        total_cents: totalCents,
        notes: dto.notes?.trim() ?? '',
      });
      invoice = await manager.save(invoice);

      invoice.number = `F-${invoice.id.toString().padStart(6, '0')}`;
      invoice = await manager.save(invoice);

      const items = dto.items.map((item, index) =>
        manager.create(InvoiceItem, {
          invoice_id: invoice.id,
          description: item.description.trim(),
          quantity: item.quantity,
          unit_price_cents: item.unitPriceCents,
          sort_order: index,
        }),
      );
      invoice.items = await manager.save(items);

      return invoice;
    });
  }

  async updateStatus(id: number, dto: UpdateInvoiceStatusDto): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({ where: { id }, relations: { items: true } });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    invoice.status = dto.status;
    invoice.payment_method = dto.status === 'paid' ? (dto.paymentMethod?.trim() || invoice.payment_method) : null;
    invoice.paid_at = dto.status === 'paid' ? new Date() : null;
    return this.invoiceRepo.save(invoice);
  }

  async remove(id: number): Promise<void> {
    const result = await this.invoiceRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Facture introuvable.');
  }
}
