import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Service } from '../../database/entities/service.entity';
import { ServiceAddon } from '../../database/entities/service-addon.entity';
import { CreateServiceDto, ServiceAddonDto, UpdateServiceDto } from './dto/service.dto';

export type ServiceWithAddons = Service & { addons: ServiceAddon[] };

@Injectable()
export class ServicesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Service) private readonly serviceRepo: Repository<Service>,
    @InjectRepository(ServiceAddon) private readonly addonRepo: Repository<ServiceAddon>,
  ) {}

  private async withAddons(services: Service[], opts: { activeOnly: boolean }): Promise<ServiceWithAddons[]> {
    if (services.length === 0) return [];
    const addons = await this.addonRepo.find({
      where: opts.activeOnly ? { active: true } : {},
      order: { id: 'ASC' },
    });
    const byService = new Map<number, ServiceAddon[]>();
    for (const addon of addons) {
      const list = byService.get(addon.service_id) ?? [];
      list.push(addon);
      byService.set(addon.service_id, list);
    }
    return services.map((s) => ({ ...s, addons: byService.get(s.id) ?? [] }));
  }

  async findAllActive(): Promise<ServiceWithAddons[]> {
    const services = await this.serviceRepo.find({ where: { active: true }, order: { category_id: 'ASC', id: 'ASC' } });
    return this.withAddons(services, { activeOnly: true });
  }

  async findAllForAdmin(): Promise<ServiceWithAddons[]> {
    const services = await this.serviceRepo.find({ order: { category_id: 'ASC', id: 'ASC' } });
    return this.withAddons(services, { activeOnly: false });
  }

  findOneActiveById(id: number): Promise<Service | null> {
    return this.serviceRepo.findOne({ where: { id, active: true } });
  }

  // The whole addon list is replaced wholesale on every save, same pattern
  // as daily hours ranges — simpler than diffing, and the list is always
  // short (a handful of supplements per prestation at most).
  private async replaceAddons(manager: EntityManager, serviceId: number, addons: ServiceAddonDto[]): Promise<void> {
    await manager.delete(ServiceAddon, { service_id: serviceId });
    if (addons.length > 0) {
      await manager.insert(
        ServiceAddon,
        addons.map((a) => ({
          service_id: serviceId,
          name: a.name,
          extra_price_cents: a.extraPriceCents,
          extra_duration_minutes: a.extraDurationMinutes,
          active: true,
        })),
      );
    }
  }

  async create(dto: CreateServiceDto): Promise<ServiceWithAddons> {
    return this.dataSource.transaction(async (manager) => {
      const service = manager.create(Service, {
        name: dto.name,
        description: dto.description,
        category_id: dto.categoryId,
        duration_minutes: dto.durationMinutes,
        price_cents: dto.priceCents,
        active: true,
      });
      const saved = await manager.save(service);

      if (dto.addons) {
        await this.replaceAddons(manager, saved.id, dto.addons);
      }

      const addons = dto.addons ? await manager.find(ServiceAddon, { where: { service_id: saved.id } }) : [];
      return { ...saved, addons };
    });
  }

  async update(id: number, dto: UpdateServiceDto): Promise<ServiceWithAddons> {
    const existing = await this.serviceRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Prestation introuvable.');
    }

    existing.name = dto.name ?? existing.name;
    existing.description = dto.description ?? existing.description;
    existing.category_id = dto.categoryId ?? existing.category_id;
    existing.duration_minutes = dto.durationMinutes ?? existing.duration_minutes;
    existing.price_cents = dto.priceCents ?? existing.price_cents;
    existing.active = dto.active === undefined ? existing.active : dto.active;

    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(existing);

      if (dto.addons) {
        await this.replaceAddons(manager, id, dto.addons);
      }

      const addons = await manager.find(ServiceAddon, { where: { service_id: id }, order: { id: 'ASC' } });
      return { ...saved, addons };
    });
  }

  async remove(id: number): Promise<void> {
    const result = await this.serviceRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Prestation introuvable.');
    }
  }
}
