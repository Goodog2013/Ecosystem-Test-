export function formatCoins(value) {
  return new Intl.NumberFormat("ru-RU").format(Number(value || 0));
}

export function relativeDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  return date.toLocaleString("ru-RU");
}

export function shorten(text, max = 130) {
  const source = String(text || "");
  return source.length > max ? `${source.slice(0, max)}...` : source;
}