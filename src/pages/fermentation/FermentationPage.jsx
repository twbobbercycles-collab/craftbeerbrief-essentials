/**
 * FermentationPage — Fermentation Tracker for the Operations tier.
 * Shows a vessel dashboard with SVG tank illustrations, gravity sparkline charts,
 * pending assignment queue, and full detail view with gravity log.
 * URL: /fermentation
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../services/supabase'
import TierGate from '../../components/TierGate'
import ModalShell from '../../components/ModalShell'
import LoadingSpinner from '../../components/LoadingSpinner'
import { useModalDraft } from '../../hooks/useModalDraft'
import { useReadOnly } from '../../hooks/useReadOnly'

// ─── Constants ────────────────────────────────────────────────────────────────

const VESSEL_TYPES = [
  'Conical Fermenter', 'Unitank', 'Bright Tank', 'Open Fermenter',
  'Barrel', 'Brite Beer Tank', 'Other',
]

const FERM_TYPE_LABELS = {
  standard:           'Standard',
  open_fermentation:  'Open Fermentation',
  mixed_fermentation: 'Mixed Fermentation',
  spontaneous:        'Spontaneous',
  kveik:              'Kveik',
  cold_fermentation:  'Cold Fermentation',
}

const STATUS_LABELS = {
  pending_assignment: 'Pending Assignment',
  fermenting:         'Fermenting',
  conditioning:       'Conditioning',
  lagering:           'Lagering',
  ready_to_package:   'Ready to Package',
  packaged:           'Packaged',
  dumped:             'Dumped',
}

const STATUS_STYLES = {
  pending_assignment: 'bg-gray-100 text-gray-600',
  fermenting:         'bg-amber/15 text-amber',
  conditioning:       'bg-blue-100 text-blue-700',
  lagering:           'bg-indigo-100 text-indigo-700',
  ready_to_package:   'bg-green-100 text-success',
  packaged:           'bg-teal-100 text-teal-700',
  dumped:             'bg-red-100 text-danger',
}

// Maps each status to the valid next statuses (null = no progression)
const STATUS_TRANSITIONS = {
  pending_assignment: ['fermenting'],
  fermenting:         ['conditioning', 'ready_to_package'],
  conditioning:       ['lagering', 'ready_to_package'],
  lagering:           ['ready_to_package'],
  ready_to_package:   ['packaged'],
  packaged:           [],
  dumped:             [],
}

const INPUT_CLS = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber disabled:bg-gray-50 disabled:text-gray-400'
const LBL = 'block text-xs text-gray-500 mb-1'

// ─── Entry Point — TierGate wrapper ──────────────────────────────────────────

export default function FermentationPage() {
  return (
    <TierGate
      requiredTier="operations"
      featureKey="fermentation_tracker"
      featureName="Fermentation Tracker"
      featureDescription="Track every batch from pitch to package. Assign vessels, log gravity readings, monitor attenuation, and schedule dry hops — all in one place."
    >
      <FermentationTracker />
    </TierGate>
  )
}

// ─── Main Tracker ─────────────────────────────────────────────────────────────

function FermentationTracker() {
  const { brewery } = useAuth()
  const { isReadOnly, ReadOnlyTooltip } = useReadOnly()

  const [vessels, setVessels]         = useState([])
  const [fermentations, setFermentations] = useState([]) // all non-packaged/dumped
  const [gravityMap, setGravityMap]   = useState({})     // fermentation_id → readings[]
  const [loading, setLoading]         = useState(true)

  // Modal open state — one state per modal type
  const [manageOpen, setManageOpen]       = useState(false)
  const [addFermOpen, setAddFermOpen]     = useState(false)
  const [logTarget, setLogTarget]         = useState(null)  // fermentation to log reading for
  const [assignTarget, setAssignTarget]   = useState(null)  // { fermentation?, vessel? }
  const [detailTarget, setDetailTarget]   = useState(null)  // fermentation object for detail view

  // Load vessels and all active fermentations, then their gravity readings in one pass
  const loadData = useCallback(async () => {
    if (!brewery?.id) return
    setLoading(true)

    // Use .in() for the statuses we WANT rather than .not().in() to avoid
    // Supabase PostgREST syntax edge cases that can silently drop rows.
    const ACTIVE_STATUSES = ['pending_assignment', 'fermenting', 'conditioning', 'lagering', 'ready_to_package']

    const [vRes, fRes] = await Promise.all([
      supabase.from('fermentation_vessels')
        .select('*')
        .eq('brewery_id', brewery.id)
        .eq('is_active', true)
        .order('sort_order'),
      supabase.from('fermentations')
        .select('*')
        .eq('brewery_id', brewery.id)
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false }),
    ])

    const vList = vRes.data ?? []
    const fList = fRes.data ?? []

    // Debug: log what came back so we can confirm data is reaching the component
    console.log('[FermentationTracker] vessels loaded:', vList.length, vList.map(v => v.vessel_name))
    console.log('[FermentationTracker] fermentations loaded:', fList.length, fList.map(f => `${f.beer_name} (${f.status})`))
    const pendingCount = fList.filter(f => f.status === 'pending_assignment').length
    console.log('[FermentationTracker] pending_assignment count:', pendingCount)
    if (fRes.error) console.error('[FermentationTracker] fermentations query error:', fRes.error)

    setVessels(vList)
    setFermentations(fList)

    // Fetch all gravity readings for these fermentations in one query
    if (fList.length > 0) {
      const ids = fList.map(f => f.id)
      const { data: readings } = await supabase
        .from('gravity_readings')
        .select('*')
        .in('fermentation_id', ids)
        .eq('reading_type', 'gravity')
        .order('reading_date', { ascending: true })

      const map = {}
      for (const r of readings ?? []) {
        if (!map[r.fermentation_id]) map[r.fermentation_id] = []
        map[r.fermentation_id].push(r)
      }
      setGravityMap(map)
    } else {
      setGravityMap({})
    }

    setLoading(false)
  }, [brewery?.id])

  useEffect(() => { loadData() }, [loadData])

  // Pending fermentations — no vessel assigned yet
  const pending = fermentations.filter(f => f.status === 'pending_assignment')

  // Map vessel_id → fermentation for the vessel grid
  const vesselFermMap = useMemo(() => {
    const map = {}
    for (const f of fermentations) {
      if (f.vessel_id) map[f.vessel_id] = f
    }
    return map
  }, [fermentations])

  // Empty vessels — no active fermentation assigned
  const emptyVessels = vessels.filter(v => !vesselFermMap[v.id])

  if (loading) return <LoadingSpinner message="Loading fermentation tracker..." />

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-navy">Fermentation Tracker</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setManageOpen(true)}
            className="text-sm border border-gray-300 text-gray-700 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
          >
            Manage Vessels
          </button>
          <button
            onClick={() => setAddFermOpen(true)}
            disabled={isReadOnly}
            className="text-sm bg-amber hover:bg-amber-dark text-white rounded-lg px-4 py-2 font-semibold transition-colors disabled:opacity-50"
          >
            + Add Fermentation
          </button>
        </div>
      </div>

      {/* Pending assignment section — always rendered so we can diagnose empty vs hidden.
          When no pending fermentations exist it shows a quiet "none pending" note. */}
      <PendingSection
        fermentations={pending}
        vessels={vessels}
        onAssign={f => setAssignTarget({ fermentation: f })}
        isReadOnly={isReadOnly}
      />

      {/* No vessels setup card */}
      {vessels.length === 0 ? (
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-10 text-center">
          <p className="text-4xl mb-3">🧪</p>
          <h3 className="font-bold text-navy text-lg mb-2">Set Up Your Fermentation Vessels</h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto mb-5">
            Add each fermenter, bright tank, and conditioning vessel in your brewery to start tracking
            batches from pitch to package.
          </p>
          <button
            onClick={() => setManageOpen(true)}
            className="bg-amber hover:bg-amber-dark text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors"
          >
            Add Your First Vessel
          </button>
        </div>
      ) : (
        /* Vessel grid — 3 columns on desktop, 2 on tablet, 1 on mobile */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {vessels.map(v => {
            const ferm = vesselFermMap[v.id] ?? null
            return (
              <VesselCard
                key={v.id}
                vessel={v}
                fermentation={ferm}
                readings={gravityMap[ferm?.id ?? ''] ?? []}
                onLogReading={setLogTarget}
                onViewDetail={setDetailTarget}
                onAssignEmpty={() => setAssignTarget({ vessel: v })}
                isReadOnly={isReadOnly}
              />
            )
          })}
        </div>
      )}

      {/* ── Modals ── */}

      {manageOpen && (
        <ManageVesselsModal
          vessels={vessels}
          onClose={() => setManageOpen(false)}
          onChanged={loadData}
        />
      )}

      {addFermOpen && (
        <AddFermentationModal
          onClose={() => setAddFermOpen(false)}
          onSaved={() => { setAddFermOpen(false); loadData() }}
        />
      )}

      {logTarget && (
        <LogReadingModal
          fermentation={logTarget}
          onClose={() => setLogTarget(null)}
          onSaved={() => { setLogTarget(null); loadData() }}
        />
      )}

      {assignTarget && (
        <AssignVesselModal
          preSelectedFermentation={assignTarget.fermentation ?? null}
          preSelectedVessel={assignTarget.vessel ?? null}
          fermentations={pending}
          vessels={emptyVessels}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => { setAssignTarget(null); loadData() }}
        />
      )}

      {detailTarget && (
        <FermentationDetailModal
          fermentation={detailTarget}
          vessels={vessels}
          readings={gravityMap[detailTarget.id] ?? []}
          onClose={() => { setDetailTarget(null); loadData() }}
          onUpdated={updated => {
            setDetailTarget(updated)
            setFermentations(prev => prev.map(f => f.id === updated.id ? updated : f))
          }}
          onReadingChanged={loadData}
        />
      )}
    </div>
  )
}

// ─── PendingSection ───────────────────────────────────────────────────────────
// Collapsible list of fermentations waiting to be assigned to a vessel.

function PendingSection({ fermentations, vessels, onAssign, isReadOnly }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="bg-amber/5 border border-amber/30 rounded-xl overflow-hidden">
      {/* Header row — click to collapse */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-amber font-semibold text-sm">
            ⏳ Awaiting Vessel Assignment
          </span>
          {fermentations.length > 0 && (
            <span className="bg-amber text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {fermentations.length}
            </span>
          )}
        </div>
        <span className="text-gray-400 text-xs">{open ? '▲ Hide' : '▼ Show'}</span>
      </button>

      {open && (
        fermentations.length === 0 ? (
          /* Shown when section renders but no pending records exist — confirms the section itself is visible */
          <p className="px-5 pb-4 text-xs text-gray-400 italic">
            No pending assignments — all fermentation batches have vessels assigned.
          </p>
        ) : (
          <div className="divide-y divide-amber/10">
            {fermentations.map(f => {
              const brewDate = f.pitch_date
                ? new Date(f.pitch_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '—'
              return (
                <div key={f.id} className="flex items-center justify-between px-5 py-3 flex-wrap gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy text-sm">{f.beer_name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-0.5">
                      {f.batch_number && <span className="font-mono bg-navy/10 text-navy px-1.5 py-0.5 rounded text-[10px] font-bold">{f.batch_number}</span>}
                      <span>Brew date: {brewDate}</span>
                      {f.volume_in_fermenter && <span>{f.volume_in_fermenter} {f.volume_unit}</span>}
                      {f.yeast_strain && <span>Yeast: {f.yeast_strain}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => onAssign(f)}
                    disabled={isReadOnly || vessels.filter(v => v.is_active).length === 0}
                    className="shrink-0 text-xs bg-amber hover:bg-amber-dark text-white rounded-lg px-3 py-1.5 font-semibold transition-colors disabled:opacity-50"
                  >
                    Assign Vessel
                  </button>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}

// ─── TankSVG ──────────────────────────────────────────────────────────────────
// Dispatches to the correct vessel-type illustration based on vessel_type prop.
// All variants share the same color/fill/bubble logic via helper functions.

// Returns fill color and border color for a given fermentation status
function tankColors(status) {
  const fill = {
    fermenting:       '#F59E0B',
    conditioning:     '#93C5FD',
    lagering:         '#BFDBFE',
    ready_to_package: '#86EFAC',
  }[status] ?? '#E5E7EB'
  const border = {
    fermenting:       '#D97706',
    ready_to_package: '#16A34A',
    conditioning:     '#3B82F6',
    lagering:         '#6366F1',
  }[status] ?? '#D1D5DB'
  return { fill, border }
}

// Overlay icon rendered in the centre of any vessel when not actively fermenting
function StatusOverlay({ status, cx, cy }) {
  if (status === 'conditioning' || status === 'lagering')
    return <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="22" fill="#3B82F6" opacity="0.65">❄</text>
  if (status === 'ready_to_package')
    return <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="22" fill="#16A34A" opacity="0.85">✓</text>
  return null
}

// Four animated bubbles clipped to rise only within the supplied rect bounds
function Bubbles({ clipId, fillY, fillH, bodyTop, status }) {
  if (status !== 'fermenting' || fillH < 20) return null
  const top = bodyTop + 10
  const bottom = fillY + fillH - 4
  return (
    <>
      <circle cx="38" cy={bottom} r="2.5" fill="rgba(255,255,255,0.75)" clipPath={`url(#${clipId})`}>
        <animate attributeName="cy" values={`${bottom};${top}`} dur="2.1s" repeatCount="indefinite" begin="0s" />
        <animate attributeName="opacity" values="0.75;0" dur="2.1s" repeatCount="indefinite" begin="0s" />
      </circle>
      <circle cx="60" cy={bottom - 10} r="2" fill="rgba(255,255,255,0.65)" clipPath={`url(#${clipId})`}>
        <animate attributeName="cy" values={`${bottom - 10};${top}`} dur="2.6s" repeatCount="indefinite" begin="0.7s" />
        <animate attributeName="opacity" values="0.65;0" dur="2.6s" repeatCount="indefinite" begin="0.7s" />
      </circle>
      <circle cx="72" cy={bottom - 5} r="3" fill="rgba(255,255,255,0.55)" clipPath={`url(#${clipId})`}>
        <animate attributeName="cy" values={`${bottom - 5};${top}`} dur="2.3s" repeatCount="indefinite" begin="1.3s" />
        <animate attributeName="opacity" values="0.55;0" dur="2.3s" repeatCount="indefinite" begin="1.3s" />
      </circle>
      <circle cx="48" cy={bottom - 18} r="1.5" fill="rgba(255,255,255,0.65)" clipPath={`url(#${clipId})`}>
        <animate attributeName="cy" values={`${bottom - 18};${top}`} dur="1.9s" repeatCount="indefinite" begin="0.3s" />
        <animate attributeName="opacity" values="0.65;0" dur="1.9s" repeatCount="indefinite" begin="0.3s" />
      </circle>
    </>
  )
}

// Route to the right illustration based on vessel_type string
function TankSVG({ uid, fillPct = 0, status = 'empty', vesselType = 'Conical Fermenter' }) {
  const type = vesselType ?? 'Conical Fermenter'
  const props = { uid, fillPct, status }
  if (type === 'Barrel')                                   return <BarrelSVG {...props} />
  if (type === 'Open Fermenter')                           return <OpenFermenterSVG {...props} />
  if (type === 'Bright Tank' || type === 'Brite Beer Tank') return <BrightTankSVG {...props} />
  // Conical Fermenter, Unitank, Other — all use the conical shape
  return <ConicalSVG {...props} />
}

// ── Conical Fermenter / Unitank / Other ───────────────────────────────────────
// Tall cylinder with dome top, conical bottom tapering to a point, legs below.

function ConicalSVG({ uid, fillPct, status }) {
  // Geometry (viewBox 120 × 220)
  const cx = 60
  const bodyX = 20, bodyW = 80, bodyTop = 22, bodyH = 100
  // Cone: from bottom of cylinder down to a point
  const coneTop = bodyTop + bodyH      // y = 122
  const coneTip = coneTop + 58         // y = 180 — tip of the cone
  const ey = 9                         // ellipse y-radius for 3D caps
  // Legs
  const legY1 = coneTip + 2, legY2 = coneTip + 28
  const legLX = cx - 18, legRX = cx + 18

  const safeFill = Math.min(Math.max(fillPct, 0), 100)
  // Fill splits: cone fills first (bottom), then cylinder body
  const totalH = bodyH + 58 // total height of liquid space
  const fillPx = Math.round(totalH * safeFill / 100)
  const coneH  = 58
  // How much of the cone is filled vs how much spills into the cylinder body
  const coneFillH  = Math.min(fillPx, coneH)
  const bodyFillH  = Math.max(0, fillPx - coneH)
  const bodyFillY  = bodyTop + bodyH - bodyFillH

  const { fill, border } = tankColors(status)
  const clipId = `cc-${uid}`

  // Clip path: union of cylinder body + cone area
  // We use a polygon covering cylinder + cone to clip the fill
  const cylLeft = bodyX, cylRight = bodyX + bodyW
  // Cone narrows from cylLeft/cylRight at coneTop to cx at coneTip
  const clipPoints = [
    `${cylLeft},${bodyTop}`,
    `${cylRight},${bodyTop}`,
    `${cylRight},${coneTop}`,
    `${cx},${coneTip}`,
    `${cylLeft},${coneTop}`,
  ].join(' ')

  return (
    <svg viewBox="0 0 120 220" width={110} height={190} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <polygon points={clipPoints} />
        </clipPath>
      </defs>

      {/* ── Body background ── */}
      <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH} fill="#F9FAFB" />
      {/* Cone background */}
      <polygon
        points={`${cylLeft},${coneTop} ${cylRight},${coneTop} ${cx},${coneTip}`}
        fill="#F0F0F0"
      />

      {/* ── Liquid fill ── */}
      {fillPx > 0 && (
        <polygon
          points={`${cylLeft},${bodyFillH > 0 ? bodyFillY : coneTop} ${cylRight},${bodyFillH > 0 ? bodyFillY : coneTop} ${cylRight},${coneTop} ${cx},${coneTip}`}
          fill={fill} opacity="0.72"
          clipPath={`url(#${clipId})`}
        />
      )}
      {bodyFillH > 0 && (
        <rect x={bodyX} y={bodyFillY} width={bodyW} height={bodyFillH}
          fill={fill} opacity="0.72" />
      )}

      {/* ── Dome top cap (ellipse, drawn last so it sits above fill) ── */}
      {/* Dome arc: use a path for a rounder cap */}
      <path
        d={`M ${bodyX},${bodyTop} A ${bodyW/2},${ey * 2.5} 0 0,1 ${bodyX + bodyW},${bodyTop}`}
        fill="#ECEFF4" stroke={border} strokeWidth="1.5"
      />
      <line x1={bodyX} y1={bodyTop} x2={bodyX} y2={bodyTop + 4} stroke={border} strokeWidth="1.5" />
      <line x1={bodyX + bodyW} y1={bodyTop} x2={bodyX + bodyW} y2={bodyTop + 4} stroke={border} strokeWidth="1.5" />

      {/* ── Cylinder body border ── */}
      <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH}
        fill="none" stroke={border} strokeWidth="1.5" />

      {/* ── Top ellipse (3D lip) ── */}
      <ellipse cx={cx} cy={bodyTop} rx={bodyW / 2} ry={ey}
        fill="#ECEFF4" stroke={border} strokeWidth="1.5" />

      {/* ── Bottom ellipse at base of cylinder (transition to cone) ── */}
      <ellipse cx={cx} cy={coneTop} rx={bodyW / 2} ry={ey}
        fill={bodyFillH > 0 ? fill : '#E0E0E0'}
        opacity={bodyFillH > 0 ? '0.72' : '1'}
        stroke={border} strokeWidth="1.5" />

      {/* ── Cone outline ── */}
      <line x1={cylLeft} y1={coneTop} x2={cx} y2={coneTip} stroke={border} strokeWidth="1.5" />
      <line x1={cylRight} y1={coneTop} x2={cx} y2={coneTip} stroke={border} strokeWidth="1.5" />

      {/* ── Small port/valve on cone side ── */}
      <rect x={cx + 14} y={coneTop + 18} width={10} height={6} rx="1"
        fill="#E5E7EB" stroke={border} strokeWidth="1" />
      <circle cx={cx + 19} cy={coneTop + 21} r="2" fill={border} opacity="0.5" />

      {/* ── Legs ── */}
      <line x1={legLX} y1={coneTip} x2={legLX - 6} y2={legY2} stroke={border} strokeWidth="2" strokeLinecap="round" />
      <line x1={legRX} y1={coneTip} x2={legRX + 6} y2={legY2} stroke={border} strokeWidth="2" strokeLinecap="round" />
      {/* Leg feet */}
      <line x1={legLX - 10} y1={legY2} x2={legLX - 2} y2={legY2} stroke={border} strokeWidth="2" strokeLinecap="round" />
      <line x1={legRX + 2}  y1={legY2} x2={legRX + 10} y2={legY2} stroke={border} strokeWidth="2" strokeLinecap="round" />

      {/* ── Bubbles (clipped to cylinder body only) ── */}
      <Bubbles clipId={clipId} fillY={bodyFillY} fillH={bodyFillH} bodyTop={bodyTop} status={status} />

      {/* ── Status icon (centre of cylinder body) ── */}
      <StatusOverlay status={status} cx={cx} cy={bodyTop + bodyH / 2} />

      {/* Empty label */}
      {!fillPx && status === 'empty' && (
        <text x={cx} y={bodyTop + bodyH / 2 + 4} textAnchor="middle" fontSize="10" fill="#9CA3AF">Empty</text>
      )}
    </svg>
  )
}

// ── Bright Tank / Brite Beer Tank ─────────────────────────────────────────────
// Wider cylinder with a rounded dome bottom and a pressure gauge on the side.

function BrightTankSVG({ uid, fillPct, status }) {
  const cx = 60
  const bodyX = 15, bodyW = 90, bodyTop = 24, bodyH = 95
  const ey = 10
  // Dome bottom: a half-ellipse beneath the cylinder
  const domeH = 30
  const domeBottom = bodyTop + bodyH + domeH

  const safeFill = Math.min(Math.max(fillPct, 0), 100)
  const totalH = bodyH + domeH
  const fillPx = Math.round(totalH * safeFill / 100)
  const bodyFillH = Math.max(0, fillPx - domeH)
  const bodyFillY = bodyTop + bodyH - bodyFillH

  const { fill, border } = tankColors(status)
  const clipId = `bt-${uid}`

  return (
    <svg viewBox="0 0 120 200" width={110} height={175} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH + domeH + 5} />
        </clipPath>
      </defs>

      {/* Dome bottom background */}
      <path
        d={`M ${bodyX},${bodyTop + bodyH} Q ${cx},${domeBottom + 8} ${bodyX + bodyW},${bodyTop + bodyH}`}
        fill="#F0F0F0" stroke="none"
      />
      {/* Body background */}
      <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH} fill="#F9FAFB" />

      {/* Fill in dome */}
      {fillPx > 0 && (
        <path
          d={`M ${bodyX},${bodyTop + bodyH} Q ${cx},${domeBottom + 8} ${bodyX + bodyW},${bodyTop + bodyH} Z`}
          fill={fill} opacity="0.72"
        />
      )}
      {/* Fill in body */}
      {bodyFillH > 0 && (
        <rect x={bodyX} y={bodyFillY} width={bodyW} height={bodyFillH}
          fill={fill} opacity="0.72" />
      )}

      {/* Dome outline */}
      <path
        d={`M ${bodyX},${bodyTop + bodyH} Q ${cx},${domeBottom + 8} ${bodyX + bodyW},${bodyTop + bodyH}`}
        fill="none" stroke={border} strokeWidth="1.5"
      />

      {/* Body border */}
      <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH}
        fill="none" stroke={border} strokeWidth="1.5" />

      {/* Top dome cap */}
      <path
        d={`M ${bodyX},${bodyTop} A ${bodyW/2},14 0 0,1 ${bodyX + bodyW},${bodyTop}`}
        fill="#ECEFF4" stroke={border} strokeWidth="1.5"
      />
      <line x1={bodyX} y1={bodyTop} x2={bodyX} y2={bodyTop + 4} stroke={border} strokeWidth="1.5" />
      <line x1={bodyX + bodyW} y1={bodyTop} x2={bodyX + bodyW} y2={bodyTop + 4} stroke={border} strokeWidth="1.5" />

      {/* Top ellipse lip */}
      <ellipse cx={cx} cy={bodyTop} rx={bodyW / 2} ry={ey}
        fill="#ECEFF4" stroke={border} strokeWidth="1.5" />

      {/* Pressure gauge circle on side */}
      <circle cx={bodyX + 14} cy={bodyTop + bodyH / 2} r="8"
        fill="#E5E7EB" stroke={border} strokeWidth="1" />
      <line x1={bodyX + 14} y1={bodyTop + bodyH/2 - 5} x2={bodyX + 14} y2={bodyTop + bodyH/2 + 1}
        stroke={border} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={bodyX + 14} y1={bodyTop + bodyH/2} x2={bodyX + 18} y2={bodyTop + bodyH/2 - 2}
        stroke={border} strokeWidth="1.5" strokeLinecap="round" />

      {/* Bubbles */}
      <Bubbles clipId={clipId} fillY={bodyFillY} fillH={bodyFillH} bodyTop={bodyTop} status={status} />

      <StatusOverlay status={status} cx={cx} cy={bodyTop + bodyH / 2} />
      {!fillPx && status === 'empty' && (
        <text x={cx} y={bodyTop + bodyH / 2 + 4} textAnchor="middle" fontSize="10" fill="#9CA3AF">Empty</text>
      )}
    </svg>
  )
}

// ── Open Fermenter ────────────────────────────────────────────────────────────
// Wide shallow tub viewed from a slight isometric angle, open top, stave lines.

function OpenFermenterSVG({ uid, fillPct, status }) {
  // A shallow trapezoid viewed from above at a slight angle: wider at top, slight perspective
  const cx = 65
  // Outer tub: wide rectangle with angled sides (trapezoid for depth)
  const tubTop = 45, tubH = 65
  const outerW = 110, innerW = 90
  const leftX  = (130 - outerW) / 2  // 10
  const rightX = leftX + outerW       // 120
  // Inner bottom (slightly narrower for depth illusion)
  const innerLeft  = (130 - innerW) / 2  // 20
  const innerRight = innerLeft + innerW   // 110
  const innerTop   = tubTop + 10, innerH = tubH - 14
  const ey = 8

  const safeFill = Math.min(Math.max(fillPct, 0), 100)
  const fillH = Math.round(tubH * safeFill / 100)
  const fillY = tubTop + tubH - fillH

  const { fill, border } = tankColors(status)

  // Stave lines (vertical wood lines on the side)
  const staveXs = [leftX + 16, leftX + 32, leftX + 48, leftX + 65, leftX + 81, leftX + 96]

  return (
    <svg viewBox="0 0 130 150" width={120} height={130} aria-hidden="true">
      {/* Tub side walls — front face (trapezoid) */}
      <rect x={leftX} y={tubTop} width={outerW} height={tubH} fill="#F9FAFB" rx="3" />

      {/* Vertical stave lines for wood texture */}
      {staveXs.map((x, i) => (
        <line key={i} x1={x} y1={tubTop + 4} x2={x} y2={tubTop + tubH - 4}
          stroke="#E0D8CC" strokeWidth="1" />
      ))}

      {/* Fill */}
      {fillH > 0 && (
        <rect x={leftX} y={fillY} width={outerW} height={fillH}
          fill={fill} opacity="0.72" rx="2" />
      )}

      {/* Tub border */}
      <rect x={leftX} y={tubTop} width={outerW} height={tubH}
        fill="none" stroke={border} strokeWidth="2" rx="3" />

      {/* Top rim ellipse — open top */}
      <ellipse cx={cx} cy={tubTop} rx={outerW / 2} ry={ey}
        fill={fillH > 0 ? fill : '#ECEFF4'} fillOpacity={fillH > 0 ? '0.5' : '1'}
        stroke={border} strokeWidth="2" />

      {/* Bottom ellipse for depth */}
      <ellipse cx={cx} cy={tubTop + tubH} rx={outerW / 2 - 4} ry={ey - 2}
        fill="none" stroke={border} strokeWidth="1.5" />

      {/* Horizontal hoop bands */}
      {[tubTop + tubH * 0.28, tubTop + tubH * 0.65].map((y, i) => (
        <rect key={i} x={leftX - 2} y={y - 3} width={outerW + 4} height={6}
          fill="#D4C9B8" stroke={border} strokeWidth="0.5" rx="1" opacity="0.8" />
      ))}

      <StatusOverlay status={status} cx={cx} cy={tubTop + tubH / 2} />
      {!fillH && status === 'empty' && (
        <text x={cx} y={tubTop + tubH / 2 + 4} textAnchor="middle" fontSize="10" fill="#9CA3AF">Empty</text>
      )}
    </svg>
  )
}

// ── Barrel ────────────────────────────────────────────────────────────────────
// Classic barrel shape: wider in the middle, narrowing at top and bottom,
// with horizontal hoop bands.

function BarrelSVG({ uid, fillPct, status }) {
  const cx = 60, cy_mid = 95
  const W = 120, H = 175
  // The barrel outline is a path with cubic bezier curves for the bulge
  const topY = 20, botY = 165, midY = 92
  const topHalfW = 38, midHalfW = 52, botHalfW = 38

  const safeFill = Math.min(Math.max(fillPct, 0), 100)
  const fillH = (botY - topY) * safeFill / 100
  const fillTopY = botY - fillH

  const { fill, border } = tankColors(status)
  const clipId = `bar-${uid}`

  // Barrel outline path (right side, then mirrored for left)
  const barrelPath = `
    M ${cx - topHalfW},${topY}
    C ${cx - midHalfW},${topY + 40} ${cx - midHalfW},${midY + 30} ${cx - botHalfW},${botY}
    L ${cx + botHalfW},${botY}
    C ${cx + midHalfW},${midY + 30} ${cx + midHalfW},${topY + 40} ${cx + topHalfW},${topY}
    Z
  `

  // Hoop positions
  const hoops = [topY + 8, topY + 22, midY - 2, botY - 22, botY - 8]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={110} height={165} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d={barrelPath} />
        </clipPath>
      </defs>

      {/* Barrel body background */}
      <path d={barrelPath} fill="#F5F0E8" />

      {/* Fill — clipped to barrel shape */}
      {fillH > 0 && (
        <rect x={cx - midHalfW - 2} y={fillTopY} width={(midHalfW + 2) * 2} height={fillH + 5}
          fill={fill} opacity="0.72" clipPath={`url(#${clipId})`} />
      )}

      {/* Barrel outline */}
      <path d={barrelPath} fill="none" stroke={border} strokeWidth="2" />

      {/* Hoop bands */}
      {hoops.map((hy, i) => {
        // Calculate barrel half-width at this y using rough interpolation
        const t = (hy - topY) / (botY - topY)
        const hw = topHalfW + (midHalfW - topHalfW) * Math.sin(t * Math.PI) * 1.1
        return (
          <ellipse key={i} cx={cx} cy={hy} rx={hw} ry={5}
            fill="none" stroke={border} strokeWidth="2.5" opacity="0.85" />
        )
      })}

      {/* Top and bottom flat face ellipses */}
      <ellipse cx={cx} cy={topY} rx={topHalfW} ry={6}
        fill="#ECEFF4" stroke={border} strokeWidth="1.5" />
      <ellipse cx={cx} cy={botY} rx={botHalfW} ry={6}
        fill={fillH > 0 ? fill : '#E0D8CC'} fillOpacity={fillH > 0 ? '0.72' : '1'}
        stroke={border} strokeWidth="1.5" />

      {/* Bung hole */}
      <ellipse cx={cx} cy={midY - 10} rx={5} ry={3}
        fill="#D4C9B8" stroke={border} strokeWidth="1" />

      <StatusOverlay status={status} cx={cx} cy={midY} />
      {!fillH && status === 'empty' && (
        <text x={cx} y={midY + 4} textAnchor="middle" fontSize="10" fill="#9CA3AF">Empty</text>
      )}
    </svg>
  )
}

// ─── MiniSparkline ────────────────────────────────────────────────────────────
// Compact recharts gravity chart for the vessel card. No axis labels.

function MiniSparkline({ readings, targetFg, fermentation }) {
  if (readings.length === 0) {
    return (
      <div className="h-20 flex items-center justify-center border border-dashed border-gray-200 rounded-lg">
        <p className="text-xs text-gray-400">Log gravity to see trend</p>
      </div>
    )
  }

  if (readings.length === 1) {
    return (
      <div className="h-20 flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center">
          <p className="text-base font-bold text-amber">{parseFloat(readings[0].gravity).toFixed(3)}</p>
          <p className="text-[11px] text-gray-400">1 reading</p>
        </div>
      </div>
    )
  }

  // Build chart data using days-since-pitch as x-axis
  const pitchDate = fermentation?.pitch_date ? new Date(fermentation.pitch_date + 'T00:00:00') : null
  const data = readings.map(r => ({
    day: pitchDate ? Math.round((new Date(r.reading_date + 'T00:00:00') - pitchDate) / 86400000) : null,
    gravity: parseFloat(r.gravity),
  }))

  const gravities = data.map(d => d.gravity)
  const tFg = targetFg ? parseFloat(targetFg) : null
  const minG = Math.min(...gravities, tFg ?? Infinity) - 0.002
  const maxG = Math.max(...gravities) + 0.002
  const latestG = gravities.at(-1)
  const isNearTarget = tFg !== null && latestG !== undefined && latestG <= tFg + 0.003
  const lineColor = isNearTarget ? '#22C55E' : '#F59E0B'

  return (
    <ResponsiveContainer width="100%" height={80}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        {tFg !== null && (
          <ReferenceLine y={tFg} stroke="#D1D5DB" strokeDasharray="4 2" strokeWidth={1} />
        )}
        <Line
          type="monotone"
          dataKey="gravity"
          stroke={lineColor}
          strokeWidth={2}
          dot={{ r: 3, fill: lineColor, strokeWidth: 0 }}
          isAnimationActive={false}
        />
        <YAxis domain={[minG, maxG]} hide />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── GravityChart ─────────────────────────────────────────────────────────────
// Full-size recharts chart for the detail view. Shows actual readings, target FG
// reference line, and a projected trend line extrapolated from recent readings.

function GravityChart({ readings, fermentation, height = 320 }) {
  const pitchDate = fermentation?.pitch_date ? new Date(fermentation.pitch_date + 'T00:00:00') : null
  const tFg = fermentation?.target_fg ? parseFloat(fermentation.target_fg) : null

  // Convert readings to chart data points keyed by days-since-pitch
  const actual = readings.map(r => ({
    day:     pitchDate ? Math.round((new Date(r.reading_date + 'T00:00:00') - pitchDate) / 86400000) : 0,
    gravity: parseFloat(r.gravity),
  }))

  // Calculate a simple linear projection from the last two readings
  const projected = []
  if (actual.length >= 2 && tFg !== null) {
    const last  = actual.at(-1)
    const prev  = actual.at(-2)
    const dayDelta = (last.day ?? 1) - (prev.day ?? 0)
    const gravDelta = last.gravity - prev.gravity
    if (dayDelta > 0 && gravDelta < 0) {
      const ratePerDay = gravDelta / dayDelta
      let g = last.gravity
      let d = last.day ?? 0
      for (let i = 0; i < 21; i++) {
        d += 1
        g = Math.max(g + ratePerDay, tFg)
        projected.push({ day: d, projected: parseFloat(g.toFixed(4)) })
        if (g <= tFg) break
      }
    }
  }

  // Merge actual and projected onto a single day-keyed array
  const dayMap = {}
  actual.forEach(p  => { dayMap[p.day] = { ...dayMap[p.day], day: p.day, gravity: p.gravity } })
  projected.forEach(p => { dayMap[p.day] = { ...dayMap[p.day], day: p.day, projected: p.projected } })
  // Connect the lines by adding the last actual value at the start of the projection
  if (projected.length > 0 && actual.length > 0) {
    const last = actual.at(-1)
    dayMap[last.day] = { ...dayMap[last.day], projected: last.gravity }
  }
  const chartData = Object.values(dayMap).sort((a, b) => (a.day ?? 0) - (b.day ?? 0))

  const allG = [...actual.map(p => p.gravity), ...projected.map(p => p.projected), tFg].filter(v => v != null)
  const minG = Math.min(...allG) - 0.003
  const maxG = Math.max(...allG) + 0.003

  if (readings.length === 0) {
    return (
      <div className="flex items-center justify-center bg-gray-50 rounded-lg" style={{ height }}>
        <p className="text-sm text-gray-400">No gravity readings yet. Log the first reading to see the chart.</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 10, right: 30, bottom: 30, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis
          dataKey="day"
          tickFormatter={v => `D${v}`}
          label={{ value: 'Days since pitch', position: 'insideBottom', offset: -15, fontSize: 11, fill: '#9CA3AF' }}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          domain={[minG, maxG]}
          tickFormatter={v => v.toFixed(3)}
          tick={{ fontSize: 11 }}
          width={55}
        />
        <Tooltip
          formatter={(v, name) => [v?.toFixed(4), name === 'gravity' ? 'Gravity' : 'Projected']}
          labelFormatter={d => `Day ${d}`}
          contentStyle={{ fontSize: 12 }}
        />
        {tFg !== null && (
          <ReferenceLine
            y={tFg}
            stroke="#9CA3AF"
            strokeDasharray="6 3"
            label={{ value: `Target FG: ${tFg.toFixed(3)}`, position: 'right', fontSize: 10, fill: '#9CA3AF' }}
          />
        )}
        <Line
          type="monotone"
          dataKey="gravity"
          stroke="#F59E0B"
          strokeWidth={2.5}
          dot={{ r: 4, fill: '#F59E0B', strokeWidth: 0 }}
          connectNulls={false}
          isAnimationActive={false}
          name="Actual"
        />
        <Line
          type="monotone"
          dataKey="projected"
          stroke="#CBD5E1"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
          name="Projected"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── VesselCard ───────────────────────────────────────────────────────────────
// One card per vessel. Shows the SVG tank, active fermentation info, mini chart,
// and action buttons.

function VesselCard({ vessel, fermentation, readings, onLogReading, onViewDetail, onAssignEmpty, isReadOnly }) {
  // Compute fill percentage from volume vs vessel capacity
  const fillPct = useMemo(() => {
    if (!fermentation || !fermentation.volume_in_fermenter) return fermentation ? 55 : 0
    if (!vessel.capacity) return 55
    return Math.min((parseFloat(fermentation.volume_in_fermenter) / parseFloat(vessel.capacity)) * 100, 100)
  }, [fermentation, vessel.capacity])

  const status = fermentation ? fermentation.status : 'empty'

  // Days since yeast was pitched
  const daysFermenting = fermentation?.pitch_date
    ? Math.floor((new Date() - new Date(fermentation.pitch_date + 'T00:00:00')) / 86400000)
    : null

  const latestReading = readings.at(-1) ?? null

  // Apparent attenuation: (OG - current) / (OG - 1.000) × 100
  const attenuation = useMemo(() => {
    if (!fermentation?.actual_og || !latestReading) return null
    const og = parseFloat(fermentation.actual_og)
    const fg = parseFloat(latestReading.gravity)
    return Math.round(((og - fg) / (og - 1.0)) * 100)
  }, [fermentation?.actual_og, latestReading])

  // Dry hop alert — scheduled, not completed, date has passed or is today
  const dryHopAlert = fermentation?.dry_hop_scheduled
    && !fermentation?.dry_hop_completed
    && fermentation?.dry_hop_date
    && fermentation.dry_hop_date <= new Date().toISOString().slice(0, 10)

  // Card border color reflects fermentation status
  const cardBorder =
    status === 'fermenting'       ? 'border-amber shadow-sm' :
    status === 'ready_to_package' ? 'border-green-400' :
    status === 'conditioning'     ? 'border-blue-200' :
    status === 'lagering'         ? 'border-indigo-200' :
    'border-gray-200'

  return (
    <div className={`bg-white rounded-xl border ${cardBorder} p-4 flex flex-col`}>

      {/* Top row: vessel info + status badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="font-bold text-navy text-sm truncate">{vessel.vessel_name}</h3>
          <p className="text-[11px] text-gray-400 truncate">
            {vessel.vessel_type}
            {vessel.capacity ? ` · ${vessel.capacity} ${vessel.capacity_unit}` : ''}
            {vessel.has_temperature_control ? ' · TC' : ''}
          </p>
        </div>
        {fermentation && (
          <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[status]}`}>
            {STATUS_LABELS[status]}
          </span>
        )}
      </div>

      {/* Active batch info */}
      {fermentation && (
        <div className="mb-2">
          <p className="font-bold text-navy truncate">{fermentation.beer_name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {fermentation.batch_number && (
              <span className="text-[10px] bg-navy/10 text-navy px-1.5 py-0.5 rounded font-bold">
                {fermentation.batch_number}
              </span>
            )}
            {daysFermenting !== null && (
              <span className="text-[11px] text-gray-500">Day {daysFermenting}</span>
            )}
          </div>
        </div>
      )}

      {/* SVG tank illustration — centered */}
      <div className="flex justify-center items-center py-2">
        <TankSVG uid={vessel.id} fillPct={fillPct} status={status} vesselType={vessel.vessel_type} />
      </div>

      {/* Gravity chart + stats — shown for assigned fermentations */}
      {fermentation && status !== 'pending_assignment' && (
        <div className="mt-2">
          <MiniSparkline
            readings={readings}
            targetFg={fermentation.target_fg}
            fermentation={fermentation}
          />
          <div className="flex justify-between text-[11px] text-gray-500 mt-1.5">
            <span>Target FG: {fermentation.target_fg ? parseFloat(fermentation.target_fg).toFixed(3) : '—'}</span>
            {latestReading && (
              <span>Latest: {parseFloat(latestReading.gravity).toFixed(3)}</span>
            )}
          </div>
          {attenuation !== null && (
            <p className="text-[11px] text-gray-500">{attenuation}% attenuated</p>
          )}
        </div>
      )}

      {/* Dry hop due alert badge */}
      {dryHopAlert && (
        <div className="mt-2 bg-amber/10 border border-amber/30 text-amber text-[11px] font-semibold px-2 py-1.5 rounded-lg text-center">
          🌿 Dry Hop Due
          {fermentation.dry_hop_date && ` · ${new Date(fermentation.dry_hop_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-auto pt-3">
        {!fermentation ? (
          <button
            onClick={onAssignEmpty}
            disabled={isReadOnly}
            className="flex-1 text-xs bg-amber hover:bg-amber-dark text-white rounded-lg py-2 font-semibold transition-colors disabled:opacity-50"
          >
            Assign Batch
          </button>
        ) : (
          <>
            <button
              onClick={() => onLogReading(fermentation)}
              disabled={isReadOnly}
              className="flex-1 text-xs bg-amber hover:bg-amber-dark text-white rounded-lg py-2 font-semibold transition-colors disabled:opacity-50"
            >
              Log Reading
            </button>
            <button
              onClick={() => onViewDetail(fermentation)}
              className="flex-1 text-xs border border-gray-300 text-gray-700 rounded-lg py-2 hover:bg-gray-50 transition-colors"
            >
              View Details
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── LogReadingModal ──────────────────────────────────────────────────────────
// Quick gravity entry modal — accessible from vessel card or detail tab.

function LogReadingModal({ fermentation, onClose, onSaved }) {
  const { brewery } = useAuth()
  const draft = useModalDraft('modal_draft_gravity_reading')

  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState(() => {
    const saved = draft.loadDraft()
    return saved ?? { date: today, gravity: '', temperature: '', notes: '', reading_type: 'gravity' }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Persist draft to sessionStorage whenever the form changes
  useEffect(() => { draft.saveDraft(form) }, [form])

  async function handleSave() {
    const g = parseFloat(form.gravity)
    if (!form.gravity || isNaN(g) || g < 0.99 || g > 1.2) {
      setError('Enter a valid gravity between 0.990 and 1.200')
      return
    }
    setSaving(true)
    const { error: err } = await supabase.from('gravity_readings').insert({
      fermentation_id: fermentation.id,
      brewery_id:      brewery.id,
      reading_date:    form.date || today,
      gravity:         g,
      temperature:     form.temperature ? parseFloat(form.temperature) : null,
      notes:           form.notes.trim() || null,
      reading_type:    form.reading_type,
    })
    if (err) { setError(err.message); setSaving(false); return }
    draft.clearDraft()
    onSaved()
  }

  const isDirty = !!(form.gravity || form.temperature || form.notes)

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      title={`Log Gravity Reading — ${fermentation.beer_name}`}
      isDirty={isDirty}
      draftRestored={draft.draftRestored}
      onDismissDraft={draft.dismissDraftBanner}
      maxWidth="max-w-md"
    >
      <div className="space-y-4 pt-2">
        {error && <p className="text-xs text-danger bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Date</label>
            <input type="date" className={INPUT_CLS}
              value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
            />
          </div>
          <div>
            <label className={LBL}>Reading type</label>
            <select className={INPUT_CLS}
              value={form.reading_type}
              onChange={e => setForm(p => ({ ...p, reading_type: e.target.value }))}
            >
              <option value="gravity">Gravity</option>
              <option value="pH">pH</option>
              <option value="dissolved_oxygen">Dissolved Oxygen</option>
              <option value="turbidity">Turbidity</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Gravity (required)</label>
            <input type="number" step="0.001" min="0.990" max="1.200" placeholder="1.048"
              className={INPUT_CLS}
              value={form.gravity}
              onChange={e => { setError(''); setForm(p => ({ ...p, gravity: e.target.value })) }}
            />
          </div>
          <div>
            <label className={LBL}>Temperature °F (optional)</label>
            <input type="number" step="0.1" placeholder="68"
              className={INPUT_CLS}
              value={form.temperature}
              onChange={e => setForm(p => ({ ...p, temperature: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label className={LBL}>Notes (optional)</label>
          <textarea rows={2} placeholder="Appearance, aroma, transfer notes..."
            className={INPUT_CLS}
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          />
        </div>

        {fermentation.target_fg && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            Target FG: <strong>{parseFloat(fermentation.target_fg).toFixed(3)}</strong>
            {form.gravity && parseFloat(form.gravity) > 0 && (
              <>
                {' · '}
                {parseFloat(form.gravity) <= parseFloat(fermentation.target_fg) + 0.003
                  ? <span className="text-success font-medium">At / near target ✓</span>
                  : <span className="text-gray-600">Still attenuating</span>
                }
              </>
            )}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Reading'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── AssignVesselModal ────────────────────────────────────────────────────────
// Links a pending fermentation to an empty vessel, sets status to 'fermenting'.

function AssignVesselModal({ preSelectedFermentation, preSelectedVessel, fermentations, vessels, onClose, onAssigned }) {
  const { brewery } = useAuth()
  const [fermId,   setFermId]   = useState(preSelectedFermentation?.id ?? (fermentations[0]?.id ?? ''))
  const [vesselId, setVesselId] = useState(preSelectedVessel?.id ?? (vessels[0]?.id ?? ''))
  const [saving, setSaving]     = useState(false)
  const [error,  setError]      = useState('')

  async function handleAssign() {
    if (!fermId)   { setError('Select a fermentation batch.'); return }
    if (!vesselId) { setError('Select a vessel.'); return }
    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)

    // Fetch the current fermentation to check pitch_date
    const { data: f } = await supabase.from('fermentations').select('pitch_date').eq('id', fermId).single()
    const update = {
      vessel_id:  vesselId,
      status:     'fermenting',
      ...(!f?.pitch_date && { pitch_date: today }),
    }
    const { error: err } = await supabase.from('fermentations').update(update).eq('id', fermId)
    if (err) { setError(err.message); setSaving(false); return }
    onAssigned()
  }

  return (
    <ModalShell isOpen onClose={onClose} title="Assign Vessel" maxWidth="max-w-md">
      <div className="space-y-4 pt-2">
        {error && <p className="text-xs text-danger bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        {fermentations.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No batches awaiting assignment. All fermentations have vessels assigned.
          </p>
        ) : (
          <>
            <div>
              <label className={LBL}>Fermentation batch</label>
              <select className={INPUT_CLS} value={fermId} onChange={e => setFermId(e.target.value)}>
                {fermentations.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.beer_name}{f.batch_number ? ` (${f.batch_number})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={LBL}>Vessel</label>
              {vessels.length === 0 ? (
                <p className="text-xs text-amber">No empty vessels available. All vessels have active fermentations.</p>
              ) : (
                <select className={INPUT_CLS} value={vesselId} onChange={e => setVesselId(e.target.value)}>
                  {vessels.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.vessel_name} — {v.vessel_type}{v.capacity ? ` (${v.capacity} ${v.capacity_unit})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <p className="text-xs text-gray-500 bg-amber/5 rounded-lg px-3 py-2">
              Assigning will set the fermentation status to <strong>Fermenting</strong> and record today as the pitch date if not already set.
            </p>

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={saving || vessels.length === 0}
                className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50"
              >
                {saving ? 'Assigning...' : 'Assign Vessel'}
              </button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  )
}

// ─── ManageVesselsModal ───────────────────────────────────────────────────────
// Lists all vessels with edit/deactivate, and an inline add form.

function ManageVesselsModal({ vessels, onClose, onChanged }) {
  const { brewery } = useAuth()

  const emptyForm = { vessel_name: '', vessel_type: 'Conical Fermenter', capacity: '', capacity_unit: 'barrels', has_temperature_control: false, location: '', notes: '' }
  const [editing, setEditing]   = useState(null)  // vessel object being edited, or null for new
  const [showAdd, setShowAdd]   = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [savingOrder, setSavingOrder] = useState(false)

  // Open the add form
  function openAdd() { setEditing(null); setForm(emptyForm); setShowAdd(true); setError('') }

  // Open edit form for an existing vessel
  function openEdit(v) {
    setEditing(v)
    setForm({
      vessel_name:             v.vessel_name ?? '',
      vessel_type:             v.vessel_type ?? 'Conical Fermenter',
      capacity:                v.capacity ?? '',
      capacity_unit:           v.capacity_unit ?? 'barrels',
      has_temperature_control: v.has_temperature_control ?? false,
      location:                v.location ?? '',
      notes:                   v.notes ?? '',
    })
    setShowAdd(true)
    setError('')
  }

  // Save new vessel or update existing
  async function handleSave() {
    if (!form.vessel_name.trim()) { setError('Vessel name is required.'); return }
    setSaving(true)
    const payload = {
      vessel_name:             form.vessel_name.trim(),
      vessel_type:             form.vessel_type,
      capacity:                form.capacity !== '' ? parseFloat(form.capacity) : null,
      capacity_unit:           form.capacity_unit,
      has_temperature_control: form.has_temperature_control,
      location:                form.location.trim() || null,
      notes:                   form.notes.trim() || null,
    }
    let err
    if (editing) {
      ;({ error: err } = await supabase.from('fermentation_vessels').update(payload).eq('id', editing.id))
    } else {
      const maxOrder = vessels.length > 0 ? Math.max(...vessels.map(v => v.sort_order ?? 0)) : -1
      ;({ error: err } = await supabase.from('fermentation_vessels').insert({
        ...payload, brewery_id: brewery.id, sort_order: maxOrder + 1,
      }))
    }
    if (err) { setError(err.message); setSaving(false); return }
    setShowAdd(false)
    setSaving(false)
    onChanged()
  }

  // Deactivate a vessel (soft delete — hides from dashboard but preserves history)
  async function handleDeactivate(v) {
    if (!window.confirm(`Deactivate "${v.vessel_name}"? It will be hidden from the dashboard but its history is preserved.`)) return
    await supabase.from('fermentation_vessels').update({ is_active: false }).eq('id', v.id)
    onChanged()
  }

  // Move a vessel up or down in the sort order
  async function moveVessel(idx, dir) {
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= vessels.length) return
    setSavingOrder(true)
    await Promise.all([
      supabase.from('fermentation_vessels').update({ sort_order: vessels[swapIdx].sort_order }).eq('id', vessels[idx].id),
      supabase.from('fermentation_vessels').update({ sort_order: vessels[idx].sort_order }).eq('id', vessels[swapIdx].id),
    ])
    setSavingOrder(false)
    onChanged()
  }

  const isDirty = form.vessel_name !== '' || form.capacity !== '' || form.location !== '' || form.notes !== ''

  return (
    <ModalShell isOpen onClose={onClose} title="Manage Vessels" isDirty={showAdd && isDirty} maxWidth="max-w-2xl">
      <div className="space-y-4 pt-2">

        {/* Vessel list */}
        {!showAdd && (
          <>
            {vessels.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No vessels configured yet.</p>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
                {vessels.map((v, idx) => (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                    {/* Reorder buttons */}
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveVessel(idx, -1)} disabled={idx === 0 || savingOrder}
                        className="text-gray-300 hover:text-gray-500 text-xs leading-none disabled:opacity-30">▲</button>
                      <button onClick={() => moveVessel(idx, 1)} disabled={idx === vessels.length - 1 || savingOrder}
                        className="text-gray-300 hover:text-gray-500 text-xs leading-none disabled:opacity-30">▼</button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-navy text-sm">{v.vessel_name}</p>
                      <p className="text-xs text-gray-400">
                        {v.vessel_type}
                        {v.capacity ? ` · ${v.capacity} ${v.capacity_unit}` : ''}
                        {v.has_temperature_control ? ' · Temp control' : ''}
                        {v.location ? ` · ${v.location}` : ''}
                      </p>
                    </div>
                    <button onClick={() => openEdit(v)} className="text-xs text-amber hover:underline shrink-0">Edit</button>
                    <button onClick={() => handleDeactivate(v)} className="text-xs text-gray-400 hover:text-danger shrink-0">Deactivate</button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={openAdd}
              className="w-full border-2 border-dashed border-amber/40 text-amber font-semibold rounded-xl py-3 text-sm hover:bg-amber/5 transition-colors">
              + Add Vessel
            </button>
            <div className="flex justify-end pt-1">
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
            </div>
          </>
        )}

        {/* Add / edit form */}
        {showAdd && (
          <>
            <h4 className="font-semibold text-navy text-sm">{editing ? `Edit ${editing.vessel_name}` : 'Add New Vessel'}</h4>
            {error && <p className="text-xs text-danger bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <div>
              <label className={LBL}>Vessel name (required)</label>
              <input className={INPUT_CLS} placeholder="Fermenter 1" value={form.vessel_name}
                onChange={e => { setError(''); setForm(p => ({ ...p, vessel_name: e.target.value })) }} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>Vessel type</label>
                <select className={INPUT_CLS} value={form.vessel_type}
                  onChange={e => setForm(p => ({ ...p, vessel_type: e.target.value }))}>
                  {VESSEL_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Location (optional)</label>
                <input className={INPUT_CLS} placeholder="Cellar" value={form.location}
                  onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>Capacity</label>
                <input type="number" step="0.1" className={INPUT_CLS} placeholder="7" value={form.capacity}
                  onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))} />
              </div>
              <div>
                <label className={LBL}>Capacity unit</label>
                <select className={INPUT_CLS} value={form.capacity_unit}
                  onChange={e => setForm(p => ({ ...p, capacity_unit: e.target.value }))}>
                  <option value="barrels">Barrels</option>
                  <option value="gallons">Gallons</option>
                </select>
              </div>
            </div>

            <div>
              <label className={LBL}>Notes (optional)</label>
              <textarea rows={2} className={INPUT_CLS} value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.has_temperature_control}
                onChange={e => setForm(p => ({ ...p, has_temperature_control: e.target.checked }))}
                className="w-4 h-4 accent-amber" />
              <span className="text-sm text-gray-700">Temperature control available</span>
            </label>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAdd(false)}
                className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm hover:bg-gray-50 transition-colors">
                Back
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : (editing ? 'Save Changes' : 'Add Vessel')}
              </button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  )
}

// ─── AddFermentationModal ─────────────────────────────────────────────────────
// Create a fermentation manually, not linked to a brew day.

function AddFermentationModal({ onClose, onSaved }) {
  const { brewery } = useAuth()
  const draft = useModalDraft('modal_draft_add_fermentation')

  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState(() => {
    const saved = draft.loadDraft()
    return saved ?? {
      beer_name: '', beer_style: '', batch_number: '', fermentation_type: 'standard',
      volume_in_fermenter: '', volume_unit: 'barrels',
      target_og: '', target_fg: '', target_abv: '',
      yeast_strain: '', yeast_generation: '1',
      pitch_date: today, pitch_temp: '', fermentation_temp_target: '',
    }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => { draft.saveDraft(form) }, [form])

  const f = (field) => ({ value: form[field] ?? '', onChange: e => setForm(p => ({ ...p, [field]: e.target.value })) })

  async function handleSave() {
    if (!form.beer_name.trim()) { setError('Beer name is required.'); return }
    setSaving(true)
    const { error: err } = await supabase.from('fermentations').insert({
      brewery_id:              brewery.id,
      beer_name:               form.beer_name.trim(),
      beer_style:              form.beer_style.trim() || null,
      batch_number:            form.batch_number.trim() || null,
      status:                  'pending_assignment',
      fermentation_type:       form.fermentation_type,
      volume_in_fermenter:     form.volume_in_fermenter !== '' ? parseFloat(form.volume_in_fermenter) : null,
      volume_unit:             form.volume_unit,
      target_og:               form.target_og !== '' ? parseFloat(form.target_og) : null,
      target_fg:               form.target_fg !== '' ? parseFloat(form.target_fg) : null,
      target_abv:              form.target_abv !== '' ? parseFloat(form.target_abv) : null,
      yeast_strain:            form.yeast_strain.trim() || null,
      yeast_generation:        form.yeast_generation !== '' ? parseInt(form.yeast_generation) : 1,
      pitch_date:              form.pitch_date || null,
      pitch_temp:              form.pitch_temp !== '' ? parseFloat(form.pitch_temp) : null,
      fermentation_temp_target: form.fermentation_temp_target !== '' ? parseFloat(form.fermentation_temp_target) : null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    draft.clearDraft()
    onSaved()
  }

  const isDirty = !!(form.beer_name || form.volume_in_fermenter || form.yeast_strain)

  return (
    <ModalShell
      isOpen onClose={onClose} title="Add Fermentation"
      isDirty={isDirty} draftRestored={draft.draftRestored} onDismissDraft={draft.dismissDraftBanner}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 pt-2">
        {error && <p className="text-xs text-danger bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className={LBL}>Beer name (required)</label>
            <input className={INPUT_CLS} placeholder="Hoppy IPA" {...f('beer_name')}
              onChange={e => { setError(''); setForm(p => ({ ...p, beer_name: e.target.value })) }} />
          </div>
          <div>
            <label className={LBL}>Beer style</label>
            <input className={INPUT_CLS} placeholder="West Coast IPA" {...f('beer_style')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Batch number</label>
            <input className={INPUT_CLS} placeholder="B-2024-042" {...f('batch_number')} />
          </div>
          <div>
            <label className={LBL}>Fermentation type</label>
            <select className={INPUT_CLS} {...f('fermentation_type')}>
              {Object.entries(FERM_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Volume in fermenter</label>
            <input type="number" step="0.1" className={INPUT_CLS} placeholder="7" {...f('volume_in_fermenter')} />
          </div>
          <div>
            <label className={LBL}>Volume unit</label>
            <select className={INPUT_CLS} {...f('volume_unit')}>
              <option value="barrels">Barrels</option>
              <option value="gallons">Gallons</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={LBL}>Target OG</label>
            <input type="number" step="0.001" className={INPUT_CLS} placeholder="1.065" {...f('target_og')} />
          </div>
          <div>
            <label className={LBL}>Target FG</label>
            <input type="number" step="0.001" className={INPUT_CLS} placeholder="1.012" {...f('target_fg')} />
          </div>
          <div>
            <label className={LBL}>Target ABV %</label>
            <input type="number" step="0.1" className={INPUT_CLS} placeholder="6.9" {...f('target_abv')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LBL}>Yeast strain</label>
            <input className={INPUT_CLS} placeholder="WY1056" {...f('yeast_strain')} />
          </div>
          <div>
            <label className={LBL}>Yeast generation</label>
            <input type="number" min="1" className={INPUT_CLS} placeholder="1" {...f('yeast_generation')} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={LBL}>Pitch date</label>
            <input type="date" className={INPUT_CLS} {...f('pitch_date')} />
          </div>
          <div>
            <label className={LBL}>Pitch temp °F</label>
            <input type="number" step="0.1" className={INPUT_CLS} placeholder="65" {...f('pitch_temp')} />
          </div>
          <div>
            <label className={LBL}>Ferm temp target °F</label>
            <input type="number" step="0.1" className={INPUT_CLS} placeholder="68" {...f('fermentation_temp_target')} />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg py-2.5 text-sm transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Add Fermentation'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── FermentationDetailModal ──────────────────────────────────────────────────
// Full detail view with four tabs: Overview, Gravity Log, Dry Hop, Notes.

function FermentationDetailModal({ fermentation: initialFerm, vessels, readings: initialReadings, onClose, onUpdated, onReadingChanged }) {
  const { brewery } = useAuth()
  const { isReadOnly } = useReadOnly()

  const [ferm, setFerm]         = useState(initialFerm)
  const [readings, setReadings] = useState(initialReadings)
  const [tab, setTab]           = useState('overview')
  const [saveStatus, setSaveStatus] = useState(null) // null | 'saving' | 'saved'
  const [statusChanging, setStatusChanging] = useState(false)
  const [showLogForm, setShowLogForm] = useState(false)
  const [logForm, setLogForm] = useState({ date: new Date().toISOString().slice(0, 10), gravity: '', temperature: '', notes: '' })
  const [logError, setLogError] = useState('')

  // Reload readings when the log changes externally (e.g. from vessel card Log Reading button)
  useEffect(() => { setReadings(initialReadings) }, [initialReadings])

  // Auto-save a single field to the fermentations table
  async function saveField(field, rawValue) {
    if (!ferm?.id || isReadOnly) return
    const value = rawValue === '' ? null : rawValue
    setSaveStatus('saving')
    const { error } = await supabase.from('fermentations').update({ [field]: value }).eq('id', ferm.id)
    if (error) { setSaveStatus(null); return }
    const updated = { ...ferm, [field]: value }
    setFerm(updated)
    onUpdated(updated)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus(s => s === 'saved' ? null : s), 2000)
  }

  // Controlled input helper — saves on blur
  function fi(field, type = 'text') {
    return {
      value: ferm?.[field] ?? '',
      disabled: isReadOnly,
      onChange: e => setFerm(p => ({ ...p, [field]: e.target.value })),
      onBlur: e => {
        const v = e.target.value.trim()
        saveField(field, type === 'number' ? (v === '' ? null : parseFloat(v)) : (v || null))
      },
    }
  }

  // Select helper — saves immediately on change
  function si(field) {
    return {
      value: ferm?.[field] ?? '',
      disabled: isReadOnly,
      onChange: e => { setFerm(p => ({ ...p, [field]: e.target.value })); saveField(field, e.target.value || null) },
    }
  }

  // Textarea helper — saves on blur
  function ti(field) {
    return {
      value: ferm?.[field] ?? '',
      disabled: isReadOnly,
      onChange: e => setFerm(p => ({ ...p, [field]: e.target.value })),
      onBlur: e => saveField(field, e.target.value.trim() || null),
    }
  }

  // Advance to a new status — validates preconditions
  async function changeStatus(newStatus) {
    if (newStatus === 'fermenting' && !ferm.vessel_id) {
      alert('Assign a vessel before moving to Fermenting.')
      return
    }
    if (newStatus === 'conditioning' && !ferm.actual_fg && readings.length === 0) {
      if (!window.confirm('No gravity readings logged. Continue to Conditioning anyway?')) return
    }
    if (!window.confirm(`Move this fermentation to "${STATUS_LABELS[newStatus]}"?`)) return

    setStatusChanging(true)
    const extra = {}
    if (newStatus === 'conditioning') extra.conditioning_start_date = new Date().toISOString().slice(0, 10)
    if (newStatus === 'packaged')     extra.actual_packaging_date   = new Date().toISOString().slice(0, 10)

    const { error } = await supabase.from('fermentations')
      .update({ status: newStatus, ...extra })
      .eq('id', ferm.id)

    if (!error) {
      const updated = { ...ferm, status: newStatus, ...extra }
      setFerm(updated)
      onUpdated(updated)
      if (newStatus === 'packaged') {
        alert('Batch marked as packaged! Batch to Sale tracking will be available in a future module.')
      }
    }
    setStatusChanging(false)
  }

  async function handleDump() {
    if (!window.confirm('Mark this fermentation as DUMPED? This cannot be undone.')) return
    setStatusChanging(true)
    await supabase.from('fermentations').update({ status: 'dumped' }).eq('id', ferm.id)
    const updated = { ...ferm, status: 'dumped' }
    setFerm(updated)
    onUpdated(updated)
    setStatusChanging(false)
    onClose()
  }

  // Log a gravity reading from within the detail modal
  async function saveInlineReading() {
    const g = parseFloat(logForm.gravity)
    if (!logForm.gravity || isNaN(g) || g < 0.99 || g > 1.2) {
      setLogError('Enter a valid gravity between 0.990 and 1.200')
      return
    }
    const { data, error } = await supabase.from('gravity_readings').insert({
      fermentation_id: ferm.id,
      brewery_id:      brewery.id,
      reading_date:    logForm.date || new Date().toISOString().slice(0, 10),
      gravity:         g,
      temperature:     logForm.temperature ? parseFloat(logForm.temperature) : null,
      notes:           logForm.notes.trim() || null,
      reading_type:    'gravity',
    }).select().single()
    if (error) { setLogError(error.message); return }
    setReadings(prev => [...prev, data].sort((a, b) => a.reading_date.localeCompare(b.reading_date)))
    setLogForm({ date: new Date().toISOString().slice(0, 10), gravity: '', temperature: '', notes: '' })
    setLogError('')
    setShowLogForm(false)
    onReadingChanged()
  }

  async function deleteReading(readingId) {
    if (!window.confirm('Delete this reading?')) return
    await supabase.from('gravity_readings').delete().eq('id', readingId)
    setReadings(prev => prev.filter(r => r.id !== readingId))
    onReadingChanged()
  }

  // Days since pitch, and estimated remaining based on latest attenuation rate
  const daysFermenting = ferm.pitch_date
    ? Math.floor((new Date() - new Date(ferm.pitch_date + 'T00:00:00')) / 86400000)
    : null

  const latestReading = readings.at(-1)
  const attenuation = ferm.actual_og && latestReading
    ? ((parseFloat(ferm.actual_og) - parseFloat(latestReading.gravity)) / (parseFloat(ferm.actual_og) - 1.0)) * 100
    : null

  const nextStatuses = STATUS_TRANSITIONS[ferm.status] ?? []

  const TABS = ['overview', 'gravity_log', 'dry_hop', 'notes']
  const TAB_LABELS = { overview: 'Overview', gravity_log: 'Gravity Log', dry_hop: 'Dry Hop', notes: 'Notes' }

  return (
    <ModalShell
      isOpen onClose={onClose}
      title={ferm.beer_name}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4 pt-1">

        {/* Status header row */}
        <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-gray-100">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[ferm.status]}`}>
            {STATUS_LABELS[ferm.status]}
          </span>
          {ferm.batch_number && (
            <span className="text-xs bg-navy/10 text-navy font-bold px-2 py-0.5 rounded">{ferm.batch_number}</span>
          )}
          {ferm.vessel_id && (
            <span className="text-xs text-gray-500">
              🧪 {vessels.find(v => v.id === ferm.vessel_id)?.vessel_name ?? 'Vessel'}
            </span>
          )}
          {daysFermenting !== null && (
            <span className="text-xs text-gray-500">Day {daysFermenting} fermenting</span>
          )}
          {saveStatus === 'saving' && <span className="text-xs text-gray-400 ml-auto">Saving…</span>}
          {saveStatus === 'saved'  && <span className="text-xs text-success ml-auto">Saved ✓</span>}
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-amber text-amber' : 'text-gray-500 hover:text-gray-700'}`}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* ── Tab: Overview ── */}
        {tab === 'overview' && (
          <div className="space-y-5">

            {/* Vessel assignment */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>Vessel</label>
                <select className={INPUT_CLS} {...si('vessel_id')} value={ferm.vessel_id ?? ''}>
                  <option value="">— Not assigned —</option>
                  {vessels.map(v => (
                    <option key={v.id} value={v.id}>{v.vessel_name} — {v.vessel_type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LBL}>Fermentation type</label>
                <select className={INPUT_CLS} {...si('fermentation_type')}>
                  {Object.entries(FERM_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>

            {/* Volume + OG */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={LBL}>Volume in fermenter</label>
                <input type="number" step="0.1" className={INPUT_CLS} placeholder="7.0" {...fi('volume_in_fermenter', 'number')} />
              </div>
              <div>
                <label className={LBL}>Volume unit</label>
                <select className={INPUT_CLS} {...si('volume_unit')}>
                  <option value="barrels">Barrels</option>
                  <option value="gallons">Gallons</option>
                </select>
              </div>
              <div>
                <label className={LBL}>Actual OG</label>
                <input type="number" step="0.001" className={INPUT_CLS} placeholder="1.065" {...fi('actual_og', 'number')} />
              </div>
              <div>
                <label className={LBL}>Target FG</label>
                <input type="number" step="0.001" className={INPUT_CLS} placeholder="1.012" {...fi('target_fg', 'number')} />
              </div>
            </div>

            {/* FG actuals + ABV */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={LBL}>Actual FG</label>
                <input type="number" step="0.001" className={INPUT_CLS} placeholder="1.010" {...fi('actual_fg', 'number')} />
              </div>
              <div>
                <label className={LBL}>Target ABV %</label>
                <input type="number" step="0.1" className={INPUT_CLS} placeholder="6.9" {...fi('target_abv', 'number')} />
              </div>
              <div>
                <label className={LBL}>Actual ABV %</label>
                <input type="number" step="0.01" className={INPUT_CLS} placeholder="auto"
                  value={ferm.actual_abv ?? (ferm.actual_og && ferm.actual_fg
                    ? ((parseFloat(ferm.actual_og) - parseFloat(ferm.actual_fg)) * 131.25).toFixed(2)
                    : '')}
                  disabled={isReadOnly}
                  onChange={e => setFerm(p => ({ ...p, actual_abv: e.target.value }))}
                  onBlur={e => saveField('actual_abv', e.target.value ? parseFloat(e.target.value) : null)}
                />
              </div>
              <div>
                <label className={LBL}>Attenuation</label>
                <p className="text-sm font-semibold text-navy py-2">
                  {attenuation !== null ? `${attenuation.toFixed(0)}%` : '—'}
                </p>
              </div>
            </div>

            {/* Yeast */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className={LBL}>Yeast strain</label>
                <input className={INPUT_CLS} placeholder="WY1056" {...fi('yeast_strain')} />
              </div>
              <div>
                <label className={LBL}>Yeast generation</label>
                <input type="number" min="1" className={INPUT_CLS} {...fi('yeast_generation', 'number')} />
              </div>
              <div>
                <label className={LBL}>Pitch temp °F</label>
                <input type="number" step="0.1" className={INPUT_CLS} {...fi('pitch_temp', 'number')} />
              </div>
            </div>

            {/* Dates + temps */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={LBL}>Pitch date</label>
                <input type="date" className={INPUT_CLS} {...fi('pitch_date')} />
              </div>
              <div>
                <label className={LBL}>Ferm temp target °F</label>
                <input type="number" step="0.1" className={INPUT_CLS} {...fi('fermentation_temp_target', 'number')} />
              </div>
              <div>
                <label className={LBL}>Est. completion</label>
                <input type="date" className={INPUT_CLS} {...fi('estimated_completion_date')} />
              </div>
              <div>
                <label className={LBL}>Target pkg date</label>
                <input type="date" className={INPUT_CLS} {...fi('target_packaging_date')} />
              </div>
            </div>

            {/* Transfer notes */}
            <div>
              <label className={LBL}>Transfer notes</label>
              <textarea rows={2} className={INPUT_CLS} placeholder="Notes on transfer from brew vessel..." {...ti('transfer_notes')} />
            </div>

            {/* Status progression */}
            {(nextStatuses.length > 0 || !['packaged', 'dumped'].includes(ferm.status)) && (
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Change status</p>
                <div className="flex flex-wrap gap-2">
                  {nextStatuses.map(ns => (
                    <button key={ns} onClick={() => changeStatus(ns)} disabled={statusChanging || isReadOnly}
                      className="text-xs bg-navy text-white rounded-lg px-3 py-1.5 hover:bg-navy-light transition-colors disabled:opacity-50">
                      → {STATUS_LABELS[ns]}
                    </button>
                  ))}
                  {!['packaged', 'dumped'].includes(ferm.status) && (
                    <button onClick={handleDump} disabled={statusChanging || isReadOnly}
                      className="text-xs border border-danger text-danger rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors disabled:opacity-50 ml-auto">
                      Dump Batch
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Gravity Log ── */}
        {tab === 'gravity_log' && (
          <div className="space-y-4">
            <GravityChart readings={readings} fermentation={ferm} height={320} />

            {/* Log reading button / inline form toggle */}
            {!showLogForm ? (
              <button onClick={() => setShowLogForm(true)} disabled={isReadOnly}
                className="text-sm bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg px-4 py-2 transition-colors disabled:opacity-50">
                + Log Reading
              </button>
            ) : (
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <h4 className="font-semibold text-navy text-sm">Log New Reading</h4>
                {logError && <p className="text-xs text-danger bg-red-50 rounded px-3 py-2">{logError}</p>}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className={LBL}>Date</label>
                    <input type="date" className={INPUT_CLS} value={logForm.date}
                      onChange={e => setLogForm(p => ({ ...p, date: e.target.value }))} />
                  </div>
                  <div>
                    <label className={LBL}>Gravity</label>
                    <input type="number" step="0.001" min="0.990" max="1.200" placeholder="1.048"
                      className={INPUT_CLS} value={logForm.gravity}
                      onChange={e => { setLogError(''); setLogForm(p => ({ ...p, gravity: e.target.value })) }} />
                  </div>
                  <div>
                    <label className={LBL}>Temp °F</label>
                    <input type="number" step="0.1" placeholder="68" className={INPUT_CLS} value={logForm.temperature}
                      onChange={e => setLogForm(p => ({ ...p, temperature: e.target.value }))} />
                  </div>
                  <div>
                    <label className={LBL}>Notes</label>
                    <input className={INPUT_CLS} placeholder="Optional" value={logForm.notes}
                      onChange={e => setLogForm(p => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowLogForm(false)}
                    className="text-sm border border-gray-300 text-gray-600 rounded-lg px-4 py-2 hover:bg-white transition-colors">
                    Cancel
                  </button>
                  <button onClick={saveInlineReading}
                    className="text-sm bg-amber hover:bg-amber-dark text-white font-semibold rounded-lg px-4 py-2 transition-colors">
                    Save Reading
                  </button>
                </div>
              </div>
            )}

            {/* Readings table */}
            {readings.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-200">
                      <th className="text-left pb-2">Date</th>
                      <th className="text-right pb-2">Gravity</th>
                      <th className="text-right pb-2">Temp °F</th>
                      <th className="text-left pb-2 pl-4">Notes</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {readings.map(r => (
                      <tr key={r.id}>
                        <td className="py-2 text-gray-600">
                          {new Date(r.reading_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                        <td className="py-2 text-right font-mono font-semibold text-navy">{parseFloat(r.gravity).toFixed(4)}</td>
                        <td className="py-2 text-right text-gray-500">{r.temperature ?? '—'}</td>
                        <td className="py-2 pl-4 text-gray-500 text-xs">{r.notes ?? ''}</td>
                        <td className="py-2 text-right">
                          <button onClick={() => deleteReading(r.id)} disabled={isReadOnly}
                            className="text-xs text-gray-300 hover:text-danger transition-colors disabled:opacity-30">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {readings.length === 0 && !showLogForm && (
              <p className="text-sm text-gray-400 text-center py-4">No readings logged yet.</p>
            )}
          </div>
        )}

        {/* ── Tab: Dry Hop & Additions ── */}
        {tab === 'dry_hop' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-3 cursor-pointer bg-gray-50 rounded-xl p-4">
                <input type="checkbox"
                  checked={ferm.dry_hop_scheduled ?? false}
                  disabled={isReadOnly}
                  onChange={e => saveField('dry_hop_scheduled', e.target.checked)}
                  className="w-4 h-4 accent-amber"
                />
                <div>
                  <p className="font-medium text-navy text-sm">Dry hop scheduled</p>
                  <p className="text-xs text-gray-400">Mark when a dry hop addition is planned</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer bg-gray-50 rounded-xl p-4">
                <input type="checkbox"
                  checked={ferm.dry_hop_completed ?? false}
                  disabled={isReadOnly}
                  onChange={e => saveField('dry_hop_completed', e.target.checked)}
                  className="w-4 h-4 accent-amber"
                />
                <div>
                  <p className="font-medium text-navy text-sm">Dry hop completed</p>
                  <p className="text-xs text-gray-400">Mark when dry hops have been added</p>
                </div>
              </label>
            </div>

            {ferm.dry_hop_scheduled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Dry hop date</label>
                  <input type="date" className={INPUT_CLS} {...fi('dry_hop_date')} />
                </div>
                <div>
                  <label className={LBL}>Lagering temp target °F</label>
                  <input type="number" step="0.1" className={INPUT_CLS} {...fi('lagering_temp_target', 'number')} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LBL}>Conditioning start date</label>
                <input type="date" className={INPUT_CLS} {...fi('conditioning_start_date')} />
              </div>
              <div>
                <label className={LBL}>Lagering duration (days)</label>
                <input type="number" min="1" className={INPUT_CLS} {...fi('lagering_duration_days', 'number')} />
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Notes ── */}
        {tab === 'notes' && (
          <div className="space-y-4">
            <div>
              <label className={LBL}>Transfer notes</label>
              <textarea rows={4} className={INPUT_CLS}
                placeholder="Notes on transfer from brew vessel to fermenter — observations, issues, volumes..."
                {...ti('transfer_notes')}
              />
            </div>
            <div>
              <label className={LBL}>Fermentation notes</label>
              <textarea rows={6} className={INPUT_CLS}
                placeholder="General fermentation observations, temperature changes, krausen height, aroma..."
                {...ti('notes')}
              />
            </div>
          </div>
        )}

        {/* Close button */}
        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button onClick={onClose}
            className="text-sm border border-gray-300 text-gray-600 rounded-lg px-5 py-2.5 hover:bg-gray-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
