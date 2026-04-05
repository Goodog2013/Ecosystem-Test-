function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

class SystemTimeProvider {
  now() {
    return new Date();
  }
}

class FixedTimeProvider {
  constructor(initialDate) {
    this.current = new Date(initialDate);
  }

  now() {
    return new Date(this.current);
  }

  set(date) {
    this.current = new Date(date);
  }

  advanceDays(days = 1) {
    const next = new Date(this.current);
    next.setUTCDate(next.getUTCDate() + days);
    this.current = next;
  }
}

module.exports = {
  dateKey,
  SystemTimeProvider,
  FixedTimeProvider,
};

