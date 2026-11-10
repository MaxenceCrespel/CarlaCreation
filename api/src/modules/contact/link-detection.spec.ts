import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { containsLink } from './link-detection';
import { CreateContactDto } from './dto/contact.dto';

describe('containsLink', () => {
  it.each([
    'Voir https://gopartage.online/fr/spo/carlacreation',
    'http://exemple.fr',
    'www.exemple.fr',
    'WWW . exemple . fr',
    'gopartage.online/fr/spo/carlacreation',
    'allez sur promo-beaute.com pour les tarifs',
    'bit.ly/abc123',
    'gopartage​.online',
  ])('detects a link in %p', (text) => {
    expect(containsLink(text)).toBe(true);
  });

  it.each([
    'Bonjour, je voudrais un balayage samedi à 14.30 à Loos.',
    "Disponible l'après-midi ? Merci beaucoup.",
    'Coupe + couleur, environ 2.5 heures ?',
    'Super.Merci !',
    'Prix : 45.50 euros',
  ])('lets %p through', (text) => {
    expect(containsLink(text)).toBe(false);
  });

  it('ignores non-string values', () => {
    expect(containsLink(undefined)).toBe(false);
  });
});

describe('CreateContactDto', () => {
  const build = (over: Record<string, unknown>) =>
    plainToInstance(CreateContactDto, { name: 'Camille', phone: '0601020304', message: 'Bonjour !', ...over });

  it('accepts a normal message', async () => {
    expect(await validate(build({}))).toHaveLength(0);
  });

  it('rejects a message containing a link', async () => {
    const errors = await validate(build({ message: 'Tarifs sur https://gopartage.online/fr/spo/carlacreation' }));
    expect(errors.map((e) => e.property)).toEqual(['message']);
  });

  it('rejects a link hidden in the name', async () => {
    const errors = await validate(build({ name: 'promo-beaute.com' }));
    expect(errors.map((e) => e.property)).toEqual(['name']);
  });
});
