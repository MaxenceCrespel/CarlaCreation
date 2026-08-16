import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { Invoice } from '../../database/entities/invoice.entity';
import { InvoiceItem } from '../../database/entities/invoice-item.entity';
import { Reservation } from '../../database/entities/reservation.entity';
import { Service } from '../../database/entities/service.entity';
import { ReservationAddon } from '../../database/entities/reservation-addon.entity';
import { Promotion } from '../../database/entities/promotion.entity';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let invoiceRepo: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock; delete: jest.Mock };
  let reservationRepo: { findOne: jest.Mock };
  let serviceRepo: { findOne: jest.Mock };
  let addonRepo: { find: jest.Mock };
  let promotionRepo: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    invoiceRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn((v) => Promise.resolve(v)), delete: jest.fn() };
    reservationRepo = { findOne: jest.fn() };
    serviceRepo = { findOne: jest.fn() };
    addonRepo = { find: jest.fn() };
    promotionRepo = { findOne: jest.fn() };
    dataSource = {
      transaction: jest.fn(async (fn) => {
        const manager = {
          create: (entity: any, data: any) => (Array.isArray(data) ? data.map((d) => ({ ...d })) : { ...data }),
          save: jest.fn(async (data: any) => {
            if (Array.isArray(data)) return data.map((d, i) => ({ id: i + 1, ...d }));
            return { id: data.id ?? 1, ...data };
          }),
        };
        return fn(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: getRepositoryToken(Invoice), useValue: invoiceRepo },
        { provide: getRepositoryToken(Reservation), useValue: reservationRepo },
        { provide: getRepositoryToken(Service), useValue: serviceRepo },
        { provide: getRepositoryToken(ReservationAddon), useValue: addonRepo },
        { provide: getRepositoryToken(Promotion), useValue: promotionRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(InvoicesService);
  });

  it('findAll orders invoices by most recent first', async () => {
    invoiceRepo.find.mockResolvedValue([]);
    await service.findAll();
    expect(invoiceRepo.find).toHaveBeenCalledWith({ relations: { items: true }, order: { created_at: 'DESC' } });
  });

  it('findOne throws NotFoundException for a missing invoice', async () => {
    invoiceRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('draftFromReservation throws NotFoundException for a missing reservation', async () => {
    reservationRepo.findOne.mockResolvedValue(null);
    await expect(service.draftFromReservation(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('draftFromReservation builds line items from the service, addons and travel fee', async () => {
    reservationRepo.findOne.mockResolvedValue({
      id: 5,
      client_name: 'Julie Martin',
      client_email: 'julie@example.com',
      client_phone: '0600000000',
      client_address: null,
      service_id: 1,
      travel_fee_cents: 200,
    });
    serviceRepo.findOne.mockResolvedValue({ name: 'Manucure Classique', price_cents: 3500 });
    addonRepo.find.mockResolvedValue([{ name: 'Nail art', extra_price_cents: 500 }]);

    const draft = await service.draftFromReservation(5);

    expect(draft.clientName).toBe('Julie Martin');
    expect(draft.items).toEqual([
      { description: 'Manucure Classique', quantity: 1, unitPriceCents: 3500 },
      { description: 'Nail art', quantity: 1, unitPriceCents: 500 },
      { description: 'Frais de déplacement', quantity: 1, unitPriceCents: 200 },
    ]);
  });

  it('draftFromReservation adds a negative discount line labelled with the promotion, computed on the service+addons subtotal only', async () => {
    reservationRepo.findOne.mockResolvedValue({
      id: 5,
      client_name: 'Julie Martin',
      client_email: 'julie@example.com',
      client_phone: '0600000000',
      client_address: null,
      service_id: 1,
      travel_fee_cents: 200,
      promotion_id: 3,
      discount_percent: 10,
    });
    serviceRepo.findOne.mockResolvedValue({ name: 'Manucure Classique', price_cents: 3500 });
    addonRepo.find.mockResolvedValue([{ name: 'Nail art', extra_price_cents: 500 }]);
    promotionRepo.findOne.mockResolvedValue({ id: 3, label: 'Tarif étudiant' });

    const draft = await service.draftFromReservation(5);

    // (3500 + 500) * 10% = 400, travel fee untouched
    expect(draft.items).toEqual([
      { description: 'Manucure Classique', quantity: 1, unitPriceCents: 3500 },
      { description: 'Nail art', quantity: 1, unitPriceCents: 500 },
      { description: 'Réduction (Tarif étudiant, -10%)', quantity: 1, unitPriceCents: -400 },
      { description: 'Frais de déplacement', quantity: 1, unitPriceCents: 200 },
    ]);
  });

  it('create computes the total, assigns a sequential number and persists items', async () => {
    const invoice = await service.create({
      clientName: 'Julie Martin',
      items: [
        { description: 'Manucure Classique', quantity: 1, unitPriceCents: 3500 },
        { description: 'Nail art', quantity: 2, unitPriceCents: 500 },
      ],
    } as any);

    expect(invoice.number).toBe('F-000001');
    expect(invoice.total_cents).toBe(4500);
    expect(invoice.items).toHaveLength(2);
  });

  it('updateStatus marks an invoice paid with a payment method and paid_at', async () => {
    invoiceRepo.findOne.mockResolvedValue({ id: 1, status: 'unpaid', payment_method: null, paid_at: null });
    const updated = await service.updateStatus(1, { status: 'paid', paymentMethod: 'Espèces' } as any);
    expect(updated.status).toBe('paid');
    expect(updated.payment_method).toBe('Espèces');
    expect(updated.paid_at).toBeInstanceOf(Date);
  });

  it('updateStatus clears payment info when reverted to unpaid', async () => {
    invoiceRepo.findOne.mockResolvedValue({ id: 1, status: 'paid', payment_method: 'Espèces', paid_at: new Date() });
    const updated = await service.updateStatus(1, { status: 'unpaid' } as any);
    expect(updated.status).toBe('unpaid');
    expect(updated.payment_method).toBeNull();
    expect(updated.paid_at).toBeNull();
  });

  it('updateStatus throws NotFoundException for a missing invoice', async () => {
    invoiceRepo.findOne.mockResolvedValue(null);
    await expect(service.updateStatus(999, { status: 'paid' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove throws NotFoundException when nothing was deleted', async () => {
    invoiceRepo.delete.mockResolvedValue({ affected: 0 });
    await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove succeeds silently when a row was deleted', async () => {
    invoiceRepo.delete.mockResolvedValue({ affected: 1 });
    await expect(service.remove(1)).resolves.toBeUndefined();
  });
});
