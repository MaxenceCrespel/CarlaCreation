import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Admin-managed groupings for services (e.g. "Coiffure", "Ongles", "Homme")
// — replaces the old hardcoded coiffure/ongles enum so Carla can add new
// categories herself as her offering grows.
@Entity('service_categories')
export class ServiceCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  // Controls display order among siblings (same parent_id) on the public
  // site (category tabs/sections) and in the admin — lower first.
  @Column({ default: 0 })
  sort_order: number;

  // Self-referential, one level deep only (enforced in ServiceCategoriesService,
  // not the DB): null = top-level category, otherwise a subcategory of
  // another top-level category (e.g. "Hommes" under "Coiffure").
  @Column({ type: 'int', nullable: true })
  parent_id: number | null;
}
