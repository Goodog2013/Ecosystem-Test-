import { useUiStore } from "../store/uiStore";

export default function CurrencyIcon({ size = 16, className = "", alt = "Рубль" }) {
  const theme = useUiStore((state) => state.theme);
  const classes = `inline-block shrink-0 object-contain ${className}`.trim();
  const fileName = theme === "dark" ? "wrub.ico" : "rub.ico";
  const src = `${import.meta.env.BASE_URL}${fileName}`;

  return <img src={src} alt={alt} width={size} height={size} className={classes} draggable="false" />;
}
