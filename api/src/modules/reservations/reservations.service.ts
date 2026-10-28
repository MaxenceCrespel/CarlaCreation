import * as crypto from 'crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { combinePercents } from './discount.util';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Reservation } from '../../database/entities/reservation.entity';
import type { ReservationStatus } from '../../database/entities/reservation.entity';
import { Service } from '../../database/entities/service.entity';
import { ServiceAddon } from '../../database/entities/service-addon.entity';
import { ReservationAddon } from '../../database/entities/reservation-addon.entity';
import { effectiveInterval, getAvailableSlots, intervalsOverlap, isValidDateString, localDateString, toHHMM, toMinutes } from './slots.util';
import { resolveTierFee } from './travel-fee.util';
import { AdditionalGuestDto, AdminCreateReservationDto, CreateReservationDto, UpdateReservationDto } from './dto/reservation.dto';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { DistanceService } from '../distance/distance.service';
import { PushService } from '../push/push.service';
import { PromotionsService } from '../promotions/promotions.service';
import { PaymentsService } from '../stripe/payments.service';
import { StripeService } from '../stripe/stripe.service';
import { RewardsService } from '../rewards/rewards.service';
import { siteConfig } from '../../site-config';
import { config } from '../../config';

interface Guest {
  name: string;
  serviceId: number;
  addonIds: number[];
  promotionId?: number;
}

interface BookedGuest {
  id: number;
  name: string;
  serviceId: number;
  serviceName: string;
  startTime: string;
  endTime: string;
}

interface ReservationWithServiceRow {
  id: number;
  group_id: string | null;
  client_name: string;
  client_email: string;
  client_phone: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
  notes: string;
  status: ReservationStatus;
  created_at: Date;
  service_id: number;
  service_name: string;
  price_cents: number;
  at_client_home: boolean;
  client_address: string | null;
  travel_distance_km: number | null;
  travel_duration_minutes: number | null;
  travel_fee_cents: number | null;
  client_id: number | null;
  promotion_id: number | null;
  discount_percent: number;
  discount_cents: number;
  promotion_label: string | null;
  cancellation_reason: string | null;
  paid_on_site: boolean;
  addons: { name: string; extra_price_cents: number; extra_duration_minutes: number }[];
  // null when there's no online payment at all for this group (Stripe
  // wasn't configured at booking time, the client chose "payer sur
  // place", or never reached checkout).
  payment_status: string | null;
  payment_amount_cents: number | null;
}

// Stripe closes the checkout after this long, and a booking whose online
// payment was never completed is released shortly after (see
// releaseAbandonedCheckouts) — otherwise it would block its slot forever.
const CHECKOUT_LIFETIME_MINUTES = 60;
const ABANDONED_GRACE_MINUTES = 15;

interface ReminderCandidateRow {
  id: number;
  group_id: string | null;
  client_name: string;
  client_email: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
  service_name: string;
  at_client_home: boolean;
  client_address: string | null;
}

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Reservation) private readonly reservationRepo: Repository<Reservation>,
    @InjectRepository(Service) private readonly serviceRepo: Repository<Service>,
    @InjectRepository(ServiceAddon) private readonly addonRepo: Repository<ServiceAddon>,
    private readonly mailService: MailService,
    private readonly settingsService: SettingsService,
    private readonly distanceService: DistanceService,
    private readonly pushService: PushService,
    private readonly promotionsService: PromotionsService,
    private readonly stripeService: StripeService,
    private readonly paymentsService: PaymentsService,
    private readonly rewardsService: RewardsService,
  ) {}

  // Resolves each guest's OWN discount, not a single value for the whole
  // booking — a rate-based "tarif spécial" (e.g. tarif étudiant) is
  // personal to whoever qualifies for it, and must never leak onto every
  // other prestation in the same order. `fallback`, when given, is a
  // booking-wide promo code: it applies to EVERY guest and stacks on top of
  // a guest's own rate (rate first, then the code on what is left — see
  // combinePercents), e.g. a student using a loyalty reward code.
  private resolveGuestDiscounts(
    guests: Guest[],
    eligiblePromotions: { id: number; discount_percent: number }[],
    fallback: { id: number; discountPercent: number } | null,
    invalidMessage: string,
  ): { promotionId: number | null; discountPercent: number; codeApplied: boolean }[] {
    return guests.map((g) => {
      let rate: { id: number; discount_percent: number } | null = null;
      if (g.promotionId) {
        rate = eligiblePromotions.find((p) => p.id === g.promotionId) ?? null;
        if (!rate) throw new BadRequestException(invalidMessage);
      }
      return {
        // The row keeps one promotion reference: the guest's own rate when
        // there is one (it names the tarif), otherwise the code.
        promotionId: rate ? rate.id : fallback ? fallback.id : null,
        discountPercent: combinePercents(rate?.discount_percent ?? 0, fallback?.discountPercent ?? 0),
        codeApplied: fallback !== null,
      };
    });
  }

  // The dropdown-selectable "tarif spécial" catalogue + the order-wide
  // promo code (if any) — combined per-guest by resolveGuestDiscounts.
  private async resolvePublicGuestDiscounts(guests: Guest[], promoCode: string | undefined, clientId: number | null) {
    const [selectable, codePromotion] = await Promise.all([
      this.promotionsService.findSelectable(),
      promoCode ? this.promotionsService.findByCode(promoCode, clientId) : Promise.resolve(null),
    ]);
    const discounts = this.resolveGuestDiscounts(
      guests,
      selectable,
      codePromotion ? { id: codePromotion.id, discountPercent: codePromotion.discount_percent } : null,
      'Tarif spécial invalide.',
    );
    return { discounts, codePromotion };
  }

  // Admin picker: any active promotion (rate or code) can be applied
  // directly by id, per guest — she already sees the label, no need to
  // type a code. No booking-wide fallback here: the admin form has no
  // separate "code" field, just one promotion picker per person.
  private async resolveAdminGuestDiscounts(guests: Guest[]) {
    const active = (await this.promotionsService.findAll()).filter((p) => p.active);
    return this.resolveGuestDiscounts(guests, active, null, 'Promotion invalide.');
  }

  // Same rule as resolveAdminGuestDiscounts, for the single-reservation
  // edit form (UpdateReservationDto) rather than a whole group.
  private async resolveAdminPromotion(promotionId: number | undefined | null): Promise<{ id: number; discountPercent: number } | null> {
    if (!promotionId) return null;
    const promotions = await this.promotionsService.findAll();
    const promo = promotions.find((p) => p.id === promotionId && p.active);
    if (!promo) throw new BadRequestException('Promotion invalide.');
    return { id: promo.id, discountPercent: promo.discount_percent };
  }

  // The fee schedule is a step function of distance (free under the admin's
  // configured radius, then whatever tier the actual distance falls into —
  // see resolveTierFee) so a client is never quoted a moving-target price:
  // the "beyond Xkm, fees may apply" message is shown upfront in the
  // booking flow, well before this ever runs. The flat fallback only
  // applies when distance genuinely can't be determined (geocoding
  // disabled/unconfigured/unresolvable), never as part of normal pricing.
  private async computeTravel(
    atClientHome: boolean,
    clientAddress: string | null,
  ): Promise<{ feeCents: number | null; distanceKm: number | null; durationMinutes: number | null }> {
    if (!atClientHome) return { feeCents: null, distanceKm: null, durationMinutes: null };

    const fallbackFeeCents = await this.settingsService.getTravelFeeFallbackCents();
    if (!clientAddress) return { feeCents: fallbackFeeCents, distanceKm: null, durationMinutes: null };

    const estimate = await this.distanceService.estimate(siteConfig.siteAddress, clientAddress);
    if (!estimate) return { feeCents: fallbackFeeCents, distanceKm: null, durationMinutes: null };

    const tiers = await this.settingsService.getTravelFeeTiers();
    return {
      feeCents: resolveTierFee(tiers, estimate.distanceKm),
      distanceKm: estimate.distanceKm,
      durationMinutes: estimate.durationMinutes,
    };
  }

  // Powers the live estimate shown to the client while filling in their
  // address on the booking page, before the reservation actually exists.
  async estimateTravel(address: string): Promise<{ available: boolean; distanceKm: number | null; durationMinutes: number | null; feeCents: number | null }> {
    const result = await this.computeTravel(true, address);
    return { available: result.distanceKm !== null, ...result };
  }

  // The buffer blocked around an à-domicile slot used to be one flat
  // admin-configured number regardless of how far the client actually is —
  // now it's the real one-way driving time to their specific address
  // whenever that's resolvable, falling back to the flat setting only when
  // it isn't (no address yet, geocoding disabled/unresolvable). Existing
  // reservations use their own persisted travel_duration_minutes the same
  // way — see getAvailableSlots.
  private async resolveTravelBuffer(atClientHome: boolean, address?: string | null): Promise<{ candidateBufferMinutes: number; defaultBufferMinutes: number }> {
    const defaultBufferMinutes = await this.settingsService.getTravelBufferMinutes();
    if (!atClientHome) return { candidateBufferMinutes: 0, defaultBufferMinutes };
    if (!address) return { candidateBufferMinutes: defaultBufferMinutes, defaultBufferMinutes };

    const estimate = await this.distanceService.estimate(siteConfig.siteAddress, address);
    return { candidateBufferMinutes: estimate?.durationMinutes ?? defaultBufferMinutes, defaultBufferMinutes };
  }

  async getAvailability(
    date: string,
    serviceIds: number[],
    atClientHome = false,
    addonMinutes = 0,
    address?: string,
  ): Promise<{ date: string; serviceIds: number[]; slots: string[]; tooFarForAnyOpenRange: boolean }> {
    const services = await this.resolveServices(serviceIds, { activeOnly: true });
    const totalDuration = services.reduce((sum, s) => sum + s.duration_minutes, 0) + addonMinutes;
    const { candidateBufferMinutes, defaultBufferMinutes } = await this.resolveTravelBuffer(atClientHome, address);
    const { slots, tooFarForAnyOpenRange } = await getAvailableSlots(this.dataSource, date, totalDuration, atClientHome, candidateBufferMinutes, defaultBufferMinutes);
    return { date, serviceIds, slots, tooFarForAnyOpenRange };
  }

  // Scans forward from today (the admin's day-by-day schedule only ever
  // covers a 60-day rolling window, so that's the search horizon too) and
  // returns the very first open slot for the combined duration of the given
  // services — powers the "next available slot" suggestion on the booking
  // page so clients don't have to hunt through the day picker themselves.
  async findNextAvailable(
    serviceIds: number[],
    atClientHome = false,
    addonMinutes = 0,
    address?: string,
  ): Promise<{ date: string; startTime: string } | null> {
    const services = await this.resolveServices(serviceIds, { activeOnly: true });
    const totalDuration = services.reduce((sum, s) => sum + s.duration_minutes, 0) + addonMinutes;
    // Resolved once outside the day loop — the address doesn't change
    // day-to-day, so this avoids up to 60 redundant geocoding calls.
    const { candidateBufferMinutes, defaultBufferMinutes } = await this.resolveTravelBuffer(atClientHome, address);

    const HORIZON_DAYS = 60;
    const cursor = new Date();
    for (let i = 0; i < HORIZON_DAYS; i += 1) {
      const dateStr = localDateString(cursor);
      const { slots } = await getAvailableSlots(this.dataSource, dateStr, totalDuration, atClientHome, candidateBufferMinutes, defaultBufferMinutes);
      if (slots.length > 0) {
        return { date: dateStr, startTime: slots[0] };
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return null;
  }

  // Powers the day picker's "Complet" label: an open day with genuinely no
  // slot left for this prestation (studio or à domicile — both can fill up)
  // reads very differently from a day that's simply closed, and clients
  // shouldn't have to tap through every open-looking day to find out.
  async getDayAvailability(
    serviceIds: number[],
    atClientHome = false,
    addonMinutes = 0,
    address?: string,
    days = 30,
  ): Promise<{ date: string; hasSlots: boolean; slotCount: number }[]> {
    const services = await this.resolveServices(serviceIds, { activeOnly: true });
    const totalDuration = services.reduce((sum, s) => sum + s.duration_minutes, 0) + addonMinutes;
    const { candidateBufferMinutes, defaultBufferMinutes } = await this.resolveTravelBuffer(atClientHome, address);

    const result: { date: string; hasSlots: boolean; slotCount: number }[] = [];
    const cursor = new Date();
    for (let i = 0; i < days; i += 1) {
      const dateStr = localDateString(cursor);
      const { slots } = await getAvailableSlots(this.dataSource, dateStr, totalDuration, atClientHome, candidateBufferMinutes, defaultBufferMinutes);
      result.push({ date: dateStr, hasSlots: slots.length > 0, slotCount: slots.length });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  // Public booking: the primary contact (serviceId/clientName) plus any
  // additional guests (e.g. a mother booking for herself and her daughter)
  // are booked back-to-back as one linked group, sharing group_id, contact
  // info and date. The whole combined-duration block must be a genuinely
  // free, pre-computed slot — re-validated here to avoid race/tampering.
  async create(dto: CreateReservationDto, loggedInClientId: number | null = null) {
    const guests: Guest[] = [
      { name: dto.clientName, serviceId: dto.serviceId, addonIds: dto.addonIds ?? [], promotionId: dto.promotionId },
      ...(dto.additionalGuests ?? []).map((g: AdditionalGuestDto) => ({ name: g.name, serviceId: g.serviceId, addonIds: g.addonIds ?? [], promotionId: g.promotionId })),
    ];

    const services = await this.resolveServices(
      guests.map((g) => g.serviceId),
      { activeOnly: true },
    );
    const addonsPerGuest = await this.resolveAddons(guests, { activeOnly: true });
    const totalDuration = services.reduce(
      (sum, s, i) => sum + s.duration_minutes + addonsPerGuest[i].reduce((a, addon) => a + addon.extra_duration_minutes, 0),
      0,
    );
    const atClientHome = dto.atClientHome ?? false;
    const clientAddress = atClientHome ? dto.clientAddress ?? null : null;
    const travel = await this.computeTravel(atClientHome, clientAddress);
    const defaultBufferMinutes = await this.settingsService.getTravelBufferMinutes();
    const candidateBufferMinutes = travel.durationMinutes ?? defaultBufferMinutes;

    const { slots: available } = await getAvailableSlots(this.dataSource, dto.date, totalDuration, atClientHome, candidateBufferMinutes, defaultBufferMinutes);
    if (!available.includes(dto.startTime)) {
      throw new ConflictException("Ce créneau n'est plus disponible. Merci d'en choisir un autre.");
    }

    const { discounts, codePromotion } = await this.resolvePublicGuestDiscounts(guests, dto.promoCode, loggedInClientId);

    // A fixed-euro reward code (loyalty points) comes off the guests that
    // took the code (not the ones with their own rate), in order, never
    // below zero for any one prestation.
    let remainingFixedCents = codePromotion?.discount_cents ?? 0;
    // Remembered on each row that took a personal code, so cancelling the
    // booking can give exactly that code back.
    const personalCodeId = codePromotion?.client_id != null ? codePromotion.id : null;
    const guestDiscounts = discounts.map((d, i) => {
      const rewardCodeId = d.codeApplied ? personalCodeId : null;
      if (remainingFixedCents <= 0 || !d.codeApplied) return { ...d, rewardCodeId, discountCents: 0 };
      const addonsCents = addonsPerGuest[i].reduce((a, addon) => a + addon.extra_price_cents, 0);
      const net = Math.round((services[i].price_cents + addonsCents) * (1 - d.discountPercent / 100));
      const applied = Math.min(remainingFixedCents, net);
      remainingFixedCents -= applied;
      return { ...d, rewardCodeId, discountCents: applied };
    });

    // A personal reward code is consumed by the booking that uses it —
    // claimed atomically before inserting, released if the insert fails.
    const consumedPersonalCodeId =
      codePromotion?.client_id != null && guestDiscounts.some((d) => d.codeApplied) ? codePromotion.id : null;
    if (consumedPersonalCodeId !== null && !(await this.promotionsService.markUsed(consumedPersonalCodeId))) {
      throw new NotFoundException('Ce code promo a déjà été utilisé.');
    }

    // Same per-guest discount math as the admin reservations list — see
    // resolveGuestDiscounts — summed across the group, plus the shared
    // travel fee once (it's per-trip, not per-person).
    const totalCents =
      services.reduce((sum, s, i) => {
        const addonsCents = addonsPerGuest[i].reduce((a, addon) => a + addon.extra_price_cents, 0);
        const fullPrice = s.price_cents + addonsCents;
        return sum + Math.round(fullPrice * (1 - guestDiscounts[i].discountPercent / 100)) - guestDiscounts[i].discountCents;
      }, 0) + (travel.feeCents ?? 0);

    let result: Awaited<ReturnType<typeof this.insertGroup>>;
    try {
      result = await this.insertGroup(guests, services, addonsPerGuest, guestDiscounts, {
        date: dto.date,
        startTime: dto.startTime,
        clientEmail: dto.clientEmail,
        clientPhone: dto.clientPhone,
        notes: dto.notes || '',
        status: 'pending',
        atClientHome,
        clientAddress,
        travelDistanceKm: travel.distanceKm,
        travelDurationMinutes: travel.durationMinutes,
        travelFeeCents: travel.feeCents,
        primaryClientId: loggedInClientId,
      }, async () => {
        // Re-checked under the per-day lock (see insertGroup): two clients
        // validating the same slot at the same instant can't both pass it.
        const { slots } = await getAvailableSlots(this.dataSource, dto.date, totalDuration, atClientHome, candidateBufferMinutes, defaultBufferMinutes);
        if (!slots.includes(dto.startTime)) {
          throw new ConflictException("Ce créneau n'est plus disponible. Merci d'en choisir un autre.");
        }
      });
    } catch (err) {
      if (consumedPersonalCodeId !== null) await this.promotionsService.releaseUse(consumedPersonalCodeId);
      throw err;
    }

    // Stripe is entirely optional (config.STRIPE_ENABLED) — when it isn't
    // configured, the client chose "payer sur place", or the checkout
    // session fails to create, the booking still goes through exactly as
    // before: a pending request with no payment step. A Stripe outage
    // must never block a booking.
    let checkoutUrl: string | null = null;
    if (this.stripeService.isEnabled() && dto.paymentOption === 'full' && totalCents > 0) {
      try {
        const session = await this.stripeService.createCheckoutSession({
          groupId: result.groupId,
          amountCents: totalCents,
          description: `Réservation — ${siteConfig.siteName}`,
          customerEmail: dto.clientEmail,
          expiresAt: Math.floor(Date.now() / 1000) + CHECKOUT_LIFETIME_MINUTES * 60,
          successUrl: `${config.PUBLIC_ORIGIN}/mon-rendez-vous/${result.groupId}?paiement=reussi`,
          cancelUrl: `${config.PUBLIC_ORIGIN}/mon-rendez-vous/${result.groupId}?paiement=annule`,
        });
        if (session) {
          await this.paymentsService.createPending(result.groupId, totalCents, session.sessionId);
          checkoutUrl = session.url;
        }
      } catch (err) {
        this.logger.error(`Stripe checkout session creation failed for group ${result.groupId}: ${(err as Error).message}`);
      }
    }

    await this.mailService.sendBookingReceived({
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      date: result.date,
      guests: result.guests,
      groupId: result.groupId,
      atClientHome,
      clientAddress: result.clientAddress,
    });
    await this.mailService.sendAdminNewBookingNotification({
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      clientPhone: dto.clientPhone,
      date: result.date,
      guests: result.guests,
      atClientHome,
      clientAddress: result.clientAddress,
    });
    // Same event as the email above, just also surfaced instantly if she's
    // enabled notifications — neither channel depends on the other.
    await this.pushService.notifyAdmins({
      title: 'Nouvelle demande de rendez-vous',
      body: `${dto.clientName} — ${result.date} à ${result.startTime}`,
      url: '/admin',
    });

    return { ...result, checkoutUrl, totalCents };
  }

  // Admin-only: log a reservation directly (walk-in, phone booking…),
  // bypassing the public "must be a pre-computed available slot" constraint
  // (so the admin can book outside opened hours or on an unset day) but
  // still enforcing a hard overlap check so two reservations can't collide.
  // Also supports additional guests, same as the public flow.
  async createManual(dto: AdminCreateReservationDto) {
    if (!isValidDateString(dto.date)) {
      throw new BadRequestException('Date invalide.');
    }

    const guests: Guest[] = [
      { name: dto.clientName, serviceId: dto.serviceId, addonIds: dto.addonIds ?? [], promotionId: dto.promotionId },
      ...(dto.additionalGuests ?? []).map((g: AdditionalGuestDto) => ({ name: g.name, serviceId: g.serviceId, addonIds: g.addonIds ?? [], promotionId: g.promotionId })),
    ];

    const services = await this.resolveServices(
      guests.map((g) => g.serviceId),
      { activeOnly: false },
    );
    const addonsPerGuest = await this.resolveAddons(guests, { activeOnly: false });
    const totalDuration = services.reduce(
      (sum, s, i) => sum + s.duration_minutes + addonsPerGuest[i].reduce((a, addon) => a + addon.extra_duration_minutes, 0),
      0,
    );
    const atClientHome = dto.atClientHome ?? false;
    const clientAddress = atClientHome ? dto.clientAddress ?? null : null;
    const travel = await this.computeTravel(atClientHome, clientAddress);
    const defaultBufferMinutes = await this.settingsService.getTravelBufferMinutes();
    const candidateBufferMinutes = travel.durationMinutes ?? defaultBufferMinutes;

    const startMin = toMinutes(dto.startTime);
    const endMin = startMin + totalDuration;
    const candidate = effectiveInterval(startMin, endMin, atClientHome, candidateBufferMinutes);

    const status = dto.status || 'confirmed';
    const guestDiscounts = await this.resolveAdminGuestDiscounts(guests);

    const result = await this.insertGroup(guests, services, addonsPerGuest, guestDiscounts, {
      date: dto.date,
      startTime: dto.startTime,
      clientEmail: dto.clientEmail,
      clientPhone: dto.clientPhone,
      notes: dto.notes || '',
      status,
      atClientHome,
      clientAddress,
      travelDistanceKm: travel.distanceKm,
      travelDurationMinutes: travel.durationMinutes,
      travelFeeCents: travel.feeCents,
      primaryClientId: null,
    },
      // allowOverlap is the admin's deliberate call (e.g. booking a haircut
      // during a colour's processing time) — skip the check entirely rather
      // than trying to guess which overlaps are "safe".
      dto.allowOverlap ? undefined : () => this.assertNoOverlap(dto.date, candidate, defaultBufferMinutes),
    );

    // A manual booking is usually entered as already-confirmed, so send the
    // matching email directly instead of a "request received" one.
    if (status === 'confirmed') {
      await this.mailService.sendStatusUpdate({
        clientName: dto.clientName,
        clientEmail: dto.clientEmail,
        date: result.date,
        guests: result.guests,
        groupId: result.groupId,
        status,
        atClientHome,
        clientAddress: result.clientAddress,
      });
    } else {
      await this.mailService.sendBookingReceived({
        clientName: dto.clientName,
        clientEmail: dto.clientEmail,
        date: result.date,
        guests: result.guests,
        groupId: result.groupId,
        atClientHome,
        clientAddress: result.clientAddress,
      });
    }

    return result;
  }

  // Throws when `candidate` collides with any live reservation that day
  // (or its travel time) — excludeId lets an edit ignore its own row.
  private async assertNoOverlap(date: string, candidate: { start: number; end: number }, defaultBufferMinutes: number, excludeId?: number): Promise<void> {
    const query = this.reservationRepo
      .createQueryBuilder('r')
      .select(['r.start_time', 'r.end_time', 'r.at_client_home', 'r.travel_duration_minutes'])
      .where('r.reservation_date = :date', { date })
      .andWhere('r.status NOT IN (:...excluded)', { excluded: ['cancelled', 'refused'] });
    if (excludeId !== undefined) query.andWhere('r.id != :id', { id: excludeId });
    const others = await query.getMany();

    const overlaps = others.some((r) => {
      const busy = effectiveInterval(toMinutes(r.start_time), toMinutes(r.end_time), r.at_client_home, r.travel_duration_minutes ?? defaultBufferMinutes);
      return intervalsOverlap(candidate, busy);
    });
    if (overlaps) {
      throw new ConflictException('Ce créneau chevauche une réservation existante (ou son temps de trajet).');
    }
  }

  private async resolveServices(serviceIds: number[], opts: { activeOnly: boolean }): Promise<Service[]> {
    if (serviceIds.length === 0) {
      throw new BadRequestException('Au moins une prestation est requise.');
    }
    const services = await Promise.all(
      serviceIds.map(async (id) => {
        const where = opts.activeOnly ? { id, active: true } : { id };
        const service = await this.serviceRepo.findOne({ where });
        if (!service) {
          throw new NotFoundException('Service introuvable.');
        }
        return service;
      }),
    );
    return services;
  }

  // Parallel to `guests` (same index per guest) — each guest's addonIds
  // must belong to THEIR OWN service, not just exist somewhere.
  private async resolveAddons(guests: Guest[], opts: { activeOnly: boolean }): Promise<ServiceAddon[][]> {
    return Promise.all(
      guests.map(async (guest) => {
        const ids = guest.addonIds ?? [];
        if (ids.length === 0) return [];

        const addons = await this.addonRepo.find({ where: { id: In(ids) } });
        if (addons.length !== ids.length) {
          throw new NotFoundException('Supplément introuvable.');
        }
        for (const addon of addons) {
          if (addon.service_id !== guest.serviceId) {
            throw new BadRequestException('Un supplément ne correspond pas à la prestation sélectionnée.');
          }
          if (opts.activeOnly && !addon.active) {
            throw new BadRequestException("Ce supplément n'est plus disponible.");
          }
        }
        return addons;
      }),
    );
  }

  private async insertGroup(
    guests: Guest[],
    services: Service[],
    addonsPerGuest: ServiceAddon[][],
    // Aligned with `guests` by index — each guest's own resolved discount,
    // see resolveGuestDiscounts (never a single value blanket-applied to
    // the whole group).
    guestDiscounts: { promotionId: number | null; discountPercent: number; discountCents?: number; rewardCodeId?: number | null }[],
    common: {
      date: string;
      startTime: string;
      clientEmail: string;
      clientPhone: string;
      notes: string;
      status: ReservationStatus;
      atClientHome: boolean;
      clientAddress: string | null;
      travelDistanceKm: number | null;
      travelDurationMinutes: number | null;
      travelFeeCents: number | null;
      // Auto-links only the FIRST guest's row (the account holder booking
      // for themselves) — additional guests (e.g. a mother booking for her
      // child too) are never auto-linked, same as the admin's own manual
      // "fiche" matching stays a deliberate, per-person decision.
      primaryClientId: number | null;
    },
    // Runs inside the transaction, once the day is locked: the last word on
    // whether the slot is still free.
    guard?: () => Promise<void>,
  ): Promise<{ groupId: string; date: string; startTime: string; endTime: string; guests: BookedGuest[]; atClientHome: boolean; clientAddress: string | null }> {
    const groupId = crypto.randomUUID();
    const bookedGuests: BookedGuest[] = [];
    let cursor = toMinutes(common.startTime);

    await this.dataSource.transaction(async (manager) => {
      // One booking at a time per day: the lock is released at commit, so the
      // next request re-reads a schedule that already contains this one.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`reservations:${common.date}`]);
      if (guard) await guard();

      for (let i = 0; i < guests.length; i += 1) {
        const guest = guests[i];
        const service = services[i];
        const addons = addonsPerGuest[i] ?? [];
        const addonDuration = addons.reduce((sum, a) => sum + a.extra_duration_minutes, 0);
        const duration = service.duration_minutes + addonDuration;
        const startTime = toHHMM(cursor);
        const endTime = toHHMM(cursor + duration);

        const inserted = await manager.insert(Reservation, {
          group_id: groupId,
          service_id: guest.serviceId,
          client_name: guest.name,
          client_email: common.clientEmail,
          client_phone: common.clientPhone,
          reservation_date: common.date,
          start_time: startTime,
          end_time: endTime,
          notes: common.notes,
          status: common.status,
          at_client_home: common.atClientHome,
          client_address: common.clientAddress,
          travel_distance_km: common.travelDistanceKm,
          travel_duration_minutes: common.travelDurationMinutes,
          travel_fee_cents: common.travelFeeCents,
          promotion_id: guestDiscounts[i].promotionId,
          reward_code_id: guestDiscounts[i].rewardCodeId ?? null,
          discount_percent: guestDiscounts[i].discountPercent,
          discount_cents: guestDiscounts[i].discountCents ?? 0,
          client_id: i === 0 ? common.primaryClientId : null,
        });
        const reservationId = Number(inserted.identifiers[0].id);

        if (addons.length > 0) {
          await manager.insert(
            ReservationAddon,
            addons.map((a) => ({
              reservation_id: reservationId,
              name: a.name,
              extra_price_cents: a.extra_price_cents,
              extra_duration_minutes: a.extra_duration_minutes,
            })),
          );
        }

        const serviceName = addons.length > 0 ? `${service.name} + ${addons.map((a) => a.name).join(', ')}` : service.name;

        bookedGuests.push({
          id: reservationId,
          name: guest.name,
          serviceId: guest.serviceId,
          serviceName,
          startTime,
          endTime,
        });
        cursor += duration;
      }
    });

    return {
      groupId,
      date: common.date,
      startTime: common.startTime,
      endTime: toHHMM(cursor),
      guests: bookedGuests,
      atClientHome: common.atClientHome,
      clientAddress: common.clientAddress,
    };
  }

  async findAllForAdmin(): Promise<ReservationWithServiceRow[]> {
    const rows: Omit<ReservationWithServiceRow, 'addons' | 'payment_status' | 'payment_amount_cents'>[] = await this.dataSource.query(
      `SELECT r.id, r.group_id, r.client_name, r.client_email, r.client_phone, r.reservation_date,
              r.start_time, r.end_time, r.notes, r.status, r.created_at, r.service_id, r.client_id,
              r.at_client_home, r.client_address,
              r.travel_distance_km::float8 AS travel_distance_km, r.travel_duration_minutes, r.travel_fee_cents,
              r.promotion_id, r.discount_percent, r.discount_cents, p.label AS promotion_label, r.cancellation_reason, r.paid_on_site,
              s.name AS service_name, s.price_cents
       FROM reservations r
       JOIN services s ON s.id = r.service_id
       LEFT JOIN promotions p ON p.id = r.promotion_id
       ORDER BY r.reservation_date ASC, r.start_time ASC`,
    );
    if (rows.length === 0) return [];

    const addonRows: { reservation_id: number; name: string; extra_price_cents: number; extra_duration_minutes: number }[] =
      await this.dataSource.query(
        `SELECT reservation_id, name, extra_price_cents, extra_duration_minutes FROM reservation_addons WHERE reservation_id = ANY($1)`,
        [rows.map((r) => r.id)],
      );
    const addonsByReservation = new Map<number, { name: string; extra_price_cents: number; extra_duration_minutes: number }[]>();
    for (const a of addonRows) {
      const list = addonsByReservation.get(a.reservation_id) ?? [];
      list.push({ name: a.name, extra_price_cents: a.extra_price_cents, extra_duration_minutes: a.extra_duration_minutes });
      addonsByReservation.set(a.reservation_id, list);
    }

    // One online payment per booking group (see Payment entity) — batched
    // by group_id rather than N+1'd per row. Only exists for the "payer en
    // ligne" choice; "payer sur place" bookings never get a row here (see
    // paid_on_site instead).
    const groupIds = [...new Set(rows.map((r) => r.group_id).filter((id): id is string => Boolean(id)))];
    const paymentRows: { group_id: string; status: string; amount_cents: number }[] =
      groupIds.length > 0
        ? await this.dataSource.query(`SELECT group_id, status, amount_cents FROM payments WHERE group_id = ANY($1)`, [groupIds])
        : [];
    const paymentByGroup = new Map(paymentRows.map((p) => [p.group_id, p]));

    return rows.map((r) => {
      const payment = r.group_id ? paymentByGroup.get(r.group_id) : undefined;
      return {
        ...r,
        addons: addonsByReservation.get(r.id) ?? [],
        payment_status: payment?.status ?? null,
        payment_amount_cents: payment?.amount_cents ?? null,
      };
    });
  }

  // Editing a mistaken date/time/service/client detail after the fact — a
  // different concern from updateStatus (which is a decision the client
  // gets emailed about). Re-validates the slot (service/addon duration,
  // travel buffer, overlap against every OTHER reservation that day) the
  // same way createManual does, excluding this row's own id so saving it
  // unchanged never self-conflicts.
  async updateReservation(id: number, dto: UpdateReservationDto): Promise<{ paymentWarning: string | null }> {
    const existing = await this.reservationRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Réservation introuvable.');
    }

    const serviceId = dto.serviceId ?? existing.service_id;
    const service = await this.serviceRepo.findOne({ where: { id: serviceId } });
    if (!service) {
      throw new NotFoundException('Prestation introuvable.');
    }

    const date = dto.date ?? existing.reservation_date;
    if (!isValidDateString(date)) {
      throw new BadRequestException('Date invalide.');
    }
    const startTime = dto.startTime ?? existing.start_time;
    const atClientHome = dto.atClientHome ?? existing.at_client_home;
    const clientAddress = atClientHome ? dto.clientAddress ?? existing.client_address : null;
    // Only re-geocode if location actually changed — an edit that just
    // fixes the time/notes shouldn't spend an API call re-confirming a
    // distance that hasn't moved.
    const locationChanged = atClientHome !== existing.at_client_home || clientAddress !== existing.client_address;
    const travel = locationChanged
      ? await this.computeTravel(atClientHome, clientAddress)
      : { distanceKm: existing.travel_distance_km, durationMinutes: existing.travel_duration_minutes, feeCents: existing.travel_fee_cents };

    // reservation_addons only stores a name/price/duration snapshot, not an
    // addon id — so when addonIds isn't provided, re-use the existing
    // snapshot rows as-is instead of trying to resolve them back to ids.
    let addonRows: { name: string; extra_price_cents: number; extra_duration_minutes: number }[];
    if (dto.addonIds !== undefined) {
      const [resolved] = await this.resolveAddons([{ name: existing.client_name, serviceId, addonIds: dto.addonIds }], { activeOnly: false });
      addonRows = resolved.map((a) => ({ name: a.name, extra_price_cents: a.extra_price_cents, extra_duration_minutes: a.extra_duration_minutes }));
    } else {
      addonRows = await this.dataSource.query(
        `SELECT name, extra_price_cents, extra_duration_minutes FROM reservation_addons WHERE reservation_id = $1`,
        [id],
      );
    }
    const addonDuration = addonRows.reduce((sum, a) => sum + a.extra_duration_minutes, 0);

    const startMin = toMinutes(startTime);
    const endMin = startMin + service.duration_minutes + addonDuration;
    const endTime = toHHMM(endMin);

    const defaultBufferMinutes = await this.settingsService.getTravelBufferMinutes();
    const candidateBufferMinutes = travel.durationMinutes ?? defaultBufferMinutes;
    const candidate = effectiveInterval(startMin, endMin, atClientHome, candidateBufferMinutes);

    // See createManual for the rationale — the admin's deliberate call,
    // not persisted, so an unrelated later edit still gets the normal check.
    if (!dto.allowOverlap) {
      await this.assertNoOverlap(date, candidate, defaultBufferMinutes, id);
    }

    let promotionId = existing.promotion_id;
    let discountPercent = existing.discount_percent;
    let discountCents = existing.discount_cents;
    if (dto.promotionId !== undefined) {
      const promotion = await this.resolveAdminPromotion(dto.promotionId);
      promotionId = promotion?.id ?? null;
      discountPercent = promotion?.discountPercent ?? 0;
      // A fixed-euro reward belongs to the code it came from: changing the
      // promotion drops it.
      discountCents = 0;
    }

    // The online payment (held or captured) was computed from the booking as
    // it was: changing what is being sold doesn't move that amount.
    let paymentWarning: string | null = null;
    const payment = existing.group_id ? await this.paymentsService.findByGroupId(existing.group_id) : null;
    if (payment && (payment.status === 'authorized' || payment.status === 'paid')) {
      const previousAddons: { name: string; extra_price_cents: number }[] = await this.dataSource.query(
        `SELECT name, extra_price_cents FROM reservation_addons WHERE reservation_id = $1`,
        [id],
      );
      const signature = (rows: { name: string; extra_price_cents: number }[]) => JSON.stringify(rows.map((a) => [a.name, a.extra_price_cents]).sort());
      const priceChanged =
        serviceId !== existing.service_id ||
        promotionId !== existing.promotion_id ||
        discountPercent !== existing.discount_percent ||
        locationChanged ||
        (dto.addonIds !== undefined && signature(addonRows) !== signature(previousAddons ?? []));
      if (priceChanged) {
        paymentWarning = `Cette réservation est déjà payée en ligne (${(payment.amount_cents / 100).toLocaleString('fr-FR')} €) : le montant débité ne suit pas cette modification. Ajustez-le depuis Stripe si besoin.`;
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Reservation, id, {
        service_id: serviceId,
        client_name: dto.clientName ?? existing.client_name,
        client_email: dto.clientEmail ?? existing.client_email,
        client_phone: dto.clientPhone ?? existing.client_phone,
        reservation_date: date,
        start_time: startTime,
        end_time: endTime,
        notes: dto.notes ?? existing.notes,
        at_client_home: atClientHome,
        client_address: clientAddress,
        travel_distance_km: travel.distanceKm,
        travel_duration_minutes: travel.durationMinutes,
        travel_fee_cents: travel.feeCents,
        promotion_id: promotionId,
        discount_percent: discountPercent,
        discount_cents: discountCents,
      });

      if (dto.addonIds !== undefined) {
        await manager.delete(ReservationAddon, { reservation_id: id });
        if (addonRows.length > 0) {
          await manager.insert(
            ReservationAddon,
            addonRows.map((a) => ({ reservation_id: id, ...a })),
          );
        }
      }
    });

    // Admin corrected a typo'd email (e.g. .com → .fr): the original
    // booking-received/confirmation email already went out to the wrong
    // address and the client never saw it — re-send the same notification
    // to the corrected address now. Only makes sense for a still-live
    // reservation (pending/confirmed); nothing to resend for a cancelled,
    // refused, or already-completed one.
    const newEmail = dto.clientEmail ?? existing.client_email;
    if (newEmail !== existing.client_email && (existing.status === 'pending' || existing.status === 'confirmed')) {
      const clientName = dto.clientName ?? existing.client_name;
      const guests = [{ name: clientName, serviceName: service.name, startTime, endTime }];
      if (existing.status === 'pending') {
        await this.mailService.sendBookingReceived({
          clientName,
          clientEmail: newEmail,
          date,
          guests,
          groupId: existing.group_id ?? undefined,
          atClientHome,
          clientAddress,
        });
      } else {
        await this.mailService.sendStatusUpdate({
          clientName,
          clientEmail: newEmail,
          date,
          status: existing.status,
          guests,
          groupId: existing.group_id ?? undefined,
          atClientHome,
          clientAddress,
        });
      }
    }

    return { paymentWarning };
  }

  // A finished appointment has already paid out its loyalty points and
  // belongs to the books: it never goes back. And an appointment that was
  // cancelled or refused can't have "taken place".
  private assertStatusChange(current: (ReservationStatus | undefined)[], next: ReservationStatus, opts: { strict: boolean }): void {
    if (current.includes('completed') && next !== 'completed') {
      throw new BadRequestException('Un rendez-vous terminé ne peut plus changer de statut.');
    }
    if (opts.strict && next === 'completed' && current.some((s) => s === 'cancelled' || s === 'refused')) {
      throw new BadRequestException("Un rendez-vous annulé ou refusé ne peut pas être marqué terminé : remettez-le d'abord en confirmé.");
    }
  }

  // Returns a sentence for the admin when the online payment could not follow
  // the status change (see settlePaymentForGroupStatus) — null when all good.
  async updateStatus(id: number, status: ReservationStatus): Promise<{ paymentWarning: string | null }> {
    const [current]: { status?: ReservationStatus }[] = await this.dataSource.query(`SELECT status FROM reservations WHERE id = $1`, [id]);
    this.assertStatusChange([current?.status], status, { strict: true });

    const result = await this.reservationRepo.update(id, { status });
    if (result.affected === 0) {
      throw new NotFoundException('Réservation introuvable.');
    }

    const rows: {
      group_id: string | null;
      client_name: string;
      client_email: string;
      reservation_date: string;
      start_time: string;
      end_time: string;
      service_name: string;
      at_client_home: boolean;
      client_address: string | null;
    }[] = await this.dataSource.query(
      `SELECT r.group_id, r.client_name, r.client_email, r.reservation_date, r.start_time, r.end_time,
              r.at_client_home, r.client_address, s.name AS service_name
       FROM reservations r JOIN services s ON s.id = r.service_id WHERE r.id = $1`,
      [id],
    );
    const row = rows[0];
    const paymentWarning = row?.group_id ? await this.settlePaymentForGroupStatus(row.group_id, status) : null;
    await this.syncPromotionCodes([id], status);
    if (status === 'completed') {
      await this.rewardsService.onReservationsCompleted([id]);
    }
    if (row) {
      await this.mailService.sendStatusUpdate({
        clientName: row.client_name,
        clientEmail: row.client_email,
        date: row.reservation_date,
        status,
        groupId: row.group_id ?? undefined,
        atClientHome: row.at_client_home,
        clientAddress: row.client_address,
        guests: [{ name: row.client_name, serviceName: row.service_name, startTime: row.start_time, endTime: row.end_time }],
      });
    }
    return { paymentWarning };
  }

  // Captures (on 'confirmed') or releases/refunds (on 'refused' and
  // 'cancelled') the payment hold placed at booking — see
  // StripeService.createCheckoutSession's capture_method: 'manual'. Only acts
  // once every row in the group shares the new status: a single guest in a
  // multi-person booking changing status shouldn't move money for the whole
  // group's shared payment (see Payment.group_id) while the others are still
  // pending/confirmed. updateGroupStatus always satisfies this trivially
  // since it updates the whole group atomically; updateStatus (single row)
  // only triggers once the last guest catches up.
  // Never throws (the status change itself must go through): returns a
  // sentence telling the admin what to do by hand instead.
  private async settlePaymentForGroupStatus(groupId: string, status: ReservationStatus): Promise<string | null> {
    if (status !== 'confirmed' && status !== 'refused' && status !== 'cancelled') return null;

    const rows: { status: ReservationStatus }[] = await this.dataSource.query(`SELECT DISTINCT status FROM reservations WHERE group_id = $1`, [groupId]);
    if (rows.length !== 1 || rows[0].status !== status) return null;

    try {
      if (status === 'confirmed') {
        const outcome = await this.paymentsService.capture(groupId);
        if (outcome === 'unpaid') {
          return "La cliente n'a pas finalisé son paiement en ligne : rien n'a été débité. Encaissez sur place ou demandez-lui de payer.";
        }
      } else {
        await this.paymentsService.cancelAuthorization(groupId);
      }
    } catch {
      // Already logged by PaymentsService.
      return status === 'confirmed'
        ? "Le paiement en ligne n'a pas pu être débité (autorisation expirée ?). À régler depuis le tableau de bord Stripe."
        : "Le paiement en ligne n'a pas pu être remboursé ou libéré automatiquement. À faire depuis le tableau de bord Stripe.";
    }
    return null;
  }

  // Single-use reward codes follow the booking that used them: cancelled,
  // refused or deleted → back to their owner; revived → spent again.
  private async syncPromotionCodes(reservationIds: number[], status: ReservationStatus): Promise<void> {
    try {
      const ids = reservationIds.filter((id) => typeof id === 'number');
      if (ids.length === 0) return;
      // promotion_id covers bookings made before reward_code_id existed;
      // rates (no owner) are ignored by releaseCodes/reclaimCodes anyway.
      const rows: { promotion_id?: number | null }[] = await this.dataSource.query(
        `SELECT DISTINCT unnest(ARRAY[reward_code_id, promotion_id]) AS promotion_id FROM reservations WHERE id = ANY($1)`,
        [ids],
      );
      const promotionIds = rows.map((r) => r.promotion_id).filter((id): id is number => typeof id === 'number');
      if (status === 'cancelled' || status === 'refused') await this.promotionsService.releaseCodes(promotionIds);
      else await this.promotionsService.reclaimCodes(promotionIds);
    } catch (err) {
      this.logger.error(`Promotion code sync failed: ${(err as Error).message}`);
    }
  }

  // Once a deleted booking leaves no live reservation in its group, its online
  // payment would be orphaned: release the hold / refund the charge.
  private async settlePaymentAfterDelete(groupId: string): Promise<string | null> {
    const live: unknown[] = await this.dataSource.query(`SELECT 1 FROM reservations WHERE group_id = $1 AND status NOT IN ('cancelled', 'refused') LIMIT 1`, [groupId]);
    if (live.length > 0) return null;
    try {
      await this.paymentsService.cancelAuthorization(groupId);
    } catch {
      return "Le paiement en ligne n'a pas pu être remboursé ou libéré automatiquement. À faire depuis le tableau de bord Stripe.";
    }
    return null;
  }

  // Deleting is meant for cleaning up a mistake/spam entry, unlike
  // refuse/cancel (a real decision the client needs to know about) — but if
  // the row being deleted was still pending/confirmed (i.e. not yet past,
  // not already refused/cancelled), the client had a real upcoming
  // appointment and silently erasing it without a word would be worse than
  // sending the same "annulé" email refuse/cancel already sends. Same logic
  // for their money: an upcoming booking's online payment is released.
  async remove(id: number): Promise<{ paymentWarning: string | null }> {
    const rows: {
      group_id: string | null;
      client_name: string;
      client_email: string;
      reservation_date: string;
      start_time: string;
      end_time: string;
      status: ReservationStatus;
      promotion_id?: number | null;
      reward_code_id?: number | null;
      service_name: string;
      at_client_home: boolean;
      client_address: string | null;
    }[] = await this.dataSource.query(
      `SELECT r.group_id, r.client_name, r.client_email, r.reservation_date, r.start_time, r.end_time, r.status, r.promotion_id, r.reward_code_id,
              r.at_client_home, r.client_address, s.name AS service_name
       FROM reservations r JOIN services s ON s.id = r.service_id WHERE r.id = $1`,
      [id],
    );
    const row = rows[0];

    const result = await this.reservationRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Réservation introuvable.');
    }

    let paymentWarning: string | null = null;
    if (row && (row.status === 'pending' || row.status === 'confirmed')) {
      await this.promotionsService.releaseCodes([row.promotion_id, row.reward_code_id].filter((id): id is number => typeof id === 'number'));
      if (row.group_id) paymentWarning = await this.settlePaymentAfterDelete(row.group_id);
      await this.mailService.sendStatusUpdate({
        clientName: row.client_name,
        clientEmail: row.client_email,
        date: row.reservation_date,
        status: 'cancelled',
        groupId: row.group_id ?? undefined,
        atClientHome: row.at_client_home,
        clientAddress: row.client_address,
        guests: [{ name: row.client_name, serviceName: row.service_name, startTime: row.start_time, endTime: row.end_time }],
      });
    }
    return { paymentWarning };
  }

  // Bulk actions on every reservation in a group (e.g. refuse the whole
  // family's booking at once instead of one row at a time).
  async updateGroupStatus(groupId: string, status: ReservationStatus): Promise<{ paymentWarning: string | null }> {
    const current: { status: ReservationStatus }[] = await this.dataSource.query(`SELECT DISTINCT status FROM reservations WHERE group_id = $1`, [groupId]);
    this.assertStatusChange(current.map((r) => r.status), status, { strict: false });

    const result = await this.reservationRepo.update({ group_id: groupId }, { status });
    if (result.affected === 0) {
      throw new NotFoundException('Groupe de réservations introuvable.');
    }
    return { paymentWarning: await this.afterGroupStatusChange(groupId, status, { settlePayment: true }) };
  }

  // Everything that follows a group's rows having just been switched to
  // `status`: the online payment, the reward codes, loyalty points and the
  // email to the client. settlePayment is off when the caller handles the
  // payment itself (client cancellation reports the outcome to the admin).
  private async afterGroupStatusChange(groupId: string, status: ReservationStatus, opts: { settlePayment: boolean }): Promise<string | null> {
    const paymentWarning = opts.settlePayment ? await this.settlePaymentForGroupStatus(groupId, status) : null;

    const rows: {
      client_name: string;
      client_email: string;
      reservation_date: string;
      start_time: string;
      end_time: string;
      service_name: string;
      at_client_home: boolean;
      client_address: string | null;
    }[] = await this.dataSource.query(
      `SELECT r.client_name, r.client_email, r.reservation_date, r.start_time, r.end_time,
              r.at_client_home, r.client_address, s.name AS service_name
       FROM reservations r JOIN services s ON s.id = r.service_id WHERE r.group_id = $1 ORDER BY r.start_time ASC`,
      [groupId],
    );

    const ids: { id: number }[] = await this.dataSource.query(`SELECT id FROM reservations WHERE group_id = $1`, [groupId]);
    await this.syncPromotionCodes(ids.map((r) => r.id), status);
    if (status === 'completed') {
      await this.rewardsService.onReservationsCompleted(ids.map((r) => r.id));
    }

    if (rows.length > 0) {
      const [primary] = rows;
      await this.mailService.sendStatusUpdate({
        clientName: primary.client_name,
        clientEmail: primary.client_email,
        date: primary.reservation_date,
        status,
        groupId,
        atClientHome: primary.at_client_home,
        clientAddress: primary.client_address,
        guests: rows.map((r) => ({ name: r.client_name, serviceName: r.service_name, startTime: r.start_time, endTime: r.end_time })),
      });
    }
    return paymentWarning;
  }

  async removeGroup(groupId: string): Promise<{ paymentWarning: string | null }> {
    const rows: {
      client_name: string;
      client_email: string;
      reservation_date: string;
      start_time: string;
      end_time: string;
      status: ReservationStatus;
      promotion_id?: number | null;
      reward_code_id?: number | null;
      service_name: string;
      at_client_home: boolean;
      client_address: string | null;
    }[] = await this.dataSource.query(
      `SELECT r.client_name, r.client_email, r.reservation_date, r.start_time, r.end_time, r.status, r.promotion_id, r.reward_code_id,
              r.at_client_home, r.client_address, s.name AS service_name
       FROM reservations r JOIN services s ON s.id = r.service_id WHERE r.group_id = $1 ORDER BY r.start_time ASC`,
      [groupId],
    );

    const result = await this.reservationRepo.delete({ group_id: groupId });
    if (result.affected === 0) {
      throw new NotFoundException('Groupe de réservations introuvable.');
    }

    let paymentWarning: string | null = null;
    const [primary] = rows;
    if (primary && (primary.status === 'pending' || primary.status === 'confirmed')) {
      const promotionIds = rows.filter((r) => r.status === 'pending' || r.status === 'confirmed').flatMap((r) => [r.promotion_id, r.reward_code_id]).filter((id): id is number => typeof id === 'number');
      await this.promotionsService.releaseCodes([...new Set(promotionIds)]);
      paymentWarning = await this.settlePaymentAfterDelete(groupId);
      await this.mailService.sendStatusUpdate({
        clientName: primary.client_name,
        clientEmail: primary.client_email,
        date: primary.reservation_date,
        status: 'cancelled',
        groupId,
        atClientHome: primary.at_client_home,
        clientAddress: primary.client_address,
        guests: rows.map((r) => ({ name: r.client_name, serviceName: r.service_name, startTime: r.start_time, endTime: r.end_time })),
      });
    }
    return { paymentWarning };
  }

  // Public "manage my booking" lookup — group_id is a crypto.randomUUID(),
  // unguessable, so it doubles as the access token for this link (sent in
  // the confirmation email). No separate auth needed for a client to view
  // or cancel their own booking.
  async findByGroupId(groupId: string) {
    const rows: {
      client_name: string;
      client_email: string;
      reservation_date: string;
      start_time: string;
      end_time: string;
      status: ReservationStatus;
      service_name: string;
      at_client_home: boolean;
      client_address: string | null;
      paid_on_site: boolean;
    }[] = await this.dataSource.query(
      `SELECT r.client_name, r.client_email, r.reservation_date, r.start_time, r.end_time, r.status,
              r.at_client_home, r.client_address, r.paid_on_site, s.name AS service_name
       FROM reservations r JOIN services s ON s.id = r.service_id WHERE r.group_id = $1 ORDER BY r.start_time ASC`,
      [groupId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('Réservation introuvable.');
    }

    const [primary] = rows;
    const payment = await this.paymentsService.findByGroupId(groupId);
    return {
      groupId,
      clientName: primary.client_name,
      clientEmail: primary.client_email,
      date: primary.reservation_date,
      status: primary.status,
      atClientHome: primary.at_client_home,
      clientAddress: primary.client_address,
      guests: rows.map((r) => ({ name: r.client_name, serviceName: r.service_name, startTime: r.start_time, endTime: r.end_time })),
      payment: payment
        ? { status: payment.status, amountCents: payment.amount_cents, cancelOutcome: this.cancelOutcomeFor(payment.status) }
        : null,
      paidOnSite: payment ? null : primary.paid_on_site,
      // Cancelling only makes sense for a live booking that hasn't started.
      canCancel: (primary.status === 'pending' || primary.status === 'confirmed') && !this.hasStarted(primary.reservation_date, primary.start_time),
    };
  }

  private hasStarted(date: string, startTime: string): boolean {
    return new Date(`${date}T${startTime}:00`).getTime() <= Date.now();
  }

  // What cancelling now would do to the online payment — same rules as
  // cancelByGroupId, so the client can be told before they confirm.
  // 'release' = unconfirmed hold lifted, never charged; 'refund' = charged
  // money returned in full; null = nothing to say.
  private cancelOutcomeFor(paymentStatus: string): 'release' | 'refund' | null {
    if (paymentStatus === 'authorized') return 'release';
    if (paymentStatus === 'paid') return 'refund';
    return null;
  }

  // Purely a bookkeeping toggle for "payer sur place" bookings — no Stripe
  // involved at all. Carla flips it herself once she's actually been paid
  // (cash, or the SumUp app's own Tap to Pay on her phone, neither
  // integrated with this system).
  async setPaidOnSite(groupId: string, paid: boolean): Promise<void> {
    const result = await this.reservationRepo.update({ group_id: groupId }, { paid_on_site: paid });
    if (result.affected === 0) {
      throw new NotFoundException('Réservation introuvable.');
    }
  }

  async cancelByGroupId(groupId: string, reason: string): Promise<void> {
    const rows: { status: ReservationStatus; client_name: string; reservation_date: string; start_time: string }[] = await this.dataSource.query(
      `SELECT status, client_name, reservation_date, start_time FROM reservations WHERE group_id = $1 ORDER BY start_time ASC LIMIT 1`,
      [groupId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('Réservation introuvable.');
    }
    if (rows[0].status === 'cancelled') {
      throw new BadRequestException('Ce rendez-vous est déjà annulé.');
    }
    if (rows[0].status === 'completed') {
      throw new BadRequestException('Ce rendez-vous est déjà passé, il ne peut plus être annulé.');
    }
    if (rows[0].status === 'refused') {
      throw new BadRequestException("Ce rendez-vous a été refusé : il n'y a rien à annuler.");
    }
    // Without this a client could "cancel" after the appointment (until the
    // admin marks it completed) and be refunded for a service they received.
    if (this.hasStarted(rows[0].reservation_date, rows[0].start_time)) {
      throw new BadRequestException('Ce rendez-vous a déjà commencé ou est passé : il ne peut plus être annulé en ligne. Contactez-nous directement.');
    }

    // Fetched before the status flips, so the mail/push below still reflects
    // "this just got cancelled" rather than needing a second query — same
    // guest shape as the status mail to the client, for the admin's notice.
    const guestRows: { client_name: string; client_email: string; client_phone: string; start_time: string; end_time: string; service_name: string }[] =
      await this.dataSource.query(
        `SELECT r.client_name, r.client_email, r.client_phone, r.start_time, r.end_time, s.name AS service_name
         FROM reservations r JOIN services s ON s.id = r.service_id WHERE r.group_id = $1 ORDER BY r.start_time ASC`,
        [groupId],
      );

    // The status filter makes the claim atomic: of two simultaneous cancels
    // (double click, two tabs) only one gets here, so the refund below runs
    // once. The reason is stored on every row of the group, in the same write.
    const claimed = await this.reservationRepo.update({ group_id: groupId, status: In(['pending', 'confirmed']) }, { status: 'cancelled', cancellation_reason: reason });
    if (!claimed.affected) {
      throw new BadRequestException('Ce rendez-vous est déjà annulé.');
    }
    await this.afterGroupStatusChange(groupId, 'cancelled', { settlePayment: false });

    // null = there was never an online payment to refund (Stripe disabled,
    // the client chose "payer sur place", or abandoned checkout without
    // paying) — distinct from true/false, which both mean a payment existed.
    let paymentRefunded: boolean | null = null;
    const payment = await this.paymentsService.findByGroupId(groupId);
    if (payment && payment.status === 'pending') {
      // Checkout still open: close it so it can't be paid for a dead booking.
      await this.paymentsService.markAbandoned(groupId);
    } else if (payment && payment.status === 'authorized') {
      // Still just a hold, never actually charged (the appointment hadn't
      // been confirmed yet) — always release it, the refund-deadline
      // policy below only makes sense once real money has moved.
      try {
        await this.paymentsService.cancelAuthorization(groupId);
        paymentRefunded = true;
      } catch (err) {
        this.logger.error(`Authorization cancel failed for group ${groupId}: ${(err as Error).message}`);
        paymentRefunded = false;
      }
    } else if (payment && payment.status === 'paid') {
      // Charged (the appointment had been confirmed): always refunded in full,
      // whatever the notice — no deadline policy for now.
      try {
        await this.paymentsService.refund(groupId);
        paymentRefunded = true;
      } catch (err) {
        // Refund failure must not block the cancellation itself — she'll
        // see "à rembourser à la main" in the notification below and can
        // refund from the Stripe dashboard.
        this.logger.error(`Refund failed for group ${groupId}: ${(err as Error).message}`);
        paymentRefunded = false;
      }
    }

    // Only the client-initiated path notifies — an admin changing the
    // status herself (updateGroupStatus called elsewhere) doesn't need a
    // push/email telling her about her own action.
    await this.pushService.notifyAdmins({
      title: 'Rendez-vous annulé par le client',
      body: `${rows[0].client_name} — ${rows[0].reservation_date} — Motif : ${reason}${paymentRefunded === true ? ' — paiement remboursé' : paymentRefunded === false ? ' — remboursement à faire à la main' : ''}`,
      url: '/admin',
    });
    if (guestRows.length > 0) {
      const [primary] = guestRows;
      await this.mailService.sendAdminCancellationNotification({
        clientName: primary.client_name,
        clientEmail: primary.client_email,
        clientPhone: primary.client_phone,
        date: rows[0].reservation_date,
        guests: guestRows.map((r) => ({ name: r.client_name, serviceName: r.service_name, startTime: r.start_time, endTime: r.end_time })),
        cancellationReason: reason,
        paymentRefunded,
      });
    }
  }

  // A client who chose "payer en ligne" and never finished checkout would
  // otherwise block their slot until the admin notices: once Stripe has closed
  // the session (and a missed webhook has been ruled out), the booking is
  // released and the client told.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async releaseAbandonedCheckouts(): Promise<void> {
    try {
      await this.dispatchAbandonedCheckouts();
    } catch (err) {
      this.logger.error(`Abandoned checkout job failed: ${(err as Error).message}`);
    }
  }

  async dispatchAbandonedCheckouts(): Promise<void> {
    const rows: { group_id: string }[] = await this.dataSource.query(
      `SELECT DISTINCT r.group_id FROM reservations r
       JOIN payments p ON p.group_id = r.group_id
       WHERE r.status = 'pending' AND p.status = 'pending'
         AND r.created_at < now() - ($1 * interval '1 minute')`,
      [CHECKOUT_LIFETIME_MINUTES + ABANDONED_GRACE_MINUTES],
    );

    for (const { group_id: groupId } of rows) {
      try {
        await this.paymentsService.syncPending(groupId);
        const payment = await this.paymentsService.findByGroupId(groupId);
        if (!payment || payment.status !== 'pending') continue;

        await this.paymentsService.markAbandoned(groupId);
        const released = await this.reservationRepo.update({ group_id: groupId, status: 'pending' }, { status: 'cancelled', cancellation_reason: 'Paiement en ligne non finalisé' });
        if (released.affected) await this.afterGroupStatusChange(groupId, 'cancelled', { settlePayment: false });
      } catch (err) {
        this.logger.error(`Abandoned checkout release failed for group ${groupId}: ${(err as Error).message}`);
      }
    }
  }

  // Runs every 10 minutes so a reservation crossing the "24h before" mark
  // is caught quickly without needing precise per-booking scheduling.
  // reminder_sent guards against duplicate emails across runs.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sendDueReminders(): Promise<void> {
    try {
      await this.dispatchDueReminders();
    } catch (err) {
      this.logger.error(`Reminder job failed: ${(err as Error).message}`);
    }
  }

  async dispatchDueReminders(): Promise<void> {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const rows: ReminderCandidateRow[] = await this.dataSource.query(
      `SELECT r.id, r.group_id, r.client_name, r.client_email, r.reservation_date, r.start_time, r.end_time,
              r.at_client_home, r.client_address, s.name AS service_name
       FROM reservations r
       JOIN services s ON s.id = r.service_id
       WHERE r.status = 'confirmed' AND r.reminder_sent = false`,
    );

    const due = rows.filter((r) => {
      const appointment = new Date(`${r.reservation_date}T${r.start_time}:00`);
      return appointment > now && appointment <= in24h;
    });
    if (due.length === 0) return;

    const groups = new Map<string, ReminderCandidateRow[]>();
    for (const row of due) {
      const key = row.group_id ?? `single-${row.id}`;
      const bucket = groups.get(key) ?? [];
      bucket.push(row);
      groups.set(key, bucket);
    }

    for (const groupRows of groups.values()) {
      const [primary] = groupRows;
      await this.mailService.sendReminder({
        clientName: primary.client_name,
        clientEmail: primary.client_email,
        date: primary.reservation_date,
        groupId: primary.group_id ?? undefined,
        atClientHome: primary.at_client_home,
        clientAddress: primary.client_address,
        guests: groupRows.map((r) => ({ name: r.client_name, serviceName: r.service_name, startTime: r.start_time, endTime: r.end_time })),
      });
      await this.reservationRepo.update(
        groupRows.map((r) => r.id),
        { reminder_sent: true },
      );
    }
  }
}
