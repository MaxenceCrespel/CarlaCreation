import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Promotion } from '../../database/entities/promotion.entity';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

@Injectable()
export class PromotionsService {
  constructor(@InjectRepository(Promotion) private readonly promotionRepo: Repository<Promotion>) {}

  findAll(): Promise<Promotion[]> {
    return this.promotionRepo.find({ order: { created_at: 'DESC' } });
  }

  // For the public booking page's "tarif spécial" dropdown — only active,
  // non-code promotions are ever offered for direct selection.
  findSelectable(): Promise<Promotion[]> {
    return this.promotionRepo.find({ where: { active: true, requires_code: false }, order: { label: 'ASC' } });
  }

  async findByCode(code: string): Promise<Promotion> {
    const promotion = await this.promotionRepo.findOne({ where: { code: normalizeCode(code), active: true, requires_code: true } });
    if (!promotion) throw new NotFoundException('Code promo invalide ou expiré.');
    return promotion;
  }

  async create(dto: CreatePromotionDto): Promise<Promotion> {
    const requiresCode = dto.requiresCode ?? false;
    if (requiresCode && !dto.code) {
      throw new BadRequestException('Un code est requis pour ce type de promotion.');
    }
    const code = requiresCode ? normalizeCode(dto.code!) : null;
    if (code) {
      const existing = await this.promotionRepo.findOne({ where: { code } });
      if (existing) throw new ConflictException('Ce code promo existe déjà.');
    }

    const promotion = this.promotionRepo.create({
      label: dto.label.trim(),
      discount_percent: dto.discountPercent,
      requires_code: requiresCode,
      code,
      active: true,
    });
    return this.promotionRepo.save(promotion);
  }

  async update(id: number, dto: UpdatePromotionDto): Promise<Promotion> {
    const promotion = await this.promotionRepo.findOne({ where: { id } });
    if (!promotion) throw new NotFoundException('Promotion introuvable.');

    if (dto.label !== undefined) promotion.label = dto.label.trim();
    if (dto.discountPercent !== undefined) promotion.discount_percent = dto.discountPercent;
    if (dto.active !== undefined) promotion.active = dto.active;
    if (dto.code !== undefined && promotion.requires_code) {
      const normalized = normalizeCode(dto.code);
      const existing = await this.promotionRepo.findOne({ where: { code: normalized } });
      if (existing && existing.id !== id) throw new ConflictException('Ce code promo existe déjà.');
      promotion.code = normalized;
    }

    return this.promotionRepo.save(promotion);
  }

  async remove(id: number): Promise<void> {
    const result = await this.promotionRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Promotion introuvable.');
  }
}
