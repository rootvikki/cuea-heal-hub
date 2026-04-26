// Curated list of common disposable / temporary email domains.
// Extend as new providers emerge. Lowercase only.
export const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  "mailinator.com", "mailinator.net", "mailinator.org",
  "10minutemail.com", "10minutemail.net",
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
  "guerrillamail.biz", "guerrillamail.de", "sharklasers.com",
  "trashmail.com", "trashmail.net", "trashmail.io",
  "tempmail.com", "temp-mail.org", "temp-mail.io",
  "yopmail.com", "yopmail.net", "yopmail.fr",
  "throwawaymail.com", "throwaway.email",
  "getnada.com", "nada.email",
  "maildrop.cc", "mailnesia.com", "mailcatch.com",
  "dispostable.com", "fakeinbox.com", "spambog.com",
  "spamgourmet.com", "mintemail.com", "mytemp.email",
  "tempinbox.com", "tempmailaddress.com", "tempmailo.com",
  "temporarymail.com", "anonbox.net", "byom.de",
  "mt2015.com", "mt2014.com", "thankyou2010.com",
  "spam4.me", "trbvm.com", "discard.email", "discardmail.com",
  "armyspy.com", "cuvox.de", "dayrep.com", "einrot.com",
  "fleckens.hu", "gustr.com", "jourrapide.com",
  "rhyta.com", "superrito.com", "teleworm.us",
  "deadaddress.com", "emailsensei.com", "fakemailgenerator.com",
  "instant-mail.de", "no-spam.ws", "objectmail.com",
  "proxymail.eu", "rcpt.at", "tagyourself.com",
  "tempemail.net", "tempinbox.co.uk", "trash-mail.at",
  "trbvn.com", "trillianpro.com", "wegwerfemail.de",
  "mailforspam.com", "mohmal.com", "moakt.com",
  "inboxbear.com", "mvrht.com", "tafmail.com",
  "fexpost.com", "incognitomail.com", "mailnull.com",
  "spamavert.com", "spambox.us", "tempemailaddress.com",
  "33mail.com", "anonymbox.com", "mailtemp.info",
  "luxusmail.org", "spamfree24.org", "mintemail.net",
  "burnermail.io", "emailondeck.com", "tempr.email",
]);

/**
 * Returns the suspicious reason if the email is disposable / blocked,
 * or null if it passes the check.
 */
export function checkDisposableEmail(email: string): { blocked: boolean; reason: string | null; domain: string | null } {
  if (!email || typeof email !== "string") {
    return { blocked: true, reason: "Invalid email format", domain: null };
  }
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 1 || at === trimmed.length - 1) {
    return { blocked: true, reason: "Malformed email address", domain: null };
  }
  const domain = trimmed.slice(at + 1);

  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return { blocked: true, reason: "Disposable email provider not allowed", domain };
  }

  // Block sub-domains of known providers (e.g., x.mailinator.com)
  for (const blocked of DISPOSABLE_EMAIL_DOMAINS) {
    if (domain.endsWith("." + blocked)) {
      return { blocked: true, reason: "Disposable email provider not allowed", domain };
    }
  }

  return { blocked: false, reason: null, domain };
}
