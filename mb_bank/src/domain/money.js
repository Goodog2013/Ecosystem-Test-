function toCents(amount) {
  if (typeof amount === "number" && Number.isFinite(amount)) {
    return Math.round(amount * 100);
  }

  if (typeof amount === "string") {
    const normalized = amount.trim().replace(",", ".");
    if (!/^[-+]?\d+(\.\d{1,2})?$/.test(normalized)) {
      throw new Error(`Invalid amount string: ${amount}`);
    }
    return Math.round(Number(normalized) * 100);
  }

  throw new Error(`Unsupported amount type: ${typeof amount}`);
}

function centsToNumber(cents) {
  return Number((cents / 100).toFixed(2));
}

function centsToString(cents) {
  return (cents / 100).toFixed(2);
}

function feeWithMinimum(amountCents, rate, minimumCents) {
  const fee = Math.round(amountCents * rate);
  return fee >= minimumCents ? fee : minimumCents;
}

function isPositiveCents(cents) {
  return Number.isInteger(cents) && cents > 0;
}

module.exports = {
  toCents,
  centsToNumber,
  centsToString,
  feeWithMinimum,
  isPositiveCents,
};

