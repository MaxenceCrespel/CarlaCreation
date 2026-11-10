import { registerDecorator, ValidationOptions } from 'class-validator';

// Extensions courantes des domaines utilisés dans les messages de phishing
// ou de démarchage. La liste reste volontairement large : un vrai message de
// cliente n'a aucune raison de contenir une adresse web.
const TLDS =
  'com|fr|net|org|online|site|xyz|io|co|me|info|biz|link|click|top|shop|app|live|store|tech|cloud|page|ly|gl|be|eu|uk|de|es|it|ru|cn|tk|ml|ga|cf|gq|cc|ws|vip|pro|icu|buzz|work|club|today|world';

const LINK_PATTERNS: RegExp[] = [
  /\b[a-z][a-z0-9+.-]*:\/\//i, // https://, ftp://, …
  /\bwww\s*\./i, // www.exemple
  new RegExp(`\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})(?![a-z0-9])`, 'i'), // exemple.online/…
  /\bbit\.ly\b|\btinyurl\.com\b/i,
];

/** Vrai si le texte contient une adresse web (avec ou sans https://). */
export function containsLink(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  // Les espaces/tirets insécables ou de largeur nulle servent à contourner les filtres.
  const cleaned = text.replace(/[​-‍⁠﻿]/g, '').replace(/ /g, ' ');
  return LINK_PATTERNS.some((re) => re.test(cleaned));
}

export const NO_LINKS_MESSAGE =
  "Les liens ne sont pas acceptés dans ce formulaire. Décrivez votre demande en quelques mots, sans adresse web.";

export function NoLinks(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'noLinks',
      target: object.constructor,
      propertyName,
      options: { message: NO_LINKS_MESSAGE, ...options },
      validator: { validate: (value: unknown) => !containsLink(value) },
    });
  };
}
