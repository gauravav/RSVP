// Country dial codes for the RSVP phone field. US first and India second
// since those are where most guests are; everything else follows alphabetically.
export const COUNTRIES = [
  { iso: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { iso: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { iso: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺' },
  { iso: 'BD', name: 'Bangladesh', dial: '+880', flag: '🇧🇩' },
  { iso: 'BR', name: 'Brazil', dial: '+55', flag: '🇧🇷' },
  { iso: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
  { iso: 'CN', name: 'China', dial: '+86', flag: '🇨🇳' },
  { iso: 'FR', name: 'France', dial: '+33', flag: '🇫🇷' },
  { iso: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪' },
  { iso: 'HK', name: 'Hong Kong', dial: '+852', flag: '🇭🇰' },
  { iso: 'ID', name: 'Indonesia', dial: '+62', flag: '🇮🇩' },
  { iso: 'IE', name: 'Ireland', dial: '+353', flag: '🇮🇪' },
  { iso: 'IL', name: 'Israel', dial: '+972', flag: '🇮🇱' },
  { iso: 'IT', name: 'Italy', dial: '+39', flag: '🇮🇹' },
  { iso: 'JP', name: 'Japan', dial: '+81', flag: '🇯🇵' },
  { iso: 'KE', name: 'Kenya', dial: '+254', flag: '🇰🇪' },
  { iso: 'MY', name: 'Malaysia', dial: '+60', flag: '🇲🇾' },
  { iso: 'MX', name: 'Mexico', dial: '+52', flag: '🇲🇽' },
  { iso: 'NP', name: 'Nepal', dial: '+977', flag: '🇳🇵' },
  { iso: 'NL', name: 'Netherlands', dial: '+31', flag: '🇳🇱' },
  { iso: 'NZ', name: 'New Zealand', dial: '+64', flag: '🇳🇿' },
  { iso: 'NG', name: 'Nigeria', dial: '+234', flag: '🇳🇬' },
  { iso: 'PK', name: 'Pakistan', dial: '+92', flag: '🇵🇰' },
  { iso: 'PH', name: 'Philippines', dial: '+63', flag: '🇵🇭' },
  { iso: 'QA', name: 'Qatar', dial: '+974', flag: '🇶🇦' },
  { iso: 'SA', name: 'Saudi Arabia', dial: '+966', flag: '🇸🇦' },
  { iso: 'SG', name: 'Singapore', dial: '+65', flag: '🇸🇬' },
  { iso: 'ZA', name: 'South Africa', dial: '+27', flag: '🇿🇦' },
  { iso: 'KR', name: 'South Korea', dial: '+82', flag: '🇰🇷' },
  { iso: 'ES', name: 'Spain', dial: '+34', flag: '🇪🇸' },
  { iso: 'LK', name: 'Sri Lanka', dial: '+94', flag: '🇱🇰' },
  { iso: 'CH', name: 'Switzerland', dial: '+41', flag: '🇨🇭' },
  { iso: 'TH', name: 'Thailand', dial: '+66', flag: '🇹🇭' },
  { iso: 'AE', name: 'United Arab Emirates', dial: '+971', flag: '🇦🇪' },
  { iso: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
];

export const DEFAULT_COUNTRY = 'US';

export function countryByIso(iso) {
  return COUNTRIES.find((c) => c.iso === iso);
}

// Builds the canonical E.164 string we key records on, e.g. "+15551234567".
// Returns null when there aren't enough digits to be a real number, which keeps
// junk like "-" or "()" from creating rows nobody can look up again.
//
// The same guest must land on the same string however they type their number,
// otherwise they'd get a duplicate row instead of editing their RSVP. So we
// also absorb the ways people write a number that already carries its country
// code: a leading "+", a "00" international prefix, a national trunk "0", or
// the bare dial code typed in front.
export function normalizePhone(iso, rawNumber) {
  const country = countryByIso(iso);
  if (!country) return null;

  const raw = String(rawNumber || '').trim();
  const dialDigits = country.dial.replace(/\D/g, '');
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // "+91 98765 43210" or "0091..." is already fully international — trust it
  // over the dropdown, since the guest was explicit about the country.
  if (raw.startsWith('+') || digits.startsWith('00')) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    return digits.length >= 8 ? `+${digits}` : null;
  }

  // Drop a national trunk prefix, e.g. UK "07700 900123" -> "7700 900123".
  digits = digits.replace(/^0+/, '');

  // Strip a dial code typed without the "+". Requires the remainder to still
  // be a full-length national number, so an Indian mobile that genuinely
  // starts "91…" isn't mistaken for its own country code.
  if (digits.startsWith(dialDigits) && digits.length - dialDigits.length >= 9) {
    digits = digits.slice(dialDigits.length);
  }

  if (digits.length < 6) return null;
  return `${country.dial}${digits}`;
}
