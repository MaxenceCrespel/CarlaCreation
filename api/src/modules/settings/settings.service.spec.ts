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
