import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';

describe('SettingsService — travel buffer', () => {
  let service: SettingsService;
  let dataSource: { getRepository: jest.Mock; createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    dataSource = { getRepository: jest.fn(), createQueryBuilder: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SettingsService, { provide: getDataSourceToken(), useValue: dataSource }],
    }).compile();

    service = module.get(SettingsService);
  });

  it('getTravelBufferMinutes returns the stored value', async () => {
    dataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue({ id: 1, travel_buffer_minutes: 45 }) });
    await expect(service.getTravelBufferMinutes()).resolves.toBe(45);
  });

  it('getTravelBufferMinutes falls back to a default if the settings row is somehow missing', async () => {
    dataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(service.getTravelBufferMinutes()).resolves.toBe(30);
  });

  it('setTravelBufferMinutes rejects a negative value', async () => {
    await expect(service.setTravelBufferMinutes(-5)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setTravelBufferMinutes rejects a non-integer value', async () => {
    await expect(service.setTravelBufferMinutes(12.5)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setTravelBufferMinutes rejects an unreasonably large value', async () => {
    await expect(service.setTravelBufferMinutes(500)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setTravelBufferMinutes upserts a valid value', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const orUpdate = jest.fn().mockReturnValue({ execute });
    const values = jest.fn().mockReturnValue({ orUpdate });
    const into = jest.fn().mockReturnValue({ values });
    const insert = jest.fn().mockReturnValue({ into });
    dataSource.createQueryBuilder.mockReturnValue({ insert });

    await service.setTravelBufferMinutes(45);

    expect(values).toHaveBeenCalledWith({ id: 1, travel_buffer_minutes: 45 });
    expect(orUpdate).toHaveBeenCalledWith(['travel_buffer_minutes'], ['id']);
    expect(execute).toHaveBeenCalled();
  });
});

describe('SettingsService — travel fee fallback', () => {
  let service: SettingsService;
  let dataSource: { getRepository: jest.Mock; createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    dataSource = { getRepository: jest.fn(), createQueryBuilder: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SettingsService, { provide: getDataSourceToken(), useValue: dataSource }],
    }).compile();

    service = module.get(SettingsService);
  });

  it('getTravelFeeFallbackCents returns the stored value', async () => {
    dataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue({ id: 1, travel_fee_fallback_cents: 350 }) });
    await expect(service.getTravelFeeFallbackCents()).resolves.toBe(350);
  });

  it('getTravelFeeFallbackCents falls back to a default if the settings row is somehow missing', async () => {
    dataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(service.getTravelFeeFallbackCents()).resolves.toBe(200);
  });

  it('setTravelFeeFallbackCents rejects a negative value', async () => {
    await expect(service.setTravelFeeFallbackCents(-5)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setTravelFeeFallbackCents rejects a non-integer value', async () => {
    await expect(service.setTravelFeeFallbackCents(12.5)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setTravelFeeFallbackCents rejects an unreasonably large value', async () => {
    await expect(service.setTravelFeeFallbackCents(50000)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setTravelFeeFallbackCents upserts a valid value', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const orUpdate = jest.fn().mockReturnValue({ execute });
    const values = jest.fn().mockReturnValue({ orUpdate });
    const into = jest.fn().mockReturnValue({ values });
    const insert = jest.fn().mockReturnValue({ into });
    dataSource.createQueryBuilder.mockReturnValue({ insert });

    await service.setTravelFeeFallbackCents(350);

    expect(values).toHaveBeenCalledWith({ id: 1, travel_fee_fallback_cents: 350 });
    expect(orUpdate).toHaveBeenCalledWith(['travel_fee_fallback_cents'], ['id']);
    expect(execute).toHaveBeenCalled();
  });
});

describe('SettingsService — travel fee tiers', () => {
  let service: SettingsService;
  let dataSource: { getRepository: jest.Mock; transaction: jest.Mock };

  beforeEach(async () => {
    dataSource = { getRepository: jest.fn(), transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SettingsService, { provide: getDataSourceToken(), useValue: dataSource }],
    }).compile();

    service = module.get(SettingsService);
  });

  it('getTravelFeeTiers returns the stored rows sorted ascending, mapped to camelCase', async () => {
    dataSource.getRepository.mockReturnValue({
      find: jest.fn().mockResolvedValue([
        { id: 1, min_km: 0, fee_cents: 0 },
        { id: 2, min_km: 10, fee_cents: 200 },
      ]),
    });
    await expect(service.getTravelFeeTiers()).resolves.toEqual([
      { minKm: 0, feeCents: 0 },
      { minKm: 10, feeCents: 200 },
    ]);
  });

  it('getTravelFeeTiers falls back to the default schedule if the table is somehow empty', async () => {
    dataSource.getRepository.mockReturnValue({ find: jest.fn().mockResolvedValue([]) });
    await expect(service.getTravelFeeTiers()).resolves.toEqual([
      { minKm: 0, feeCents: 0 },
      { minKm: 10, feeCents: 200 },
    ]);
  });

  it('setTravelFeeTiers rejects a schedule with no 0km tier', async () => {
    await expect(service.setTravelFeeTiers([{ minKm: 5, feeCents: 100 }])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setTravelFeeTiers rejects duplicate thresholds', async () => {
    await expect(
      service.setTravelFeeTiers([
        { minKm: 0, feeCents: 0 },
        { minKm: 10, feeCents: 200 },
        { minKm: 10, feeCents: 300 },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setTravelFeeTiers replaces the whole schedule transactionally', async () => {
    const deleteExecute = jest.fn().mockResolvedValue(undefined);
    const deleteFrom = jest.fn().mockReturnValue({ execute: deleteExecute });
    const deleteBuilder = jest.fn().mockReturnValue({ from: deleteFrom });
    const manager = { createQueryBuilder: jest.fn().mockReturnValue({ delete: deleteBuilder }), insert: jest.fn() };
    dataSource.transaction.mockImplementation(async (fn) => fn(manager));

    await service.setTravelFeeTiers([
      { minKm: 0, feeCents: 0 },
      { minKm: 15, feeCents: 300 },
    ]);

    // Empty-criteria manager.delete() throws in TypeORM — this must go
    // through a query builder delete instead, which doesn't need a where.
    expect(deleteFrom).toHaveBeenCalledWith(expect.anything());
    expect(deleteExecute).toHaveBeenCalled();
    expect(manager.insert).toHaveBeenCalledWith(expect.anything(), [
      { min_km: 0, fee_cents: 0 },
      { min_km: 15, fee_cents: 300 },
    ]);
  });
});

describe('SettingsService — loyalty & birthday rewards', () => {
  let service: SettingsService;
  let dataSource: { getRepository: jest.Mock; createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    dataSource = { getRepository: jest.fn(), createQueryBuilder: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SettingsService, { provide: getDataSourceToken(), useValue: dataSource }],
    }).compile();

    service = module.get(SettingsService);
  });

  function mockUpsert() {
    const execute = jest.fn().mockResolvedValue(undefined);
    const orUpdate = jest.fn().mockReturnValue({ execute });
    const values = jest.fn().mockReturnValue({ orUpdate });
    const into = jest.fn().mockReturnValue({ values });
    const insert = jest.fn().mockReturnValue({ into });
    dataSource.createQueryBuilder.mockReturnValue({ insert });
    return { values, orUpdate, execute };
  }

  it('getLoyaltyVisitsRequired returns the stored value, defaulting to 5', async () => {
    dataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue({ id: 1, loyalty_visits_required: 8 }) });
    await expect(service.getLoyaltyVisitsRequired()).resolves.toBe(8);

    dataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(service.getLoyaltyVisitsRequired()).resolves.toBe(5);
  });

  it('setLoyaltyVisitsRequired rejects values outside 1-100', async () => {
    await expect(service.setLoyaltyVisitsRequired(0)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setLoyaltyVisitsRequired(101)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setLoyaltyVisitsRequired(3.5)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setLoyaltyVisitsRequired upserts a valid value', async () => {
    const { values, orUpdate } = mockUpsert();
    await service.setLoyaltyVisitsRequired(8);
    expect(values).toHaveBeenCalledWith({ id: 1, loyalty_visits_required: 8 });
    expect(orUpdate).toHaveBeenCalledWith(['loyalty_visits_required'], ['id']);
  });

  it('getLoyaltyDiscountPercent returns the stored value, defaulting to 15', async () => {
    dataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(service.getLoyaltyDiscountPercent()).resolves.toBe(15);
  });

  it('setLoyaltyDiscountPercent rejects values outside 0-100', async () => {
    await expect(service.setLoyaltyDiscountPercent(-1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setLoyaltyDiscountPercent(101)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getBirthdayDiscountPercent returns the stored value, defaulting to 10', async () => {
    dataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(service.getBirthdayDiscountPercent()).resolves.toBe(10);
  });

  it('setBirthdayDiscountPercent rejects values outside 0-100', async () => {
    await expect(service.setBirthdayDiscountPercent(-1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setBirthdayDiscountPercent(101)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setBirthdayDiscountPercent upserts a valid value', async () => {
    const { values, orUpdate } = mockUpsert();
    await service.setBirthdayDiscountPercent(12);
    expect(values).toHaveBeenCalledWith({ id: 1, birthday_discount_percent: 12 });
    expect(orUpdate).toHaveBeenCalledWith(['birthday_discount_percent'], ['id']);
  });
});
