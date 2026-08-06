import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Expense } from '../../database/entities/expense.entity';
import { CreateExpenseDto, UpdateExpenseDto } from './dto/expense.dto';
import { isValidDateString } from '../reservations/slots.util';

@Injectable()
export class ExpensesService {
  constructor(@InjectRepository(Expense) private readonly expenseRepo: Repository<Expense>) {}

  async findAll(from?: string, to?: string): Promise<Expense[]> {
    if (from && to) {
      if (!isValidDateString(from) || !isValidDateString(to) || from > to) {
        throw new BadRequestException('Période invalide.');
      }
      return this.expenseRepo.find({ where: { expense_date: Between(from, to) }, order: { expense_date: 'DESC' } });
    }
    return this.expenseRepo.find({ order: { expense_date: 'DESC' } });
  }

  async create(dto: CreateExpenseDto): Promise<Expense> {
    if (!isValidDateString(dto.expenseDate)) {
      throw new BadRequestException('Date invalide.');
    }
    const expense = this.expenseRepo.create({
      expense_date: dto.expenseDate,
      category: dto.category?.trim() || 'Autre',
      description: dto.description?.trim() ?? '',
      amount_cents: dto.amountCents,
    });
    return this.expenseRepo.save(expense);
  }

  async update(id: number, dto: UpdateExpenseDto): Promise<Expense> {
    const expense = await this.expenseRepo.findOne({ where: { id } });
    if (!expense) throw new NotFoundException('Dépense introuvable.');

    if (dto.expenseDate !== undefined) {
      if (!isValidDateString(dto.expenseDate)) {
        throw new BadRequestException('Date invalide.');
      }
      expense.expense_date = dto.expenseDate;
    }
    if (dto.category !== undefined) expense.category = dto.category.trim() || 'Autre';
    if (dto.description !== undefined) expense.description = dto.description.trim();
    if (dto.amountCents !== undefined) expense.amount_cents = dto.amountCents;

    return this.expenseRepo.save(expense);
  }

  async remove(id: number): Promise<void> {
    const result = await this.expenseRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Dépense introuvable.');
  }
}
