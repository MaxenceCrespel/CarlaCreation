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

describe('SettingsService — travel fee', () => {
  let service: SettingsService;
  let dataSource: { getRepository: jest.Mock; createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    dataSource = { getRepository: jest.fn(), createQueryBuilder: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SettingsService, { provide: getDataSourceToken(), useValue: dataSource }],
    }).compile();

    service = module.get(SettingsService);
  });

  it('getTravelFeeBaseCents returns the stored value', async () => {
    dataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue({ id: 1, travel_fee_base_cents: 350 }) });
    await expect(service.getTravelFeeBaseCents()).resolves.toBe(350);
  });

  it('getTravelFeeBaseCents falls back to a default if the settings row is somehow missing', async () => {
    dataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(service.getTravelFeeBaseCents()).resolves.toBe(200);
  });

  it('setTravelFeeBaseCents rejects a negative value', async () => {
    await expect(service.setTravelFeeBaseCents(-5)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setTravelFeeBaseCents rejects a non-integer value', async () => {
    await expect(service.setTravelFeeBaseCents(12.5)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setTravelFeeBaseCents rejects an unreasonably large value', async () => {
    await expect(service.setTravelFeeBaseCents(50000)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setTravelFeeBaseCents upserts a valid value', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const orUpdate = jest.fn().mockReturnValue({ execute });
    const values = jest.fn().mockReturnValue({ orUpdate });
    const into = jest.fn().mockReturnValue({ values });
    const insert = jest.fn().mockReturnValue({ into });
    dataSource.createQueryBuilder.mockReturnValue({ insert });

    await service.setTravelFeeBaseCents(350);

    expect(values).toHaveBeenCalledWith({ id: 1, travel_fee_base_cents: 350 });
    expect(orUpdate).toHaveBeenCalledWith(['travel_fee_base_cents'], ['id']);
    expect(execute).toHaveBeenCalled();
  });
});

describe('SettingsService — travel fee per km', () => {
  let service: SettingsService;
  let dataSource: { getRepository: jest.Mock; createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    dataSource = { getRepository: jest.fn(), createQueryBuilder: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SettingsService, { provide: getDataSourceToken(), useValue: dataSource }],
    }).compile();

    service = module.get(SettingsService);
  });

  it('getTravelFeePerKmCents returns the stored value', async () => {
    dataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue({ id: 1, travel_fee_per_km_cents: 75 }) });
    await expect(service.getTravelFeePerKmCents()).resolves.toBe(75);
  });

  it('getTravelFeePerKmCents falls back to a default if the settings row is somehow missing', async () => {
    dataSource.getRepository.mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(service.getTravelFeePerKmCents()).resolves.toBe(50);
  });

  it('setTravelFeePerKmCents rejects a negative value', async () => {
    await expect(service.setTravelFeePerKmCents(-5)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setTravelFeePerKmCents rejects an unreasonably large value', async () => {
    await expect(service.setTravelFeePerKmCents(50000)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setTravelFeePerKmCents upserts a valid value', async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const orUpdate = jest.fn().mockReturnValue({ execute });
    const values = jest.fn().mockReturnValue({ orUpdate });
    const into = jest.fn().mockReturnValue({ values });
    const insert = jest.fn().mockReturnValue({ into });
    dataSource.createQueryBuilder.mockReturnValue({ insert });

    await service.setTravelFeePerKmCents(75);

    expect(values).toHaveBeenCalledWith({ id: 1, travel_fee_per_km_cents: 75 });
    expect(orUpdate).toHaveBeenCalledWith(['travel_fee_per_km_cents'], ['id']);
    expect(execute).toHaveBeenCalled();
  });
});
