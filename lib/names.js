// Names are used as a shared secret alongside the phone number, so matching
// has to be forgiving about how a person writes their own name while still
// being strict about who it belongs to.
//
// Folds away: case, leading/trailing and repeated whitespace, accents
// ("José" === "Jose"), and punctuation ("O'Brien" === "OBrien" === "o brien",
// "Smith-Jones" === "smith jones", "Jr." === "jr").
export function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isBlankName(value) {
  return normalizeName(value) === '';
}

// True when the supplied first/last name identify the stored record.
//
// Accepts the two fields in either order, because people routinely fill
// "first" and "last" the other way round and we'd rather let a guest edit
// their own RSVP than lock them out of it.
//
// Records created before the name was split have no stored last name; those
// match on the first name alone, since that's all we ever captured.
export function namesMatch(stored, supplied) {
  const storedFirst = normalizeName(stored.firstName);
  const storedLast = normalizeName(stored.lastName);
  const suppliedFirst = normalizeName(supplied.firstName);
  const suppliedLast = normalizeName(supplied.lastName);

  if (!suppliedFirst) return false;
  if (!storedFirst && !storedLast) return false;

  if (!storedLast) return storedFirst === suppliedFirst;

  const exact = storedFirst === suppliedFirst && storedLast === suppliedLast;
  const swapped = storedFirst === suppliedLast && storedLast === suppliedFirst;
  return exact || swapped;
}
