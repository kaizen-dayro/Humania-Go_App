// KAI-125 — Ilustración del carro (vista lateral), compartida por la carretera del
// panel y la tarjeta del conductor ("Ilustración", opción B de D4). Dibujada con
// formas simples para que se vea bien a cualquier escala y se pueda exportar a PNG
// sin recursos externos. El origen (0, 0) es el punto medio entre las dos ruedas,
// a ras del piso; el carro mide 120 de ancho y 52 de alto y mira hacia la
// derecha (sentido de avance de la carretera): luz delantera amarilla a la
// derecha, luz trasera roja a la izquierda.

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
      {/* carrocería: el frente (capó y parabrisas) mira a la derecha, hacia la meta */}
      <path
        d="M60 -10 Q60 -22 48 -24 L30 -26 L14 -44 Q10 -48 4 -48 L-22 -48 Q-28 -48 -32 -44 L-44 -28 L-54 -26 Q-60 -24 -60 -16 L-60 -10 Q-60 -6 -56 -6 L56 -6 Q60 -6 60 -10 Z"
        fill={carroceria}
      />
      {/* ventanas */}
      <path d="M24 -28 L12 -42 Q10 -44 7 -44 L-6 -44 L-6 -28 Z" fill="#E6F1FB" />
      <path d="M-10 -44 L-21 -44 Q-25 -44 -28 -41 L-38 -28 L-10 -28 Z" fill="#E6F1FB" />
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
