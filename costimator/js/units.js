// Unit handling. Every quantity resolves to a base unit within one dimension:
//   mass   -> g
//   volume -> ml
//   count  -> ea
// Cross-dimension conversion (g <-> ml) is only possible when the ingredient
// carries a density, which is why convert() takes an optional density argument.

const UNITS = {
  g: { dimension: 'mass', inBase: 1, label: 'g' },
  kg: { dimension: 'mass', inBase: 1000, label: 'kg' },
  mg: { dimension: 'mass', inBase: 0.001, label: 'mg' },
  oz: { dimension: 'mass', inBase: 28.349523125, label: 'oz' },
  lb: { dimension: 'mass', inBase: 453.59237, label: 'lb' },

  ml: { dimension: 'volume', inBase: 1, label: 'ml' },
  l: { dimension: 'volume', inBase: 1000, label: 'L' },
  tsp: { dimension: 'volume', inBase: 5, label: 'tsp' },
  tbsp: { dimension: 'volume', inBase: 20, label: 'tbsp' }, // 20ml — Australian tablespoon
  cup: { dimension: 'volume', inBase: 250, label: 'cup' },  // 250ml — metric cup

  ea: { dimension: 'count', inBase: 1, label: 'ea' },
  doz: { dimension: 'count', inBase: 12, label: 'doz' },
};

const BASE_UNIT = { mass: 'g', volume: 'ml', count: 'ea' };

function normaliseUnit(unit) {
  if (typeof unit !== 'string') return null;
  const key = unit.trim().toLowerCase();
  if (UNITS[key]) return key;
  // Tolerate the spellings people actually type.
  const aliases = {
    gram: 'g', grams: 'g', gm: 'g', gs: 'g',
    kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg', kgs: 'kg',
    milligram: 'mg', milligrams: 'mg',
    ounce: 'oz', ounces: 'oz',
    pound: 'lb', pounds: 'lb', lbs: 'lb',
    millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml', mls: 'ml',
    litre: 'l', litres: 'l', liter: 'l', liters: 'l', lt: 'l',
    teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp',
    tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp', tbsps: 'tbsp',
    cups: 'cup',
    each: 'ea', unit: 'ea', units: 'ea', piece: 'ea', pieces: 'ea', pc: 'ea', pcs: 'ea', portion: 'ea',
    dozen: 'doz',
  };
  return aliases[key] || null;
}

function dimensionOf(unit) {
  const key = normaliseUnit(unit);
  return key ? UNITS[key].dimension : null;
}

function unitLabel(unit) {
  const key = normaliseUnit(unit);
  return key ? UNITS[key].label : String(unit ?? '');
}

// Quantity -> base unit of its own dimension.
function toBase(qty, unit) {
  const key = normaliseUnit(unit);
  if (!key) throw new Error(`Unknown unit: "${unit}"`);
  return { qty: qty * UNITS[key].inBase, unit: BASE_UNIT[UNITS[key].dimension] };
}

// Base-unit quantity -> the requested unit.
function fromBase(qty, unit) {
  const key = normaliseUnit(unit);
  if (!key) throw new Error(`Unknown unit: "${unit}"`);
  return qty / UNITS[key].inBase;
}

/**
 * Convert between units. Within a dimension this is exact. Across mass and
 * volume it needs `density` in g/ml — without one we refuse rather than guess,
 * because a silently wrong conversion is a silently wrong food cost.
 */
function convert(qty, fromUnit, toUnit, density) {
  const from = normaliseUnit(fromUnit);
  const to = normaliseUnit(toUnit);
  if (!from) throw new Error(`Unknown unit: "${fromUnit}"`);
  if (!to) throw new Error(`Unknown unit: "${toUnit}"`);

  const fromDim = UNITS[from].dimension;
  const toDim = UNITS[to].dimension;
  const base = toBase(qty, from).qty;

  if (fromDim === toDim) return fromBase(base, to);

  if (fromDim === 'count' || toDim === 'count') {
    throw new Error(
      `Cannot convert ${unitLabel(from)} to ${unitLabel(to)} — set a pack size in ${unitLabel(to)} for this item.`
    );
  }

  if (!density || density <= 0) {
    throw new Error(
      `Cannot convert ${unitLabel(from)} to ${unitLabel(to)} without a density — add g/ml to this ingredient.`
    );
  }

  // base is g when coming from mass, ml when coming from volume.
  const converted = fromDim === 'mass' ? base / density : base * density;
  return fromBase(converted, to);
}

function unitsForDimension(dimension) {
  return Object.keys(UNITS).filter((u) => UNITS[u].dimension === dimension);
}

const Units = {
  UNITS, BASE_UNIT, normaliseUnit, dimensionOf, unitLabel,
  toBase, fromBase, convert, unitsForDimension,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Units;
if (typeof window !== 'undefined') window.Units = Units;
