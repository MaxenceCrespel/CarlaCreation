import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from '../../database/entities/service.entity';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(@InjectRepository(Service) private readonly serviceRepo: Repository<Service>) {}

  findAllActive(): Promise<Service[]> {
    return this.serviceRepo.find({ where: { active: true }, order: { category: 'ASC', id: 'ASC' } });
  }

  findAllForAdmin(): Promise<Service[]> {
    return this.serviceRepo.find({ order: { category: 'ASC', id: 'ASC' } });
  }

  findOneActiveById(id: number): Promise<Service | null> {
    return this.serviceRepo.findOne({ where: { id, active: true } });
  }

  async create(dto: CreateServiceDto): Promise<Service> {
    const service = this.serviceRepo.create({
      name: dto.name,
      description: dto.description,
      category: dto.category,
      duration_minutes: dto.durationMinutes,
      price_cents: dto.priceCents,
      active: true,
    });
    return this.serviceRepo.save(service);
  }

  async update(id: number, dto: UpdateServiceDto): Promise<Service> {
    const existing = await this.serviceRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Prestation introuvable.');
    }

    existing.name = dto.name ?? existing.name;
    existing.description = dto.description ?? existing.description;
    existing.category = dto.category ?? existing.category;
    existing.duration_minutes = dto.durationMinutes ?? existing.duration_minutes;
    existing.price_cents = dto.priceCents ?? existing.price_cents;
    existing.active = dto.active === undefined ? existing.active : dto.active;

    return this.serviceRepo.save(existing);
  }

  async remove(id: number): Promise<void> {
    const result = await this.serviceRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Prestation introuvable.');
    }
  }
}
