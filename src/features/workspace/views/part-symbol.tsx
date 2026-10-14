import type { PartSymbol as SymbolType } from "../../../core/catalog/starter-catalog";

export function PartSymbol({ symbol, color = "green", resistance = 220 }: { symbol: SymbolType; color?: string; resistance?: number }) {
  if (symbol === "board") return <>
    <rect x="0" y="0" width="172" height="164" rx="12" fill="#24594d" stroke="#143e34" strokeWidth="2" />
    <rect x="7" y="54" width="20" height="52" rx="3" fill="#a9b6b2" stroke="#dce4e0" />
    <rect x="49" y="38" width="67" height="86" rx="4" fill="#18342d" stroke="#52766b" />
    {Array.from({ length: 7 }, (_, i) => <g key={i} stroke="#a0b9a5" strokeWidth="3"><path d={`M42 ${47 + i * 11}h7 M116 ${47 + i * 11}h7`} /></g>)}
    <text x="82" y="77" textAnchor="middle" fill="#acc7b6" fontSize="12" fontFamily="monospace">TRINIKA</text>
    <text x="82" y="97" textAnchor="middle" fill="#91b3a1" fontSize="9">TRAINING</text>
    {[12, 152].map((y) => [12, 159].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="#ccd4be" stroke="#123c30" strokeWidth="2" />))}
    {["VCC", "IO1", "IO2", "GND"].map((label, i) => <text key={label} x="152" y={[36, 68, 102, 136][i]} textAnchor="end" fill="#d0ddc8" fontSize="10" fontFamily="monospace">{label}</text>)}
    <text x="28" y="148" fill="#91b3a1" fontSize="8" letterSpacing="1">WIRING BOARD · V1</text>
  </>;
  if (symbol === "led") {
    const colors: Record<string, string> = { green: "#62ba8a", red: "#e46c70", blue: "#6f9fe5", amber: "#dfb36b" };
    return <>
      <path d="M26 79V130 M74 79V130" stroke="#939f9c" strokeWidth="4" />
      <path d="M19 77V42a31 31 0 0 1 62 0v35Z" fill={colors[color] ?? colors.green} stroke="#47785e" strokeWidth="2" />
      <rect x="15" y="74" width="70" height="10" rx="3" fill={colors[color] ?? colors.green} stroke="#47785e" />
      <path d="M29 49V40a20 20 0 0 1 9-17" fill="none" stroke="#ffffff" strokeOpacity=".45" strokeWidth="6" strokeLinecap="round" />
      <text x="26" y="116" textAnchor="middle" fill="#65726b" fontSize="13">+</text><text x="74" y="116" textAnchor="middle" fill="#65726b" fontSize="13">−</text>
    </>;
  }
  if (symbol === "resistor") return <>
    <path d="M0 32h156" stroke="#9ca5a0" strokeWidth="4" />
    <rect x="32" y="16" width="92" height="32" rx="12" fill="#e6d5b6" stroke="#c0aa88" strokeWidth="2" />
    {[{ x: 48, color: "#ad4935" }, { x: 61, color: "#ad4935" }, { x: 74, color: "#79552d" }, { x: 104, color: "#bc9750" }].map((band) => <rect key={band.x} x={band.x} y="17" width="7" height="30" fill={band.color} />)}
    <text x="78" y="7" textAnchor="middle" fill="#6a746e" fontSize="11" fontFamily="monospace">{resistance} Ω</text>
  </>;
  if (symbol === "button") return <>
    <path d="M0 46h110" stroke="#939f9c" strokeWidth="4" />
    <rect x="20" y="9" width="70" height="74" rx="5" fill="#c4cec8" stroke="#98a79e" strokeWidth="2" />
    <rect x="29" y="18" width="52" height="56" rx="4" fill="#3b4440" />
    <circle cx="55" cy="46" r="21" fill="#626d65" stroke="#7b887f" strokeWidth="3" />
    <circle cx="55" cy="46" r="15" fill="#737f76" />
  </>;
  return <>
    <rect width="186" height="86" rx="9" fill="#f6f4ea" stroke="#bfc5bb" strokeWidth="2" />
    {["A", "B", "C", "D", "E"].map((label, i) => <g key={label}>
      <text x={25 + i * 34} y="23" textAnchor="middle" fontSize="11" fill="#7b857b">{label}</text>
      <rect x={19 + i * 34} y="37" width="12" height="12" rx="2" fill="#414b43" />
    </g>)}
    <path d="M25 65h136" stroke="#c1c8b8" strokeWidth="3" />
  </>;
}
