import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Promotion } from '../../database/entities/promotion.entity';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

// Avoids visually ambiguous characters (0/O, 1/I) since this ends up typed
// by hand into the booking form's promo-code field.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRandomCode(): string {
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
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

  // clientId = the logged-in client, if any. A personal reward code
  // (client_id set) is only valid for its owner, and only until used.
  async findByCode(code: string, clientId: number | null = null): Promise<Promotion> {
    const promotion = await this.promotionRepo.findOne({ where: { code: normalizeCode(code), active: true, requires_code: true } });
    // Same message for "not yours" as for "unknown": don't reveal that a
    // personal code exists.
    if (!promotion || (promotion.client_id != null && promotion.client_id !== clientId)) {
      throw new NotFoundException('Code promo invalide ou expiré.');
    }
    if (promotion.used_at) throw new NotFoundException('Ce code promo a déjà été utilisé.');
    if (promotion.expires_at && promotion.expires_at.getTime() < Date.now()) throw new NotFoundException('Ce code promo a expiré.');
    return promotion;
  }

  // Atomic claim: only one concurrent booking can win a single-use code.
  async markUsed(id: number): Promise<boolean> {
    const result = await this.promotionRepo
      .createQueryBuilder()
      .update(Promotion)
      .set({ used_at: () => 'now()' })
      .where('id = :id AND used_at IS NULL', { id })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  // A personal code is spent by the booking that uses it: when that booking
  // is cancelled/refused/deleted the code goes back to its owner, and is spent
  // again if the booking is revived. Shared admin codes (no client_id) have no
  // single-use state, so they are never touched.
  async releaseCodes(promotionIds: number[]): Promise<void> {
    if (promotionIds.length === 0) return;
    await this.promotionRepo
      .createQueryBuilder()
      .update(Promotion)
      // A code that ran out while the booking was pending would come back
      // already dead: the client must not lose their reward to our cancellation.
      .set({ used_at: null, expires_at: () => `CASE WHEN expires_at IS NOT NULL AND expires_at < now() THEN now() + interval '1 month' ELSE expires_at END` })
      .where('id IN (:...ids) AND client_id IS NOT NULL AND used_at IS NOT NULL', { ids: promotionIds })
      .execute();
  }

  async reclaimCodes(promotionIds: number[]): Promise<void> {
    if (promotionIds.length === 0) return;
    await this.promotionRepo
      .createQueryBuilder()
      .update(Promotion)
      .set({ used_at: () => 'now()' })
      .where('id IN (:...ids) AND client_id IS NOT NULL AND used_at IS NULL', { ids: promotionIds })
      .execute();
  }

  async releaseUse(id: number): Promise<void> {
    await this.promotionRepo.update(id, { used_at: null });
  }

  // Issues a fresh, randomly-generated one-time code for an automated
  // reward (loyalty milestone, birthday) — see RewardsService. Reuses the
  // exact same Promotion row/redemption path as an admin-created code
  // (findByCode above), so nothing about the booking flow needs to know
  // these codes exist. Unlike admin codes, they are single-use and tied
  // to their owner via client_id/used_at (enforced in findByCode).
  async createAutoCode(
    label: string,
    discountPercent: number,
    clientId: number,
    // amountCents: fixed euro reward instead of a percentage; manager: run
    // inside the caller's transaction (points redemption).
    opts: { amountCents?: number; expiresAt?: Date; manager?: EntityManager } = {},
  ): Promise<Promotion> {
    const repo = opts.manager ? opts.manager.getRepository(Promotion) : this.promotionRepo;
    let code: string;
    let attempts = 0;
    do {
      code = generateRandomCode();
      attempts += 1;
      const existing = await repo.findOne({ where: { code } });
      if (!existing) break;
    } while (attempts < 5);

    const promotion = repo.create({
      label,
      discount_percent: opts.amountCents ? 0 : discountPercent,
      discount_cents: opts.amountCents ?? null,
      expires_at: opts.expiresAt ?? null,
      requires_code: true,
      code,
      active: true,
      client_id: clientId,
    });
    return repo.save(promotion);
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
