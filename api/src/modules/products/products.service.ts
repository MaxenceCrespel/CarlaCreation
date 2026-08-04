import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../database/entities/product.entity';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(@InjectRepository(Product) private readonly productRepo: Repository<Product>) {}

  findAll(): Promise<Product[]> {
    return this.productRepo.find({ order: { name: 'ASC' } });
  }

  create(dto: CreateProductDto): Promise<Product> {
    const product = this.productRepo.create({
      name: dto.name.trim(),
      unit: dto.unit?.trim() || 'unité',
      quantity: dto.quantity ?? 0,
      low_stock_threshold: dto.lowStockThreshold ?? 0,
      notes: dto.notes?.trim() ?? '',
    });
    return this.productRepo.save(product);
  }

  async update(id: number, dto: UpdateProductDto): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Produit introuvable.');

    if (dto.name !== undefined) product.name = dto.name.trim();
    if (dto.unit !== undefined) product.unit = dto.unit.trim() || 'unité';
    if (dto.quantity !== undefined) product.quantity = dto.quantity;
    if (dto.lowStockThreshold !== undefined) product.low_stock_threshold = dto.lowStockThreshold;
    if (dto.notes !== undefined) product.notes = dto.notes.trim();

    return this.productRepo.save(product);
  }

  async remove(id: number): Promise<void> {
    const result = await this.productRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Produit introuvable.');
  }
}
