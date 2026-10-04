// KAI-125 — Ilustración del carro (vista lateral), compartida por la carretera del
// panel y la tarjeta del conductor ("Ilustración", opción B de D4). Dibujada con
// formas simples para que se vea bien a cualquier escala y se pueda exportar a PNG
// sin recursos externos. El origen (0, 0) es el punto medio entre las dos ruedas,
// a ras del piso; el carro mide 120 de ancho y 52 de alto.

export function CarroIlustrado({
  x = 0,
  y = 0,
  escala = 1,
  carroceria = '#002B4A',
  detalle = '#D9C4A1',
}: {
  x?: number
  y?: number
  escala?: number
  carroceria?: string
  detalle?: string
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`}>
      {/* sombra */}
      <ellipse cx="0" cy="2" rx="58" ry="5" fill="#000000" opacity="0.12" />
      {/* carrocería */}
      <path
        d="M-60 -10 Q-60 -22 -48 -24 L-30 -26 L-14 -44 Q-10 -48 -4 -48 L22 -48 Q28 -48 32 -44 L44 -28 L54 -26 Q60 -24 60 -16 L60 -10 Q60 -6 56 -6 L-56 -6 Q-60 -6 -60 -10 Z"
        fill={carroceria}
      />
      {/* ventanas */}
      <path d="M-24 -28 L-12 -42 Q-10 -44 -7 -44 L6 -44 L6 -28 Z" fill="#E6F1FB" />
      <path d="M10 -44 L21 -44 Q25 -44 28 -41 L38 -28 L10 -28 Z" fill="#E6F1FB" />
      {/* franja y luces */}
      <rect x="-54" y="-18" width="108" height="3" rx="1.5" fill={detalle} />
      <rect x="52" y="-22" width="7" height="5" rx="2" fill="#FAC775" />
      <rect x="-59" y="-22" width="5" height="5" rx="2" fill="#F09595" />
      {/* ruedas */}
      <circle cx="-34" cy="-6" r="12" fill="#2C2C2A" />
      <circle cx="34" cy="-6" r="12" fill="#2C2C2A" />
      <circle cx="-34" cy="-6" r="5" fill="#B4B2A9" />
      <circle cx="34" cy="-6" r="5" fill="#B4B2A9" />
    </g>
  )
}
