import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceCategory } from '../../database/entities/service-category.entity';
import { Service } from '../../database/entities/service.entity';
import { CreateServiceCategoryDto, UpdateServiceCategoryDto } from './dto/service-category.dto';

@Injectable()
export class ServiceCategoriesService {
  constructor(
    @InjectRepository(ServiceCategory) private readonly categoryRepo: Repository<ServiceCategory>,
    @InjectRepository(Service) private readonly serviceRepo: Repository<Service>,
  ) {}

  findAll(): Promise<ServiceCategory[]> {
    return this.categoryRepo.find({ order: { parent_id: 'ASC', sort_order: 'ASC', id: 'ASC' } });
  }

  // Only one level of nesting is supported (a subcategory can't itself have
  // subcategories), so a category being used as a parent must be top-level
  // itself, and a category that already has children can't become a
  // subcategory of another one.
  private async assertValidParent(parentId: number | null | undefined, excludeId?: number): Promise<void> {
    if (parentId === null || parentId === undefined) return;
    if (parentId === excludeId) {
      throw new BadRequestException('Une catégorie ne peut pas être sa propre catégorie parente.');
    }
    const parent = await this.categoryRepo.findOne({ where: { id: parentId } });
    if (!parent) {
      throw new NotFoundException('Catégorie parente introuvable.');
    }
    if (parent.parent_id !== null) {
      throw new BadRequestException('Une sous-catégorie ne peut pas elle-même contenir de sous-catégories.');
    }
    if (excludeId !== undefined) {
      const childCount = await this.categoryRepo.count({ where: { parent_id: excludeId } });
      if (childCount > 0) {
        throw new BadRequestException('Cette catégorie contient des sous-catégories, elle ne peut pas devenir elle-même une sous-catégorie.');
      }
    }
  }

  async create(dto: CreateServiceCategoryDto): Promise<ServiceCategory> {
    await this.assertValidParent(dto.parentId);
    const parentId = dto.parentId ?? null;
    const raw = await this.categoryRepo
      .createQueryBuilder('c')
      .select('MAX(c.sort_order)', 'max')
      .where(parentId === null ? 'c.parent_id IS NULL' : 'c.parent_id = :parentId', { parentId })
      .getRawOne<{ max: number | null }>();
    const category = this.categoryRepo.create({ name: dto.name, sort_order: (raw?.max ?? -1) + 1, parent_id: parentId });
    return this.categoryRepo.save(category);
  }

  async update(id: number, dto: UpdateServiceCategoryDto): Promise<ServiceCategory> {
    const existing = await this.categoryRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Catégorie introuvable.');
    }
    if (dto.parentId !== undefined) {
      await this.assertValidParent(dto.parentId, id);
      existing.parent_id = dto.parentId;
    }
    existing.name = dto.name ?? existing.name;
    existing.sort_order = dto.sortOrder ?? existing.sort_order;
    return this.categoryRepo.save(existing);
  }

  async remove(id: number): Promise<void> {
    const existing = await this.categoryRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Catégorie introuvable.');
    }
    const childCount = await this.categoryRepo.count({ where: { parent_id: id } });
    if (childCount > 0) {
      throw new ConflictException('Cette catégorie contient encore des sous-catégories — supprimez-les ou déplacez-les avant.');
    }
    const servicesCount = await this.serviceRepo.count({ where: { category_id: id } });
    if (servicesCount > 0) {
      throw new ConflictException('Cette catégorie contient encore des prestations — déplacez-les avant de la supprimer.');
    }
    await this.categoryRepo.delete(id);
  }
}
