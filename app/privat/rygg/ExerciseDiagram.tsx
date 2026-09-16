// Enkle strekfigur-diagrammer for ryggøvelsene — ingen eksterne bilder (ingen
// bildesøk-tilgang, og å hotlenke tilfeldige treningsbilder er upålitelig og
// kan vise feil teknikk, som er et reelt sikkerhetsproblem for en
// korsryggskade). Skjematiske, ikke anatomisk presise — selve
// teknikkinstruksen ligger i "how"/"cue"-teksten (lib/ryggExercises.ts),
// diagrammet er kun en rask visuell påminnelse om kroppsstillingen.
//
// Alle tegnes med currentColor i et felles 100×60-viewBox, slik at de arver
// seksjonens aksentfarge (samme mønster som DataStrips.tsx).

type Pt = readonly [number, number];

const STROKE = 3;

function Limb({ points }: { points: Pt[] }) {
  return (
    <polyline
      points={points.map(([x, y]) => `${x},${y}`).join(" ")}
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function Head({ cx, cy }: { cx: number; cy: number }) {
  return <circle cx={cx} cy={cy} r={5} fill="none" stroke="currentColor" strokeWidth={STROKE} />;
}

function Floor({ y = 54 }: { y?: number }) {
  return <line x1={4} y1={y} x2={96} y2={y} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1.5} />;
}

function Dumbbell({ cx, cy, vertical = true }: { cx: number; cy: number; vertical?: boolean }) {
  if (vertical) {
    return (
      <g>
        <rect x={cx - 1.2} y={cy - 4} width={2.4} height={8} rx={1} fill="currentColor" />
        <circle cx={cx} cy={cy - 5} r={2.2} fill="currentColor" />
        <circle cx={cx} cy={cy + 5} r={2.2} fill="currentColor" />
      </g>
    );
  }
  return (
    <g>
      <rect x={cx - 4} y={cy - 1.2} width={8} height={2.4} rx={1} fill="currentColor" />
      <circle cx={cx - 5} cy={cy} r={2.2} fill="currentColor" />
      <circle cx={cx + 5} cy={cy} r={2.2} fill="currentColor" />
    </g>
  );
}

function Bench({ x, y, w = 28, h = 6 }: { x: number; y: number; w?: number; h?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={1.5} fill="none" stroke="currentColor" strokeOpacity={0.4} strokeWidth={2} />;
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 100 60" className="h-full w-full" role="img" aria-hidden="true">
      {children}
    </svg>
  );
}

// ── Firfotstilling (katt-kamel, bird dog) ──────────────────────────────
function Quadruped({ liftedArmLeg }: { liftedArmLeg?: boolean }) {
  return (
    <Wrap>
      <Floor />
      <Head cx={78} cy={22} />
      <Limb points={[[73, 26], [40, 30]]} /> {/* rygg */}
      <Limb points={[[73, 26], [70, 40], [66, 54]]} /> {/* fremre bein (støtte) */}
      <Limb points={[[40, 30], [42, 44], [40, 54]]} /> {/* bakre bein (støtte) */}
      {liftedArmLeg ? (
        <>
          <Limb points={[[73, 28], [86, 16]]} /> {/* løftet arm frem */}
          <Limb points={[[40, 30], [26, 20]]} /> {/* løftet bein bak */}
        </>
      ) : (
        <>
          <Limb points={[[73, 28], [76, 40], [76, 54]]} /> {/* støttearm */}
          <Limb points={[[40, 30], [38, 44], [36, 54]]} /> {/* støttebein bak */}
        </>
      )}
    </Wrap>
  );
}

// ── Ryggliggende med bøyde knær (curl-up, hoftehev, dead bug) ──────────
function Supine({ variant }: { variant: "curlup" | "bridge" | "slbridge" | "deadbug" }) {
  const hipLift = variant === "bridge" || variant === "slbridge";
  const hipY = hipLift ? 36 : 46;
  return (
    <Wrap>
      <Floor />
      <Head cx={18} cy={46} />
      <Limb points={[[23, 46], [50, hipLift ? 40 : 46]]} /> {/* torso */}
      <Limb points={[[50, hipLift ? 40 : 46], [66, 30]]} /> {/* lår */}
      <Limb points={[[66, 30], [66, 54]]} /> {/* legg */}
      {variant === "slbridge" && <Limb points={[[50, 40], [78, 34]]} />}
      {variant === "curlup" && <Limb points={[[23, 44], [30, 50]]} />}
      {variant === "deadbug" && (
        <>
          <Limb points={[[26, 44], [26, 24]]} /> {/* arm rett opp */}
          <Limb points={[[26, 24], [10, 14]]} /> {/* arm senket bakover */}
          <Limb points={[[50, hipY], [50, 30], [40, 20]]} /> {/* motsatt bein strukket ned */}
        </>
      )}
    </Wrap>
  );
}

// ── Sideplanke (fra knær/føtter, med benløft) ──────────────────────────
function SidePlank({ variant }: { variant: "knee" | "full" | "leg" }) {
  return (
    <Wrap>
      <Floor />
      <Head cx={20} cy={28} />
      <Limb points={[[25, 30], [70, 38]]} /> {/* torso, rett linje */}
      <Limb points={[[25, 32], [24, 44], [20, 54]]} /> {/* støttearm ned til albue */}
      {variant === "knee" ? (
        <Limb points={[[70, 38], [66, 46], [66, 54]]} />
      ) : (
        <Limb points={[[70, 38], [80, 46], [90, 52]]} />
      )}
      {variant === "leg" && <Limb points={[[70, 38], [86, 30]]} />}
    </Wrap>
  );
}

// ── Stående hoftehengsel (markløft-varianter) ──────────────────────────
function HipHinge({ singleLeg }: { singleLeg?: boolean }) {
  return (
    <Wrap>
      <Floor />
      <Head cx={58} cy={16} />
      <Limb points={[[58, 21], [66, 36]]} /> {/* rygg, bøyd fremover */}
      <Limb points={[[66, 36], [64, 50], [64, 54]]} /> {/* standbein */}
      <Limb points={[[58, 24], [52, 44]]} /> {/* arm ned mot vekt */}
      <Dumbbell cx={52} cy={46} />
      {singleLeg ? (
        <Limb points={[[66, 36], [78, 30], [90, 26]]} />
      ) : (
        <Limb points={[[58, 24], [50, 44]]} />
      )}
    </Wrap>
  );
}

// ── Stående knebøy (goblet, splitt, opptrinn) ───────────────────────────
function Squat({ variant }: { variant: "goblet" | "split" | "stepup" }) {
  if (variant === "stepup") {
    return (
      <Wrap>
        <Floor />
        <Bench x={58} y={40} w={26} h={14} />
        <Head cx={64} cy={14} />
        <Limb points={[[64, 19], [64, 34]]} />
        <Limb points={[[64, 34], [66, 40], [66, 40]]} />
        <Limb points={[[64, 34], [50, 44], [46, 54]]} /> {/* bakre bein, gulv */}
        <Limb points={[[60, 22], [50, 30]]} />
      </Wrap>
    );
  }
  const offset = variant === "split";
  return (
    <Wrap>
      <Floor />
      <Head cx={50} cy={14} />
      <Limb points={[[50, 19], [50, 34]]} />
      {offset ? (
        <>
          <Limb points={[[50, 34], [40, 44], [38, 54]]} /> {/* fremre bein */}
          <Limb points={[[50, 34], [58, 44], [62, 54]]} /> {/* bakre kne mot gulv */}
        </>
      ) : (
        <>
          <Limb points={[[50, 34], [42, 46], [40, 54]]} />
          <Limb points={[[50, 34], [58, 46], [60, 54]]} />
        </>
      )}
      <Limb points={[[47, 22], [42, 34]]} />
      <Limb points={[[53, 22], [58, 34]]} />
      <Dumbbell cx={50} cy={30} />
    </Wrap>
  );
}

// ── Stående bæring (koffert, farmer's walk) ─────────────────────────────
function Carry({ bothSides }: { bothSides?: boolean }) {
  return (
    <Wrap>
      <Floor />
      <Head cx={50} cy={14} />
      <Limb points={[[50, 19], [50, 40]]} />
      <Limb points={[[50, 40], [44, 48], [42, 54]]} />
      <Limb points={[[50, 40], [56, 48], [58, 54]]} />
      <Limb points={[[46, 22], [40, 40]]} />
      <Dumbbell cx={40} cy={42} />
      {bothSides && (
        <>
          <Limb points={[[54, 22], [60, 40]]} />
          <Dumbbell cx={60} cy={42} />
        </>
      )}
    </Wrap>
  );
}

// ── Hoftebøyerstrekk (utfall, statisk) ───────────────────────────────────
function HipFlexStretch() {
  return (
    <Wrap>
      <Floor />
      <Head cx={40} cy={14} />
      <Limb points={[[40, 19], [42, 34]]} />
      <Limb points={[[42, 34], [34, 44], [30, 54]]} /> {/* fremre bein, bøyd */}
      <Limb points={[[42, 34], [56, 44], [60, 54]]} /> {/* bakre kne i gulvet */}
      <Limb points={[[38, 24], [48, 30]]} />
      <Limb points={[[42, 26], [50, 20]]} />
    </Wrap>
  );
}

// ── Hip thrust (skuldre på benk) ────────────────────────────────────────
function HipThrust() {
  return (
    <Wrap>
      <Floor />
      <Bench x={8} y={26} w={18} h={6} />
      <Head cx={16} cy={22} />
      <Limb points={[[20, 27], [50, 34]]} /> {/* rygg opp mot hofte */}
      <Limb points={[[50, 34], [66, 24]]} /> {/* lår opp */}
      <Limb points={[[66, 24], [66, 44]]} /> {/* legg ned */}
      <Dumbbell cx={50} cy={30} vertical={false} />
    </Wrap>
  );
}

const DIAGRAMS: Record<string, () => React.ReactElement> = {
  katt: () => <Quadruped />,
  birddog: () => <Quadruped liftedArmLeg />,
  curlup: () => <Supine variant="curlup" />,
  spknee: () => <SidePlank variant="knee" />,
  spfull: () => <SidePlank variant="full" />,
  spleg: () => <SidePlank variant="leg" />,
  deadbug: () => <Supine variant="deadbug" />,
  bridge: () => <Supine variant="bridge" />,
  slbridge: () => <Supine variant="slbridge" />,
  hipflex: () => <HipFlexStretch />,
  rdl: () => <HipHinge />,
  slrdl: () => <HipHinge singleLeg />,
  goblet: () => <Squat variant="goblet" />,
  suitcase: () => <Carry />,
  farmer: () => <Carry bothSides />,
  split: () => <Squat variant="split" />,
  stepup: () => <Squat variant="stepup" />,
  hipthrust: () => <HipThrust />,
};

export default function ExerciseDiagram({ exerciseId, className = "" }: { exerciseId: string; className?: string }) {
  const Diagram = DIAGRAMS[exerciseId];
  if (!Diagram) return null;
  return <div className={className}>{Diagram()}</div>;
}
